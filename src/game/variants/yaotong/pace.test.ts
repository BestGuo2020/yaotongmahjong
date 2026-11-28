import { effectScope, nextTick, type EffectScope } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AI_DELAYS } from '../../core/controllers/playerController'
import { PACE_MS } from '../../core/local/localGameConfig'
import { OPENING_PACE_MS } from '../../shared/runtime/localOpening'
import { DISCARD_WIN_EFFECT_DELAY } from '../../shared/settlement/settlementTimeline'
import {
  WIN_CUE_LEAD_DURATION,
  WIN_CUE_EXIT_DURATION,
  WIN_EFFECT_DURATION,
  WIN_REVEAL_DURATION,
  WIN_EFFECT_SOUND_DELAY,
  REDUCED_WIN_CUE_LEAD_DURATION,
  REDUCED_WIN_CUE_EXIT_DURATION,
  REDUCED_WIN_EFFECT_DURATION,
  REDUCED_WIN_REVEAL_DURATION,
} from '../../core/presentation/winEffect'
import { createGame, makePlayer } from './engine'
import * as tableAi from './ai'
import { YAOTONG_AI_DISCARD_MS, YAOTONG_AI_KONG_DISCARD_MS, YAOTONG_REACTION_MS, YAOTONG_EXTENDED_REACTION_MS } from './useYaotongGame'
import { KONG_WEATHER_DURATION } from './kongPresentation'
import { countsOf } from './tiles'
import { ownedTiles } from './settlement'
import { fromSharedTile, useYaotongPort } from './useYaotongPort'
import type { TileType } from '../../core/contracts/types'
import type { GameState } from './types'

