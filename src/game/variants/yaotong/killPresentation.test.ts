import { effectScope } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from './engine'
import { meld, player, ready, table } from './auditFixtures'
import {
  killFocusSeat,
  killPayments,
  reportKillTotals,
  settlementCue,
  settlementFlights,
  SETTLEMENT_FLIGHT_MS,
} from './presentation'
import { settle } from './settlement'
import { useYaotongPort } from './useYaotongPort'

function selfDraw() {
  const state = table()
  state.wall = []
  state.players[0] = player('234567789m 22m 345m', { drawn: 4 })
  return state
}

describe('杀报只展示额外付款及真实双方', () => {
  it.each([
    ['ready', false, 20],
    ['original', false, 40],
    ['ready', true, 40],
    ['original', true, 80],
  ] as const)('%s，双倍%s：只飞额外%s分，不混入H', (declaration, double, amount) => {
    const state = selfDraw()
    if (double) state.dice = [3, 3]
    state.players[1] = { ...ready(), declaration }
    expect(act(state, 0, { type: 'hu' })).toBe(true)
    const result = state.result!,
      before = structuredClone(result.transfers)
    expect(result.values[0].h).toBe(35)
    expect(killPayments(result.transfers)).toEqual([
      { from: 1, to: 0, amount, parts: [{ account: '杀报加分', amount }] },
    ])
    expect(settlementCue(state, 1)?.kills).toHaveLength(1)
    expect(reportKillTotals(result.transfers)).toContainEqual({ seat: 1, paid: amount, received: 0 })
    expect(reportKillTotals(result.transfers)).toContainEqual({ seat: 0, paid: 0, received: amount })
    expect(result.transfers).toEqual(before)
  })
  it('自摸同时杀报听和原报，各付20/40，赢家合收60；默认聚焦赢家', () => {
    const state = selfDraw()
    state.players[1].declaration = 'ready'
    state.players[2].declaration = 'original'
    act(state, 0, { type: 'hu' })
    expect(killPayments(state.result!.transfers).map((p) => [p.from, p.to, p.amount])).toEqual([
      [1, 0, 20],
      [2, 0, 40],
    ])
    expect(reportKillTotals(state.result!.transfers)).toContainEqual({ seat: 0, paid: 0, received: 60 })
    expect(killFocusSeat(state.result!.transfers)).toBe(0)
  })
  it('一炮多响：被杀原报者向两位赢家各额外40；默认聚焦付款人展示全部去向', () => {
    const state = table()
    state.current = 1
    state.players[1] = player('147m 258p 369s 2468s 6p', { declaration: 'original', drawn: 14 })
    state.players[0] = player('234m 456789s 6p 345p', { declaration: 'ready' })
    state.players[2] = player('345m 234678s 6p 456p', { declaration: 'ready' })
    act(state, 1, { type: 'discard', index: 13 })
    act(state, 0, { type: 'respond', action: 'hu' })
    expect(state.result).toBeNull()
    act(state, 2, { type: 'respond', action: 'hu' })
    expect(state.result!.winners).toEqual([0, 2])
    expect(killPayments(state.result!.transfers).map((p) => [p.from, p.to, p.amount])).toEqual([
      [1, 0, 40],
      [1, 2, 40],
    ])
    expect(reportKillTotals(state.result!.transfers)).toContainEqual({ seat: 1, paid: 80, received: 0 })
    expect(killFocusSeat(state.result!.transfers)).toBe(1)
  })
  it('第三家点炮不杀未参与的声明者；流局和一般包牌也没有杀报款', () => {
    const state = table()
    state.current = 1
    state.players[1] = player('147m 258p 369s 2468s 5m', { drawn: 4 })
    state.players[0] = player('234567789m 22m 34m')
    state.players[3] = { ...ready(), declaration: 'original' }
    act(state, 1, { type: 'discard', index: 13 })
    act(state, 0, { type: 'respond', action: 'hu' })
    expect(killPayments(state.result!.transfers)).toEqual([])
    expect(settlementCue(state, 1)).toBeNull()
    for (const kind of ['draw', 'penalty'] as const) {
      const ending = settle(state, { kind, offender: 1 })
      expect(killPayments(ending.transfers)).toEqual([])
    }
  })
  it('见面礼和杀报同向付款分开保留，六条飞行都在原亮牌窗口内完成', () => {
    const state = selfDraw()
    state.players[0] = player('234567m 66p 789s', {
      drawn: 26,
      melds: [meld(9, { kind: 'turn', chicken: 60 })],
    })
    state.players[1].declaration = 'ready'
    state.players[2].declaration = 'original'
    state.players[3].declaration = 'ready'
    act(state, 0, { type: 'hu' })
    const cue = settlementCue(state, 9)!,
      flights = settlementFlights(cue)
    expect(cue.gifts).toEqual([{ seat: 0, amount: 300 }])
    expect(cue.kills.reduce((sum, p) => sum + p.amount, 0)).toBe(80)
    expect(flights).toHaveLength(6)
    expect(flights.filter((p) => p.from === 1 && p.to === 0).map((p) => [p.kind, p.amount])).toEqual([
      ['kill', 20],
      ['gift', 100],
    ])
    expect(new Set(flights.map((p) => `${p.kind}/${p.from}/${p.to}`)).size).toBe(6)
    expect(Math.max(...flights.map((p) => p.delayMs + SETTLEMENT_FLIGHT_MS)) + 250).toBeLessThan(1500)
  })
  it('被杀报者仍收见面礼时，双向款项保持各自类别和金额', () => {
    const state = table()
    state.current = 1
    state.players[1] = player('234m 567s 22p 345s 45s 6p', {
      drawn: 14, declaration: 'ready',
      river: [0, 1, 2, 3].map(id => ({ tile: 9, chicken: 30, stage: 'pre' as const, id })),
    })
    state.players[0] = player('222m 333p 444555s 6p')
    act(state, 1, { type: 'discard', index: 13 })
    act(state, 0, { type: 'respond', action: 'hu' })
    const cue = settlementCue(state, 10)!, flights = settlementFlights(cue)
    expect(cue.gifts).toEqual([{ seat: 1, amount: 300 }])
    expect(flights).toContainEqual(expect.objectContaining({ kind: 'kill', from: 1, to: 0, amount: 20 }))
    expect(flights).toContainEqual(expect.objectContaining({ kind: 'gift', from: 0, to: 1, amount: 100 }))
  })
})

