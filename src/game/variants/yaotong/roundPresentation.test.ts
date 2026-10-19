import { effectScope, triggerRef } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useYaotongPort } from './useYaotongPort'
import { table, unready } from './auditFixtures'
import { settle } from './settlement'
import { OPENING_PACE_MS } from '../../shared/runtime/localOpening'

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('window', globalThis)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('精简局次展示', () => {
  it.each([
    [4, 1, 0, '东风场', '东1局'],
    [4, 4, 2, '东风场', '东4局'],
    [8, 5, 1, '半庄场', '南1局'],
    [8, 8, 0, '半庄场', '南4局'],
    [16, 9, 3, '全庄场', '西1局'],
    [16, 13, 0, '全庄场', '北1局'],
    [16, 16, 4, '全庄场', '北4局'],
  ] as const)(
    '%s庄次第%s局连庄%s：%s / %s，结算保留同一局号',
    (length, round, repeats, matchName, roundLabel) => {
      const scope = effectScope()
      try {
        const port = scope.run(() => useYaotongPort())!
        const state = table()
        state.matchLength = length
        state.dealerRound = round
        state.repeats = repeats
        state.handNumber = 25
        port.local.paused.value = true
        port.local.state.value = state
        expect(port.matchName.value).toBe(matchName)
        expect(port.roundLabel.value).toBe(roundLabel)
        expect(port.honba.value).toBe(repeats)
        state.result = settle(state, { kind: 'draw' })
        triggerRef(port.local.state)
        expect(port.result.value).toMatchObject({ roundLabel, honba: repeats })
        expect(port.resultTitle.value).toBe('荒庄')
      } finally {
        scope.stop()
      }
    },
  )
  it('13张发牌完成才显示短开牌提示；无原报条件自动首摸且不延长流程', async () => {
    const scope = effectScope()
    try {
      const port = scope.run(() => useYaotongPort())!
      const opening = port.startGame('east', { dealer: 0, openingDice: [2, 3] })
      port.local.state.value!.players[0].hand = unready().hand
      const dealTime =
        OPENING_PACE_MS.start + OPENING_PACE_MS.dice + OPENING_PACE_MS.batch * 12 + OPENING_PACE_MS.single * 4
      await vi.advanceTimersByTimeAsync(dealTime - 1)
      expect(port.announcement.value).toBeNull()
      expect(port.openingActive.value).toBe(true)
      expect(port.local.state.value!.players[0].draws).toBe(0)
      await vi.advanceTimersByTimeAsync(1)
      await opening
      expect(port.players.every((p) => p.hand.length === 13)).toBe(true)
      expect(port.announcement.value?.text).toBe('东1局 · 开牌')
      await vi.advanceTimersByTimeAsync(500 + OPENING_PACE_MS.firstTurn)
      expect(port.players[0].hand).toHaveLength(14)
      expect(port.local.state.value!.players[0].draws).toBe(1)
      expect(port.honba.value).toBe(0)
      port.returnToLobby()
      await vi.runAllTimersAsync()
      expect(port.phase.value).toBe('lobby')
      expect(port.announcement.value).toBeNull()
    } finally {
      scope.stop()
    }
  })
})