const scopes: EffectScope[] = []
function setup(options: Parameters<typeof useYaotongPort>[0] = {}) {
  const scope = effectScope()
  scopes.push(scope)
  return scope.run(() => useYaotongPort(options))!
}
function tiles(text: string) {
  return text
    .split(' ')
    .flatMap((group) => [...group.slice(0, -1)].map((n) => fromSharedTile(`${group.at(-1)}${n}` as TileType)))
}
function fixture(): GameState {
  const state = createGame({ dealer: 0, dice: [2, 3] })
  state.phase = 'discard'
  state.current = 0
  state.wall = [2, 5, 8, 11, 14, 17, 21, 25, 26]
  state.players = [0, 1, 2, 3].map(() => ({
    ...makePlayer(),
    hand: tiles('147m 258p 369s 2468s'),
    draws: 2,
    discards: 1,
  }))
  return state
}
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => (resolve = r))
  return { promise, resolve }
}
const normalWinTime =
  WIN_CUE_LEAD_DURATION + WIN_CUE_EXIT_DURATION + WIN_EFFECT_DURATION + WIN_REVEAL_DURATION
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('window', globalThis) })
afterEach(() => {
  scopes.splice(0).forEach((s) => s.stop())
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('原版节奏与幺筒实时对局的边界', () => {
  it('无人响应：落牌1000ms后摸牌，AI再思考1000ms，不同一帧摸打', async () => {
    const port = setup(),
      state = fixture()
    state.players[0].hand.push(4)
    port.local.state.value = state
    port.userDiscard(13)
    expect(state.phase).toBe('transition')
    expect(state.players[1].hand).toHaveLength(13)
    expect(port.isUserTurn.value).toBe(false)
    const serial = state.serial
    port.userDiscard(0)
    expect(state.serial).toBe(serial)
    await vi.advanceTimersByTimeAsync(YAOTONG_REACTION_MS - 1)
    expect(state.players[1].hand).toHaveLength(13)
    await vi.advanceTimersByTimeAsync(1)
    expect(state.players[1].hand).toHaveLength(14)
    expect(state.players[1].river).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(YAOTONG_AI_DISCARD_MS - 1)
    expect(state.players[1].river).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(state.players[1].river).toHaveLength(1)
  })

  it('空闲时预算 AI 动作，并按原定时刻出牌', async () => {
    const decide = vi.spyOn(tableAi, 'chooseAction')
    const requestIdle = vi.fn((callback: IdleRequestCallback) => {
      return setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 10 }), 1)
    })
    const cancelIdle = vi.fn(clearTimeout)
    vi.stubGlobal('requestIdleCallback', requestIdle)
    vi.stubGlobal('cancelIdleCallback', cancelIdle)
    try {
      const port = setup(), state = fixture()
      state.current = 1
      state.players[1].hand.push(4)
      port.local.state.value = state
      await nextTick()
      await vi.advanceTimersByTimeAsync(1)
      expect(decide).toHaveBeenCalledTimes(1)
      expect(state.players[1].river).toHaveLength(0)
      await vi.advanceTimersByTimeAsync(YAOTONG_AI_DISCARD_MS - 1)
      expect(state.players[1].river).toHaveLength(1)
      expect(decide).toHaveBeenCalledTimes(1)
      expect(cancelIdle).toHaveBeenCalledWith(requestIdle.mock.results[0].value)
    } finally {
      decide.mockRestore()
    }
  })

  it('碰牌留牌1000ms，AI碰后1000ms再出牌', async () => {
    const port = setup(),
      state = fixture()
    state.players[0].hand.push(4)
    state.players[1].hand = tiles('55m 147m 258p 369s 24s')
    port.local.state.value = state
    port.userDiscard(13)
    await vi.advanceTimersByTimeAsync(YAOTONG_REACTION_MS - 1)
    expect(state.players[1].melds).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(state.players[1].melds[0]?.kind).toBe('peng')
    await vi.advanceTimersByTimeAsync(YAOTONG_AI_DISCARD_MS - 1)
    expect(state.players[1].river).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(state.players[1].river).toHaveLength(1)
  })

  it('真人碰后350ms才开放出牌；明杠补牌550ms，补摸后2000ms才出牌', async () => {
    const human = setup(),
      s = fixture()
    s.current = 1
    s.players[1].hand.push(4)
    s.players[0].hand = tiles('55m 147m 258p 369s 24s')
    human.local.state.value = s
    human.local.dispatch({ type: 'discard', index: 13 }, 1)
    human.userPeng()
    expect(human.isUserTurn.value).toBe(false)
    await vi.advanceTimersByTimeAsync(YAOTONG_REACTION_MS)
    await vi.advanceTimersByTimeAsync(PACE_MS.skipDrawPengDelay)
    expect(human.isUserTurn.value).toBe(true)

    const port = setup(),
      state = fixture()
    state.players[0].hand.push(4)
    state.players[1].hand = tiles('555m 147m 258p 369s 2s')
    port.local.state.value = state
    port.userDiscard(13)
    await vi.advanceTimersByTimeAsync(YAOTONG_REACTION_MS)
    expect(state.players[1].melds[0]?.kind).toBe('open')
    const wallCount = state.wall.length
    await vi.advanceTimersByTimeAsync(PACE_MS.afterClaimGang - 1)
    expect(state.wall).toHaveLength(wallCount)
    await vi.advanceTimersByTimeAsync(1)
    expect(state.wall).toHaveLength(wallCount - 1)
    expect(state.players[1].afterKong).toBe(true)
    await vi.advanceTimersByTimeAsync(YAOTONG_AI_KONG_DISCARD_MS - 1)
    expect(state.players[1].river).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(state.players[1].river).toHaveLength(1)
    // 开杠天气/播报约 2.2s：补摸后的出牌不能落在特效里，否则玩家看不清也来不及应牌。
    expect(PACE_MS.afterClaimGang + YAOTONG_AI_KONG_DISCARD_MS).toBeGreaterThan(KONG_WEATHER_DURATION)
  })

  it('补杠先宣告，2000ms处理抢杠，再等600ms补牌；不重复播补杠声', async () => {
    const sound = vi.fn(),
      port = setup({ playSound: sound }),
      state = fixture()
    state.players[0].hand = tiles('5m 147m 258p 369s 2s')
    state.players[0].drawn = 4
    state.players[0].melds = [{ tile: 4, kind: 'peng', chicken: 0, responsibility: 0, pre: false, from: 1 }]
    port.local.state.value = state
    port.userGang('m5')
    expect(port.tableActionEvent.value?.type).toBe('added-gang')
    expect(state.players[0].melds[0].kind).toBe('peng')
    expect(port.players[0].melds[0]).toMatchObject({ type: 'gang', pending: true })
    const n = state.wall.length
    await vi.advanceTimersByTimeAsync(YAOTONG_EXTENDED_REACTION_MS - 1)
    expect(state.players[0].melds[0].kind).toBe('peng')
    await vi.advanceTimersByTimeAsync(1)
    expect(state.players[0].melds[0].kind).toBe('added')
    await vi.advanceTimersByTimeAsync(PACE_MS.afterKongSettle - 1)
    expect(state.wall.length).toBe(n)
    await vi.advanceTimersByTimeAsync(1)
    expect(state.wall.length).toBe(n - 1)
    expect(sound.mock.calls.filter(([name]) => name === 'bugang.ogg')).toHaveLength(1)
    expect(sound.mock.calls.some(([name]) => name === 'gang.ogg')).toBe(false)
  })

  it('暂停或离桌不会让待摸牌、旧AI动作偷偷继续', async () => {
    const port = setup(),
      state = fixture()
    state.players[0].hand.push(4)
    port.local.state.value = state
    port.userDiscard(13)
    port.local.paused.value = true
    await vi.advanceTimersByTimeAsync(3000)
    expect(state.players[1].hand).toHaveLength(13)
    port.local.paused.value = false
    await nextTick()
    port.returnToLobby()
    await vi.advanceTimersByTimeAsync(3000)
    expect(state.players[1].hand).toHaveLength(13)
    expect(port.phase.value).toBe('lobby')
  })
})

