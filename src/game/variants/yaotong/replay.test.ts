import { effectScope } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import { createReplayRecorder } from '../../replay/recorder'
import { useReplayRecorder } from '../../replay/useReplayRecorder'
import { createMemoryDriver } from '../../replay/idb'
import { createReplayStorage } from '../../replay/storage'
import { buildReplayFrames } from '../../replay/projection'
import { buildReplayExport } from '../../replay/export'
import { parseReplayImport } from '../../replay/importReplay'
import type { ReplayFrameSource, ReplayMatch, ReplayRound } from '../../replay/types'
import { createGame, act } from './engine'
import { chooseAction } from './ai'
import { recordYaotongRound, yaotongReplayFrame } from './replay'
import { player, table } from './auditFixtures'
import { useYaotongPort } from './useYaotongPort'
import { replayMatchSummary, stepSummary } from '../../replay/format'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

function recording() {
  const matches: ReplayMatch[] = [], rounds: ReplayRound[] = [], frames: ReplayFrameSource[] = []
  const recorder = createReplayRecorder({
    meta: () => ({ rulesetId: 'yaotong', rulesetName: '幺筒麻将', themeName: 'llm', humanSeat: 0, yaotongMode: 'easy' }),
    sink: { saveMatch: (match) => { matches.push(match) }, saveRound: (round) => { rounds.push(round) } },
  })
  const hooks = { ...recorder.hooks, step: ((event, frame) => {
    frames.push(structuredClone(frame))
    recorder.hooks.step!(event, frame)
  }) as NonNullable<typeof recorder.hooks.step> }
  return { recorder, hooks, matches, rounds, frames }
}

it('整局逐事件精确记录：摸打、原报、墙数、分数、全知/当时视角和导出回读一致', () => {
  let seed = 41
  const state = createGame({ dealer: 0, dice: [2, 3], random: () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) })
  const recorded = recording()
  const stop = recordYaotongRound(state, recorded.hooks)
  for (let n = 0; n < 1000 && !state.result; n++) {
    for (let seat = 0; seat < 4 && !state.result; seat++) {
      const command = chooseAction(state, seat)
      if (command) expect(act(state, seat, command)).toBe(true)
    }
  }
  expect(state.result).not.toBeNull()
  const match = recorded.recorder.finishAuto()!
  stop()
  const round = recorded.rounds[0]
  expect(round.steps.length).toBeGreaterThan(10)
  expect(round.steps).toHaveLength(recorded.frames.length)
  const frames = buildReplayFrames(match, round, { revealAll: true })
  recorded.frames.forEach((actual, index) => {
    const replay = frames[index + 1]
    expect(replay.table.players!.map((p) => [p.hand, p.melds, p.discards, p.score])).toEqual(
      actual.players.map((p) => [p.hand, p.melds, p.discards, p.score]))
    expect(replay.table.wallTotal).toBe(108)
    expect(replay.table.laiziOnly).toBe(true)
    expect(replay.table.wallCount).toBe(actual.wallLeft)
    expect(replay.table.wallHeadDrawn).toBe(actual.headDrawn)
    expect(replay.yaotongSeats).toEqual(actual.yaotongSeats)
  })
  expect(frames.at(-1)!.scores).toEqual(state.players.map((p) => p.score))
  expect(round.final!.yaotongState!.result).toEqual(state.result)
  expect(buildReplayFrames(match, round, { revealAll: false })[1].table.revealHands).toBe(false)
  const imported = parseReplayImport(buildReplayExport(match, recorded.rounds))
  expect(imported.ok).toBe(true)
  expect(imported.rounds[0].final!.yaotongState!.result).toEqual(state.result)
})

it('暗杠与补摸分别记录，杠完成但尚未补摸时不提前扣牌尾', () => {
  const state = table()
  state.players[0] = player('1111m 234567s 234p 5p', { drawn: 13 })
  const recorded = recording()
  const stop = recordYaotongRound(state, recorded.hooks)
  act(state, 0, { type: 'kong', tile: 0 })
  expect(recorded.frames).toHaveLength(2)
  expect(recorded.frames[0].players[0].hand).toHaveLength(10)
  expect(recorded.frames[1].players[0].hand).toHaveLength(11)
  expect(recorded.frames[1].wallLeft).toBe(recorded.frames[0].wallLeft - 1)
  expect(recorded.frames[1].headDrawn).toBe(recorded.frames[0].headDrawn)
  stop()
})

it('原报和报听保留独立事件，弃牌先入河再生成记录', () => {
  const state = table()
  state.phase = 'original'
  state.players[0] = player('234567m 234s 66p 78s')
  const recorded = recording()
  const events: string[] = []
  const hooks = { ...recorded.hooks, step: ((event, frame) => {
    events.push(event.text ?? '')
    recorded.hooks.step!(event, frame)
  }) as NonNullable<typeof recorded.hooks.step> }
  const stop = recordYaotongRound(state, hooks)
  act(state, 0, { type: 'original', declare: true })
  expect(events).toEqual(['原报 · 锁定听口'])
  expect(recorded.frames[0].yaotongSeats![0].declaration).toBe('original')
  stop()
  state.phase = 'discard'
  state.players[0] = player('234567m 234s 66p 78s 9m', { draws: 1, drawn: 8 })
  const stopNext = recordYaotongRound(state, hooks)
  act(state, 0, { type: 'discard', index: 13, declare: true })
  expect(events.slice(1, 3)).toEqual(['打出九万', '报听 · 锁定听口'])
  expect(recorded.frames[1].players[0].discards).toEqual(['m9'])
  expect(recorded.frames[2].yaotongSeats![0].declaration).toBe('ready')
  stopNext()
})