beforeEach(() => {
  vi.stubGlobal('window', globalThis)
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('杀报复用亮牌时序', () => {
  it.each([false, true])('减少动态效果=%s：亮牌才显示、到时结算，原金额不改变', async (reduced) => {
    vi.stubGlobal('matchMedia', () => ({ matches: reduced }))
    const scope = effectScope()
    try {
      const port = scope.run(() => useYaotongPort())!,
        state = selfDraw()
      state.players[1].declaration = 'ready'
      state.players[2].declaration = 'original'
      port.local.state.value = state
      port.userHu()
      const revealAt = reduced ? 870 : 4600,
        revealDuration = reduced ? 360 : 1500
      await vi.advanceTimersByTimeAsync(revealAt - 1)
      expect(port.tableView.value.settlementCue).toBeNull()
      expect(port.tableView.value.seats[1].killed).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      expect(port.tableView.value.settlementCue?.kills.map((p) => [p.from, p.to, p.amount])).toEqual([
        [1, 0, 20],
        [2, 0, 40],
      ])
      expect(port.tableView.value.seats[1].killedAmount).toBe(20)
      expect(port.tableView.value.seats[2].killedAmount).toBe(40)
      expect(port.announcement.value).toBeNull()
      expect(port.players.every((p) => p.score === 0)).toBe(true)
      await vi.advanceTimersByTimeAsync(revealDuration - 1)
      expect(port.result.value).toBeNull()
      await vi.advanceTimersByTimeAsync(1)
      expect(port.result.value).not.toBeNull()
      expect(port.tableView.value.settlementCue).toBeNull()
      expect(port.players[0].score).toBe(state.result!.deltas[0])
    } finally {
      scope.stop()
    }
  })
  it('飞分途中离桌取消后续杀报提示和结算回调', async () => {
    const scope = effectScope()
    try {
      const port = scope.run(() => useYaotongPort())!,
        state = selfDraw()
      state.players[1].declaration = 'original'
      port.local.state.value = state
      port.userHu()
      await vi.advanceTimersByTimeAsync(4600)
      expect(port.tableView.value.settlementCue?.kills).toHaveLength(1)
      port.returnToLobby()
      await vi.runAllTimersAsync()
      expect(port.tableView.value.settlementCue).toBeNull()
      expect(port.phase.value).toBe('lobby')
      expect(port.result.value).toBeNull()
    } finally {
      scope.stop()
    }
  })
})
