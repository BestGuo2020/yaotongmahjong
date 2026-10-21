import { effectScope, triggerRef } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, selfOptions } from './engine'
import { player, table } from './auditFixtures'
import { useYaotongPort } from './useYaotongPort'
import { chooseAction } from './ai'
import type { GameState } from './types'
import type { YaotongMode } from './mode'

beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('window', globalThis) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

function withGame(mode: YaotongMode, state: GameState, check: (port: ReturnType<typeof useYaotongPort>) => void) {
  const scope = effectScope()
  try {
    const port = scope.run(() => useYaotongPort())!
    port.local.mode.value = mode
    port.local.state.value = state
    check(port)
  } finally { scope.stop() }
}

describe('新手模式辅助防违规，老手模式保留实际包牌', () => {
  it.each(['easy', 'hard'] as const)('%s：同巡碰鸡后打鸡', (mode) => {
    const state = table()
    state.players[0] = player('147m 258p 369s 2468s 1p', { chickenPeng: [9] })
    withGame(mode, state, (port) => {
      const before = structuredClone(state)
      expect(port.local.protection.value.discards.includes(13)).toBe(mode === 'easy')
      port.userDiscard(13)
      if (mode === 'easy') {
        expect(state).toEqual(before)
        expect(port.local.protectionNotice.value).toContain('拦截打鸡')
        port.userDiscard(1)
        expect(state.players[0].river.at(-1)?.tile).toBe(3)
        expect(state.result?.kind).not.toBe('penalty')
      } else expect(state.result).toMatchObject({ kind: 'penalty', offender: 0 })
    })
  })

  it.each(['easy', 'hard'] as const)('%s：同巡打鸡后碰鸡', (mode) => {
    const state = table()
    state.current = 1
    state.players[1] = player('147m 258p 369s 2468s 1s')
    state.players[0] = player('11s 147m 258p 369s 24s', { chickenDiscard: [18] })
    act(state, 1, { type: 'discard', index: 13 })
    expect(state.pending?.options[0].restrictedPeng).toBe(true)
    withGame(mode, state, (port) => {
      expect(port.actionPrompt.value?.canPeng).toBe(mode === 'hard')
      const before = structuredClone(state)
      port.userPeng()
      if (mode === 'easy') {
        expect(state).toEqual(before)
        port.userPass()
        expect(state.result?.kind).not.toBe('penalty')
      } else expect(state.result).toMatchObject({ kind: 'penalty', offender: 0 })
    })
  })

  it.each(['easy', 'hard'] as const)('%s：过手胡，不将非法胡牌误判为必胡', (mode) => {
    const state = table()
    state.players[0] = player('234567m 234s 66p 789s', { drawn: 26, passedHu: 45 })
    state.players[1].declaration = 'ready'
    expect(selfOptions(state, 0)).toMatchObject({ hu: true, restrictedHu: true, mandatory: false })
    withGame(mode, state, (port) => {
      expect(port.userCanHu.value).toBe(mode === 'hard')
      expect(port.local.protection.value.discards).toEqual([])
      const before = structuredClone(state)
      port.userHu()
      if (mode === 'easy') expect(state).toEqual(before)
      else expect(state.result).toMatchObject({ kind: 'penalty', offender: 0 })
    })
  })

  it.each(['easy', 'hard'] as const)('%s：自摸可杀报，禁止以弃牌或杠牌放弃胡牌', (mode) => {
    const state = table()
    state.players[0] = player('111123m 456789s 22p', { drawn: 10 })
    state.players[1].declaration = 'ready'
    expect(selfOptions(state, 0).mandatory).toBe(true)
    withGame(mode, state, (port) => {
      expect(port.userCanHu.value).toBe(true)
      if (mode === 'easy') {
        expect(port.userKongs.value).toEqual([])
        expect(port.local.protection.value.discards).toHaveLength(14)
        const before = structuredClone(state)
        port.userGang('m1')
        port.userDiscard(13)
        expect(state).toEqual(before)
        port.userHu()
        expect(state.result?.kind).toBe('win')
      } else {
        expect(port.userKongs.value).toContain('m1')
        port.userGang('m1')
        expect(state.result).toMatchObject({ kind: 'penalty', offender: 0 })
      }
    })
  })

  it.each(['easy', 'hard'] as const)('%s：有幺筒须接热炮，响应按钮与提交保护一致', (mode) => {
    const state = table()
    state.current = 1
    state.players[1] = player('147m 258p 369s 2468s 6p', { afterKong: true, drawn: 14 })
    state.players[0] = player('234m 456789s 6p 45p 1p')
    act(state, 1, { type: 'discard', index: 13 })
    expect(state.pending?.options[0].mandatory).toBe(true)
    withGame(mode, state, (port) => {
      expect(port.actionPrompt.value?.canHu).toBe(true)
      expect(Boolean(port.local.protection.value.pass)).toBe(mode === 'easy')
      const before = structuredClone(state)
      port.userPass()
      if (mode === 'easy') {
        expect(state).toEqual(before)
        port.userHu()
        expect(state.result?.kind).toBe('win')
      } else expect(state.result).toMatchObject({ kind: 'penalty', offender: 0 })
    })
  })

  it('提前阻止碰牌后只能打鸡的死局，但仍允许有安全弃牌的碰牌', () => {
    const state = table()
    state.current = 1
    state.players[1] = player('147m 258p 369s 2468s 1s')
    state.players[0] = player('1111s', { melds: [0, 3, 6].map(tile => ({ kind: 'peng', tile, pre: false, chicken: 0, responsibility: 0 })) })
    act(state, 1, { type: 'discard', index: 13 })
    withGame('easy', state, (port) => {
      expect(port.actionPrompt.value?.canPeng).toBe(false)
      const before = structuredClone(state)
      port.userPeng()
      expect(state).toEqual(before)
      state.players[0].hand[2] = 3
      triggerRef(port.local.state)
      expect(port.actionPrompt.value?.canPeng).toBe(true)
    })
  })

  it('防护只作用于本家，不篡改其他座位违规的结算', () => {
    const state = table()
    state.current = 1
    state.players[1] = player('147m 258p 369s 2468s 1p', { chickenPeng: [9] })
    withGame('easy', state, (port) => {
      port.local.dispatch({ type: 'discard', index: 13 }, 1)
      expect(state.result).toMatchObject({ kind: 'penalty', offender: 1 })
    })
  })

  it('托管在碰鸡限制期间不再碰走最后两张非鸡牌，避免被防护拦住后停滞', () => {
    const state = table()
    state.current = 1
    state.players[1] = player('147m 258p 369s 2468s 4m')
    state.players[0] = player('44m 11s', { chickenPeng: [18],
      melds: [{ kind: 'peng', tile: 0, from: 2, pre: false, chicken: 8, responsibility: 0 }] })
    act(state, 1, { type: 'discard', index: 13 })
    withGame('easy', state, (port) => {
      expect(port.actionPrompt.value?.canPeng).toBe(false)
      const command = chooseAction(state, 0)!
      expect(command).toEqual({ type: 'respond', action: 'pass' })
      port.local.dispatch(command)
      expect(state.pending?.choices[0] === 'pass' || state.phase !== 'response').toBe(true)
      expect(port.local.protectionNotice.value).toBe('')
    })
  })

  it.each(['easy', 'hard'] as const)('%s：正常胡牌分数相同，模式跨续局和返回大厅保留', (mode) => {
    const state = table()
    state.players[0] = player('234567m 234s 66p 789s', { drawn: 26 })
    const expected = structuredClone(state)
    act(expected, 0, { type: 'hu' })
    withGame(mode, state, (port) => {
      port.userHu()
      expect(state.result).toEqual(expected.result)
      port.local.next()
      expect(port.local.mode.value).toBe(mode)
      port.returnToLobby()
      expect(port.local.mode.value).toBe(mode)
      port.local.begin(8)
      expect(port.local.mode.value).toBe(mode)
    })
  })
})