describe('共享开局、报牌与胡牌展示', () => {
  it.each([0, 1, 2, 3].flatMap(seat => [[], [2], [2, 5, 8]].map(remaining => ({ seat, remaining }))))('翻鸡移到胡牌者$seat的牌河，保持到下一局：$remaining', async ({ seat, remaining }) => {
    const port = setup(), state = fixture()
    state.current = seat
    state.players[seat].hand = tiles('234567m 234s 66p 789s')
    state.players[seat].drawn = 26
    state.wall = remaining
    port.local.state.value = state
    const before = [...port.wall.value]
    const rivers = state.players.map(p => [...p.river])
    port.local.dispatch({ type: 'hu' }, seat)
    expect(port.tableView.value.settlementIndicator).toBeNull()
    expect(port.wall.value).toEqual(before)
    await vi.advanceTimersByTimeAsync(normalWinTime - WIN_REVEAL_DURATION)
    const indicator = before.length ? { id: state.handNumber, seat, tile: before[0] } : null
    expect(port.tableView.value.settlementIndicator).toEqual(indicator)
    expect(port.wall.value).toEqual(before.slice(1))
    expect(port.result.value).toBeNull()
    await vi.advanceTimersByTimeAsync(WIN_REVEAL_DURATION)
    expect(port.tableView.value.settlementIndicator).toEqual(indicator)
    expect(port.wall.value).toEqual(before.slice(1))
    expect(port.result.value).not.toBeNull()
    expect(state.players.map(p => p.river)).toEqual(rivers)
    void port.nextRound()
    expect(port.tableView.value.settlementIndicator).toBeNull()
    port.returnToLobby()
    await vi.runAllTimersAsync()
    expect(port.tableView.value.settlementIndicator).toBeNull()
  })

  it('一炮多响仍等待所有合法响应，第一位点胡不会抢先结束', async () => {
    const port = setup(),
      state = fixture()
    state.current = 1
    state.players[1].hand.push(14)
    state.players[0].hand = tiles('234m 456789s 6p 345p')
    state.players[0].declaration = 'ready'
    state.players[2].hand = tiles('345m 234678s 6p 456p')
    state.players[2].declaration = 'original'
    port.local.state.value = state
    port.local.dispatch({ type: 'discard', index: 13 }, 1)
    port.userHu()
    expect(state.result).toBeNull()
    await vi.advanceTimersByTimeAsync(AI_DELAYS.claim - 1)
    expect(state.result).toBeNull()
    await vi.advanceTimersByTimeAsync(1)
    expect(state.result!.winners).toEqual([0, 2])
    expect(port.result.value).toBeNull()
    await vi.runAllTimersAsync()
    expect(port.result.value!.scoreChanges!.reduce((n, p) => n + p.delta, 0)).toBe(0)
    expect(state.result!.nextDealer).toBe(1)
    expect(port.tableView.value.settlementIndicator?.seat).toBe(0)
  })

  it('发牌中离桌会结束旧开局Promise，不会在新局继续发旧牌', async () => {
    const port = setup()
    const oldOpening = port.startGame()
    await vi.advanceTimersByTimeAsync(OPENING_PACE_MS.start + OPENING_PACE_MS.dice + OPENING_PACE_MS.batch)
    expect(port.openingStage.value).toBe('deal')
    port.returnToLobby()
    await oldOpening
    expect(port.phase.value).toBe('lobby')
    expect(port.players).toHaveLength(0)
    await vi.runAllTimersAsync()
    expect(port.players).toHaveLength(0)
  })
  it('开场等待真实音频，发牌260/150ms；原报前人人13张，不复制原版跳牌', async () => {
    const audio = deferred()
    const sound = vi.fn((name: string) => (name === 'game_start.mp3' ? audio.promise : Promise.resolve()))
    const port = setup({ playSoundAndWait: sound })
    const start = port.startGame('east', { dealer: 0, openingDice: [2, 3] })
    port.local.state.value!.players[0].hand = tiles('234567m 234s 66p 78s')
    await vi.advanceTimersByTimeAsync(OPENING_PACE_MS.start + 500)
    expect(port.openingStage.value).toBe('start')
    expect(port.players.every((p) => p.hand.length === 0)).toBe(true)
    audio.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(port.openingStage.value).toBe('dice')
    await vi.advanceTimersByTimeAsync(OPENING_PACE_MS.dice)
    expect(port.players[0].hand).toHaveLength(4)
    await vi.advanceTimersByTimeAsync(OPENING_PACE_MS.batch - 1)
    expect(port.players[1].hand).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(port.players[1].hand).toHaveLength(4)
    await vi.runAllTimersAsync()
    await start
    expect(port.players.map((p) => p.hand.length)).toEqual([13, 13, 13, 13])
    expect(port.original.value).toBe(true)
    expect(port.announcement.value).toBeNull() // 开牌提示已按原1500ms时长消退。
    port.local.dispatch({ type: 'original', declare: false })
    await vi.advanceTimersByTimeAsync(OPENING_PACE_MS.firstTurn - 1)
    expect(port.players[0].hand).toHaveLength(13)
    await vi.advanceTimersByTimeAsync(1)
    expect(port.players[0].hand).toHaveLength(14)
  })

  it('点炮等待报牌结束+500ms，再启动胡声、立绘、3D、亮牌和计分', async () => {
    const nameAudio = deferred(),
      played: Array<[string, number]> = []
    const port = setup({
      playSound: (name) => played.push([name, Date.now()]),
      playSoundAndWait: (name) => {
        played.push([name, Date.now()])
        return name === '6p.mp3' ? nameAudio.promise : Promise.resolve()
      },
    })
    const state = fixture()
    state.current = 1
    state.players[1].hand.push(14)
    state.players[0].hand = tiles('234m 456789s 6p 345p')
    state.players[0].declaration = 'ready'
    port.local.state.value = state
    port.local.dispatch({ type: 'discard', index: 13 }, 1)
    port.userHu()
    expect(played.map(([n]) => n)).not.toContain('6p.mp3')
    await vi.advanceTimersByTimeAsync(80)
    expect(played.map(([n]) => n)).toContain('6p.mp3')
    await vi.advanceTimersByTimeAsync(2000)
    expect(played.map(([n]) => n)).not.toContain('hu.mp3')
    expect(port.tableView.value.seats.some((seat) => seat.winner)).toBe(false)
    expect(port.players.every((p) => p.score === 0)).toBe(true)
    expect(port.players[1].discards.at(-1)).toBe('p6')
    nameAudio.resolve()
    await vi.advanceTimersByTimeAsync(DISCARD_WIN_EFFECT_DELAY - 1)
    expect(played.map(([n]) => n)).not.toContain('hu.mp3')
    await vi.advanceTimersByTimeAsync(1)
    expect(port.tableActionEvent.value?.type).toBe('discard-win')
    expect(port.tableView.value.seats[0].winner).toBe(true)
    expect(played.map(([n]) => n)).toContain('hu.mp3')
    const cueStart = Date.now()
    await vi.advanceTimersByTimeAsync(WIN_CUE_LEAD_DURATION + WIN_CUE_EXIT_DURATION)
    expect(port.winEffect.value).not.toBeNull()
    expect(port.players[1].discards).not.toContain('p6')
    expect(played.map(([n]) => n)).not.toContain('hu_effect_sound.mp3')
    await vi.advanceTimersByTimeAsync(WIN_EFFECT_SOUND_DELAY)
    expect(played.find(([n]) => n === 'hu_effect_sound.mp3')?.[1] - cueStart).toBe(
      WIN_CUE_LEAD_DURATION + WIN_CUE_EXIT_DURATION + WIN_EFFECT_SOUND_DELAY,
    )
    await vi.advanceTimersByTimeAsync(WIN_EFFECT_DURATION - WIN_EFFECT_SOUND_DELAY)
    expect(port.phase.value).toBe('revealing')
    expect(port.revealHands.value).toBe(true)
    expect(port.result.value).toBeNull()
    expect(port.players.every((p) => p.score === 0)).toBe(true)
    await vi.advanceTimersByTimeAsync(WIN_REVEAL_DURATION)
    expect(Date.now() - cueStart).toBe(normalWinTime)
    expect(port.result.value).not.toBeNull()
    expect(port.players[0].score).toBe(state.players[0].score)
    expect(port.result.value!.scoreChanges!.reduce((n, p) => n + p.delta, 0)).toBe(0)
  })

  it('原版减少动态效果时序仍含亮牌；取消后旧报牌Promise不再触发胡牌', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const port = setup(),
      state = fixture()
    state.players[0].hand = tiles('234567m 234s 66p 789s')
    state.players[0].drawn = 26
    port.local.state.value = state
    port.userHu()
    const reducedTotal =
      REDUCED_WIN_CUE_LEAD_DURATION +
      REDUCED_WIN_CUE_EXIT_DURATION +
      REDUCED_WIN_EFFECT_DURATION +
      REDUCED_WIN_REVEAL_DURATION
    await vi.advanceTimersByTimeAsync(reducedTotal - 1)
    expect(port.result.value).toBeNull()
    expect(port.revealHands.value).toBe(true)
    await vi.advanceTimersByTimeAsync(1)
    expect(port.result.value).not.toBeNull()

    const audio = deferred(),
      sound = vi.fn(),
      leaving = setup({ playSound: sound, playSoundAndWait: () => audio.promise }),
      s = fixture()
    s.current = 1
    s.players[1].hand.push(14)
    s.players[0].hand = tiles('234m 456789s 6p 345p')
    s.players[0].declaration = 'ready'
    leaving.local.state.value = s
    leaving.local.dispatch({ type: 'discard', index: 13 }, 1)
    leaving.userHu()
    await vi.advanceTimersByTimeAsync(80)
    leaving.returnToLobby()
    audio.resolve()
    await vi.runAllTimersAsync()
    expect(leaving.phase.value).toBe('lobby')
    expect(leaving.result.value).toBeNull()
    expect(sound.mock.calls.some(([n]) => n === 'hu.mp3' || n === 'hu_effect_sound.mp3')).toBe(false)
  })

  it('真实节奏跑完10局仍守恒、不中断多家响应，展示结算仅一次', async () => {
    for (let seed = 1; seed <= 10; seed++) {
      const port = setup()
      let x = seed
      const random = () => {
        x = (Math.imul(x, 1664525) + 1013904223) >>> 0
        return x / 4294967296
      }
      port.local.state.value = createGame({ random })
      port.local.autoplay.value = true
      await nextTick()
      let steps = 0
      while (!port.result.value && steps++ < 1000) {
        await vi.advanceTimersToNextTimerAsync()
        const s = port.local.state.value!
        if (s.phase !== 'settled') {
          expect(countsOf([...s.wall, ...s.players.flatMap((p) => ownedTiles(p))])).toEqual(Array(27).fill(4))
        }
      }
      expect(port.result.value, `seed ${seed}`).not.toBeNull()
      expect(port.local.error.value).toBe('')
      expect(port.players.reduce((n, p) => n + p.score, 0)).toBe(0)
      expect(port.local.state.value!.handNumber).toBe(1)
      port.returnToLobby()
    }
  })
})
