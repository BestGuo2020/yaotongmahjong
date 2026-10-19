import { effectScope, triggerRef } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from './engine'
import { meld, player, ready, table, unready } from './auditFixtures'
import { chickenMarks, chickenPerformance, CHICKEN_PERFORMANCE_MS } from './chickenPresentation'
import {
  responsibilityPayments,
  settlementCue,
  settlementFlights,
  SETTLEMENT_FLIGHT_MS,
} from './presentation'
import { settle } from './settlement'
import { useYaotongPort } from './useYaotongPort'

function claim(kong = false) {
  const state = table()
  state.current = 3
  state.players[3].hand.push(9)
  state.players[0] = player(kong ? '111p 147m 258p 369s 2s' : '11p 147m 258p 369s 24s')
  expect(act(state, 3, { type: 'discard', index: 13 })).toBe(true)
  expect(act(state, 0, { type: 'respond', action: kong ? 'kong' : 'peng' })).toBe(true)
  return state
}

describe('小鸡动作来自实际规则事件与公开归属', () => {
  it.each([0, 16, 18])('固定鸡%s只有4分冲鸡档表演，底鸡不冒充冲鸡', (tile) => {
    const state = table()
    const event = { id: 1, seat: 2, kind: 'discard' as const, text: '', tile, chicken: 4 }
    expect(chickenPerformance(event, state)).toMatchObject({
      kind: 'rush',
      actorSeat: 2,
      markSeat: 2,
      points: 4,
    })
    expect(chickenPerformance({ ...event, chicken: 2 }, state)).toBeNull()
    expect(chickenPerformance({ ...event, tile: 5 }, state)).toBeNull()
  })
  it.each([
    ['pre', 30, '预冲'],
    ['first', 20, '首冲'],
    ['later', 15, '后冲'],
    ['hot', 100, '杠冲'],
  ] as const)('幺筒%s保留自己的名称与%s档位', (rush, chicken, label) => {
    expect(
      chickenPerformance({ id: 1, seat: 1, kind: 'discard', text: '', tile: 9, rush, chicken }, table()),
    ).toMatchObject({ actorSeat: 1, markSeat: 1, label, points: chicken })
  })
  it.each([false, true])('成功碰/明杠建立一次责任，小鸡属于取得者、标记属于出牌家，杠=%s', (kong) => {
    const state = claim(kong)
    const event = state.events.find((e) => e.kind === (kong ? 'kong' : 'peng'))!
    expect(chickenPerformance(event, state)).toMatchObject({
      kind: 'responsibility',
      actorSeat: 0,
      markSeat: 3,
      points: 30,
    })
    expect(chickenMarks(state, 3)).toEqual({ rushCount: 0, responsibilityCount: 1 })
    expect(chickenMarks(state, 0)).toEqual({ rushCount: 0, responsibilityCount: 0 })
    expect(chickenPerformance({ ...event, kind: 'kong-intent' }, state)).toBeNull()
    expect(chickenPerformance({ ...event, kind: 'kong', text: '补杠' }, state)).toBeNull()
    expect(chickenPerformance({ ...event, tile: 18 }, state)).toBeNull()
    state.result = settle(state, { kind: 'penalty', offender: 0 })
    expect(chickenPerformance(event, state)).toBeNull()
  })
  it.each([false, true])('责任款按终局实际方向与倍率飞行，反向=%s', (reverse) => {
    const state = table()
    state.dice = [4, 4]
    state.wall = [17] // 翻九筒，幺筒三倍。
    state.players[0] = reverse ? player('147m 258p 369s 2s') : player('234567m 45s 66p')
    state.players[0].melds = [meld(9, { from: 1, pre: true, chicken: 90, responsibility: 30 })]
    state.players[1] = ready()
    state.result = settle(state, { kind: 'win' })
    expect(responsibilityPayments(state.result.transfers)).toEqual([
      {
        from: reverse ? 0 : 1,
        to: reverse ? 1 : 0,
        amount: 180,
        parts: [{ account: '幺筒责任分', amount: 180 }],
      },
    ])
    const cue = settlementCue(state, 7)!
    const flows = settlementFlights(cue)
    expect(flows.filter((f) => f.kind === 'responsibility')).toMatchObject([
      { from: reverse ? 0 : 1, to: reverse ? 1 : 0, amount: 180 },
    ])
    expect(flows.every((f) => f.delayMs + SETTLEMENT_FLIGHT_MS + 250 <= 1500)).toBe(true)
    state.players[1] = unready()
    if (reverse) {
      state.result = settle(state, { kind: 'win' })
      expect(responsibilityPayments(state.result.transfers)).toEqual([])
    }
    state.result = settle(state, { kind: 'draw' })
    expect(responsibilityPayments(state.result.transfers)).toEqual([])
  })
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('window', globalThis)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('小鸡时序不阻塞对局、不留下旧回调', () => {
  it('一家的冲鸡被碰走，不取消另一家仍在牌河中的同牌动画', async () => {
    const scope = effectScope()
    try {
      const port = scope.run(() => useYaotongPort())!
      port.local.paused.value = true
      const state = table()
      state.players[0] = player('11p 147m 258p 369s 24s')
      state.players[1].river = [{ id: 1, tile: 9, chicken: 30, stage: 'pre' }]
      state.players[3].river = [{ id: 2, tile: 9, chicken: 20, stage: 'first' }]
      state.events = [1, 3].map((seat, index) => ({
        id: index + 1,
        seat,
        kind: 'discard',
        tile: 9,
        chicken: index ? 20 : 30,
        text: '',
      }))
      state.serial = 2
      port.local.state.value = state
      await vi.advanceTimersByTimeAsync(80)
      expect(port.tableView.value.chickenPerformances?.map((c) => c.actorSeat)).toEqual([1, 3])
      state.players[1].river = []
      state.players[0].hand = state.players[0].hand.filter((t) => t !== 9)
      state.players[0].melds = [meld(9, { from: 1, pre: true, chicken: 90, responsibility: 30 })]
      state.events.push({ id: 3, seat: 0, kind: 'peng', tile: 9, text: '碰' })
      state.serial = 3
      triggerRef(port.local.state)
      await vi.advanceTimersByTimeAsync(0)
      expect(port.tableView.value.chickenPerformances?.map((c) => [c.kind, c.actorSeat])).toEqual([
        ['rush', 3],
        ['responsibility', 0],
      ])
    } finally {
      scope.stop()
    }
  })
  it('碰牌音实际结束后才演责任鸡，只播一次，按时移除', async () => {
    let finish!: () => void
    const playSound = vi.fn()
    const actionVoice = new Promise<void>((resolve) => {
      finish = resolve
    })
    const scope = effectScope()
    try {
      const port = scope.run(() =>
        useYaotongPort({
          playSound,
          playSoundAndWait: (file) => (file === 'peng.mp3' ? actionVoice : Promise.resolve()),
        }),
      )!
      port.local.paused.value = true
      const state = claim()
      port.local.state.value = state
      expect(port.tableView.value.chickenPerformances).toEqual([])
      expect(port.tableView.value.seats[3].responsibilityCount).toBe(0)
      await vi.advanceTimersByTimeAsync(1000)
      expect(playSound).not.toHaveBeenCalledWith('zerenji.wav', expect.anything())
      finish()
      await vi.advanceTimersByTimeAsync(0)
      expect(port.tableView.value.chickenPerformances).toMatchObject([{ actorSeat: 0, markSeat: 3 }])
      expect(port.tableView.value.seats[3].responsibilityCount).toBe(0) // 标记飞抵后才留在头像旁。
      expect(playSound.mock.calls.filter(([name]) => name === 'zerenji.wav')).toHaveLength(1)
      triggerRef(port.local.state)
      await vi.advanceTimersByTimeAsync(CHICKEN_PERFORMANCE_MS)
      expect(port.tableView.value.chickenPerformances).toEqual([])
      expect(port.tableView.value.seats[3].responsibilityCount).toBe(1)
      expect(playSound.mock.calls.filter(([name]) => name === 'zerenji.wav')).toHaveLength(1)
    } finally {
      scope.stop()
    }
  })
  it.each(['leave', 'dispose', 'settle'] as const)('%s后不播放迟到的责任鸡', async (action) => {
    let finish!: () => void
    const playSound = vi.fn(),
      pending = new Promise<void>((r) => {
        finish = r
      })
    const scope = effectScope()
    const port = scope.run(() =>
      useYaotongPort({
        playSound,
        playSoundAndWait: (file) => (file === 'peng.mp3' ? pending : Promise.resolve()),
      }),
    )!
    port.local.paused.value = true
    port.local.state.value = claim()
    if (action === 'leave') port.returnToLobby()
    else if (action === 'dispose') scope.stop()
    else {
      port.local.state.value!.result = settle(port.local.state.value!, { kind: 'draw' })
      triggerRef(port.local.state)
    }
    finish()
    await vi.advanceTimersByTimeAsync(0)
    expect(port.tableView.value.chickenPerformances).toEqual([])
    expect(playSound.mock.calls.some(([name]) => name === 'zerenji.wav')).toBe(false)
    scope.stop()
  })
})
