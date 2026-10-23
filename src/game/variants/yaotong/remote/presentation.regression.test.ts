import { effectScope, nextTick, ref } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act } from '../engine'
import { player, table } from '../auditFixtures'
import { useYaotongGame } from '../useYaotongGame'
import { useYaotongPort } from '../useYaotongPort'
import { createReplayRecorder } from '../../../replay/recorder'
import { buildReplayFrames } from '../../../replay/projection'
import type { ReplayRound, ReplayMatch } from '../../../replay/types'
import { useRemoteContinueCountdown } from '../../../online/presentation/useRemoteContinueCountdown'
import type { GameMode } from '../../../core/contracts/activeGamePort'

const external = () => ({ send: vi.fn(), nextRound: vi.fn(), leave: vi.fn(),
  openingDone: vi.fn(), auto: vi.fn(), hold: vi.fn() })
let scope: ReturnType<typeof effectScope>
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('window', globalThis)
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  scope = effectScope()
})
afterEach(() => { scope.stop(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals() })

function settled() {
  const state = table()
  state.remoteMatchId = 'match-a'
  state.players[0] = player('234567m 234s 66p 789s', { drawn: 26 })
  expect(act(state, 0, { type: 'hu' })).toBe(true)
  return state
}

it('starts the shared WS continue countdown only after the reveal has finished', async () => {
  const authority = external()
  const remote = scope.run(() => useYaotongGame({ externalAuthority: authority }))!
  const port = scope.run(() => useYaotongPort({}, remote))!
  const countdown = scope.run(() => useRemoteContinueCountdown({
    gameMode: ref<GameMode>('remote'), phase: port.phase, result: port.result,
    matchFinished: port.matchFinished, waitingNextRound: ref(false), continueRound: () => { port.nextRound() },
  }))!
  remote.acceptRemoteState(settled())
  expect(remote.showingSettlement.value).toBe(true)
  await vi.advanceTimersByTimeAsync(1229)
  expect(port.result.value).toBeNull()
  expect(countdown.value).toBe(10)
  await vi.advanceTimersByTimeAsync(1)
  expect(port.result.value).not.toBeNull()
  await vi.advanceTimersByTimeAsync(9000)
  expect(countdown.value).toBe(1)
  expect(authority.nextRound).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1000)
  expect(authority.nextRound).toHaveBeenCalledOnce()
})

it('hybrid selection follows the active source in both directions', async () => {
  const mode = ref('local')
  const local = scope.run(() => useYaotongGame())!
  const remote = scope.run(() => useYaotongGame({ externalAuthority: external() }))!
  const proxy = new Proxy({} as typeof local, { get: (_, key) => (mode.value === 'remote' ? remote : local)[key as keyof typeof local] })
  const port = scope.run(() => useYaotongPort({}, proxy))!
  mode.value = 'remote'
  remote.acceptRemoteState(table())
  port.selectTile(3)
  await nextTick()
  expect(port.selectedIndex.value).toBe(3)
  port.selectedIndex.value = 5
  expect(remote.selected.value).toBe(5)
  expect(local.selected.value).toBe(-1)
  mode.value = 'local'
  expect(port.selectedIndex.value).toBe(-1)
})

it('hidden opponents show a separate drawn tile and the public added-kong tile during the rob window', () => {
  const remote = scope.run(() => useYaotongGame({ externalAuthority: external() }))!
  const port = scope.run(() => useYaotongPort({}, remote))!
  const state = table()
  state.current = 1
  state.players[1].hand = []
  state.players[1].drawn = null
  state.players[1].concealedTileCount = 14
  remote.acceptRemoteState(state)
  expect(port.players[1].drawnTileIndex).toBe(13)
  const kong = structuredClone(state)
  kong.phase = 'transition'
  kong.remoteFlowStep = 'before-rob'
  kong.players[1].concealedTileCount = 11
  kong.players[1].melds = [{ tile: 4, kind: 'peng', from: 3, pre: false, chicken: 0, responsibility: 0 }]
  kong.pending = { kind: 'rob', tile: 4, from: 1, discard: null, options: {}, choices: {} }
  remote.acceptRemoteState(kong)
  expect(port.phase.value).toBe('kong')
  expect(port.players[1].hand).toEqual([])
  expect(port.players[1].concealedTileCount).toBe(10)
  expect(port.players[1].melds[0]).toMatchObject({ pending: true, tiles: ['m5', 'm5', 'm5', 'm5'] })
})

it.each([false, true])('报牌等待期间收到快照，只有换局才取消声音：newHand=%s', async newHand => {
  const remote = scope.run(() => useYaotongGame({ externalAuthority: external() }))!
  const playSoundAndWait = vi.fn().mockResolvedValue(undefined)
  scope.run(() => useYaotongPort({ playSoundAndWait }, remote))!
  const state = table()
  state.remoteMatchId = 'same-match'
  state.serial = 2
  state.events = [{ id: 2, seat: 1, kind: 'discard', tile: 4, text: '打出五万' }]
  remote.acceptRemoteState(state)
  const update = structuredClone(state)
  if (newHand) { update.handNumber++; update.serial = 0; update.events = [] }
  remote.acceptRemoteState(update)
  await vi.advanceTimersByTimeAsync(80)
  expect(playSoundAndWait).toHaveBeenCalledTimes(newHand ? 0 : 1)
})