it('杠掉刚摸的第四张牌后，补摸前不能把另一张牌误标为刚摸到', () => {
  const state = table()
  state.players[0] = player('111m 234567s 234p 5p 1m', { drawn: 0 })
  const recorded = recording()
  const stop = recordYaotongRound(state, recorded.hooks)
  act(state, 0, { type: 'kong', tile: 0 })
  expect(recorded.frames[0].players[0].drawnTileIndex).toBe(-1)
  expect(recorded.frames[1].players[0].drawnTileIndex).toBe(10)
  stop()
})

it('包牌保留真实原因和账本，列表摘要不会误写荒庄', () => {
  const state = table()
  state.players[0] = player('147m 258p 369s 2468s 1p', { chickenPeng: true })
  const recorded = recording()
  const stop = recordYaotongRound(state, recorded.hooks)
  act(state, 0, { type: 'discard', index: 13 })
  const match = recorded.recorder.finishAuto()!
  expect(match.summary).toContain('包牌')
  expect(match.summary).not.toContain('荒庄')
  const round = recorded.rounds[0]
  expect(round.final!.yaotongState!.result).toMatchObject({ kind: 'penalty', offender: 0 })
  expect(stepSummary(round.steps.at(-1)!)).toContain('同巡碰鸡后打鸡')
  expect(round.steps[0].snapshot!.discards[0]).toEqual(['p1'])
  stop()
})

it('一炮多响保留全部赢家手牌、真实分数和翻鸡指示牌，后退不残留指示牌', () => {
  const state = table()
  state.players[0] = player('147m 258p 369s 2468s 9s', { drawn: 26 })
  for (const seat of [1, 2]) state.players[seat] = player('234567m 234s 66p 78s', { declaration: 'ready' })
  const recorded = recording()
  const stop = recordYaotongRound(state, recorded.hooks)
  act(state, 0, { type: 'discard', index: 13 })
  for (const seat of [1, 2, 3]) if (state.pending?.options[seat])
    act(state, seat, { type: 'respond', action: seat < 3 ? 'hu' : 'pass' })
  const match = recorded.recorder.finishAuto()!
  expect(state.result!.winners).toEqual([1, 2])
  const round = recorded.rounds[0], frames = buildReplayFrames(match, round, { revealAll: true })
  const end = frames.at(-1)!
  expect(end.table.players!.slice(1, 3).map((p) => p.hand.length)).toEqual([14, 14])
  expect(end.scores).toEqual(state.players.map((p) => p.score))
  expect(end.table.settlementIndicator?.seat).toBe(1)
  expect(end.table.settlementIndicator?.tile).toBe('p9')
  expect(frames[0].table.settlementIndicator).toBeNull()
  expect(replayMatchSummary(recorded.rounds, match.players, 0)).toContain('一炮2响')
  stop()
})

it.each([0, 1])('全庄第16庄由%s胡牌，按是否轮庄决定场次完成，不能套用半庄8局', (winner) => {
  const state = table()
  state.matchLength = 16
  state.dealerRound = 16
  state.current = winner
  state.players[winner] = player('234567m 234s 66p 789s', { drawn: 26 })
  const recorded = recording()
  const stop = recordYaotongRound(state, recorded.hooks)
  act(state, winner, { type: 'hu' })
  expect(recorded.rounds[0].roundLabel).toBe('北4局')
  const match = recorded.recorder.finishAuto()!
  expect(match.matchName).toBe('全庄场')
  expect(match.status).toBe(winner === 0 ? 'aborted' : 'finished')
  stop()
})

it('真实端口自动接线，每局结束即入库，返回大厅后保留；录制写入失败不影响结算', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('window', globalThis)
  const scope = effectScope()
  try {
    const storage = createReplayStorage({ driver: createMemoryDriver() })
    const replay = scope.run(() => useReplayRecorder({ storage,
      meta: () => ({ rulesetId: 'yaotong', rulesetName: '幺筒麻将', themeName: 'jade', humanSeat: 0 }) }))!
    const game = scope.run(() => useYaotongPort({ recorder: replay.hooks }))!
    game.local.begin(4, { dealer: 0, dice: [2, 3] })
    game.local.autoplay.value = true
    await vi.runAllTimersAsync()
    expect(game.local.state.value!.result).not.toBeNull()
    await replay.flush()
    expect(await storage.list()).toHaveLength(1)
    const match = (await storage.list())[0]
    expect((await storage.loadRounds(match.id))[0].final!.scores).toEqual(game.local.state.value!.players.map((p) => p.score))
    game.returnToLobby()
    replay.finishAuto()
    await replay.flush()
    expect(await storage.list()).toHaveLength(1)
    const state = table()
    state.players[0] = player('234567m 234s 66p 789s', { drawn: 26 })
    const stop = recordYaotongRound(state, { ...replay.hooks, step() { throw new Error('quota') } })
    expect(act(state, 0, { type: 'hu' })).toBe(true)
    expect(state.result?.kind).toBe('win')
    stop()
  } finally { scope.stop() }
})