it('continue and repeated snapshots keep one settlement; a new hand clears every display state', async () => {
  const authority = external()
  const remote = scope.run(() => useYaotongGame({ externalAuthority: authority }))!
  const port = scope.run(() => useYaotongPort({}, remote))!
  const end = settled()
  remote.acceptRemoteState(end)
  await vi.advanceTimersByTimeAsync(10_000)
  const result = port.result.value
  expect(result).not.toBeNull()
  port.nextRound()
  expect(authority.nextRound).toHaveBeenCalledOnce()
  remote.acceptRemoteState(structuredClone(end))
  await vi.advanceTimersByTimeAsync(10_000)
  expect(port.result.value).toBe(result)
  const next = table()
  next.remoteMatchId = 'match-a'
  next.handNumber = 2
  remote.acceptRemoteState(next)
  expect(port.result.value).toBeNull()
  expect(port.revealHands.value).toBe(false)
  expect(port.winEffect.value).toBeNull()
  expect(port.phase.value).toBe('discard')
})

it('rejoining during settlement does not cancel the timeline, and restarting the room clears it', async () => {
  const remote = scope.run(() => useYaotongGame({ externalAuthority: external() }))!
  const port = scope.run(() => useYaotongPort({}, remote))!
  remote.acceptRemoteState(settled())
  await port.startGame('east', { skipOpening: true })
  await vi.advanceTimersByTimeAsync(10_000)
  expect(port.result.value).not.toBeNull()
  const next = table()
  next.remoteMatchId = 'match-b'
  remote.acceptRemoteState(next)
  expect(port.result.value).toBeNull()
  expect(port.phase.value).toBe('discard')
})

it('opening deals the full table using hidden tile counts and keeps remote identity', async () => {
  const remote = scope.run(() => useYaotongGame({ externalAuthority: external() }))!
  const port = scope.run(() => useYaotongPort({}, remote))!
  const state = table()
  state.wall = Array(56).fill(0)
  state.phase = 'original'
  for (let seat = 1; seat < 4; seat++) {
    state.players[seat].hand = []
    state.players[seat].concealedTileCount = 13
    state.players[seat].playerKind = 'human'
    state.players[seat].avatar = `https://example.com/p${seat}.png`
    state.players[seat].characterId = 'qwen'
  }
  remote.acceptRemoteState(state)
  const opening = port.startGame('east')
  expect(port.wallCount.value).toBe(108)
  await vi.advanceTimersByTimeAsync(20_000)
  await opening
  expect(port.phase.value).not.toBe('dealing')
  expect(port.players.map(p => p.concealedTileCount)).toEqual([13, 13, 13, 13])
  expect(port.players[1]).toMatchObject({ playerKind: 'human', avatar: 'https://example.com/p1.png', characterId: 'qwen', hand: [] })
  expect(port.wallCount.value).toBe(56)
})

it('records remote snapshots once per round, deduplicates events, and retains hidden hand counts', () => {
  const rounds: ReplayRound[] = [], matches: ReplayMatch[] = []
  const recorder = createReplayRecorder({ meta: () => ({ rulesetId: 'yaotong', rulesetName: '幺筒麻将', themeName: 'jade', humanSeat: 0 }),
    sink: { saveRound: value => { rounds.push(value) }, saveMatch: value => { matches.push(value) } } })
  const remote = scope.run(() => useYaotongGame({ externalAuthority: external() }))!
  scope.run(() => useYaotongPort({ recorder: recorder.hooks }, remote))!
  const state = table()
  state.remoteMatchId = 'match-a'
  state.players[0] = player('234567m 234s 66p 789s', { drawn: 26 })
  const hidden = structuredClone(state)
  for (let seat = 1; seat < 4; seat++) {
    hidden.players[seat].concealedTileCount = 13
    hidden.players[seat].hand = []
  }
  remote.acceptRemoteState(hidden)
  const observed = structuredClone(hidden)
  observed.serial += 1
  observed.events.push({ id: observed.serial, seat: 2, kind: 'draw', text: '摸牌' })
  observed.players[2].concealedTileCount = 14
  remote.acceptRemoteState(observed)
  remote.acceptRemoteState(structuredClone(observed))
  state.serial = observed.serial
  state.events = observed.events
  act(state, 0, { type: 'hu' })
  remote.acceptRemoteState(structuredClone(state))
  remote.acceptRemoteState(structuredClone(state))
  expect(recorder.snapshot().stats).toMatchObject({ roundStarts: 1, roundEnds: 1 })
  expect(rounds).toHaveLength(1)
  expect(rounds[0].steps.filter(step => step.t === 'draw')).toHaveLength(1)
  expect(rounds[0].steps.filter(step => step.t === 'win')).toHaveLength(1)
  expect(rounds[0].final?.yaotongState?.result).toEqual(state.result)
  const frames = buildReplayFrames(matches.at(-1)!, rounds[0], { revealAll: true })
  expect(frames[0].table.players![1].concealedTileCount).toBe(13)
  expect(frames[0].table.players![1].hand).toEqual([])
  expect(frames[0].table.revealHands).toBe(false)
  expect(frames[1].table.players![2].concealedTileCount).toBe(14)
  expect(frames.at(-1)!.table.revealHands).toBe(true)
  const next = table()
  next.remoteMatchId = 'match-a'
  next.handNumber = 2
  next.repeats = 1
  remote.acceptRemoteState(next)
  expect(recorder.snapshot().stats.roundStarts).toBe(2)
})
