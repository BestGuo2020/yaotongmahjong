import { effectScope } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act } from '../engine'
import { player, table } from '../auditFixtures'
import type { Command } from '../types'
import { useYaotongGame } from '../useYaotongGame'
import { useYaotongPort } from '../useYaotongPort'
import { toActionPayload } from './protocol'

beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('window', globalThis) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

const cases = ['peng-discard', 'discard-peng', 'passed-hu', 'kill-discard', 'kill-kong',
  'hot-pass', 'false-hu', 'alias-pass', 'alias-hu'] as const

function scenario(name: typeof cases[number]) {
  const state = table()
  let command: Command = { type: 'discard', index: 13 }
  if (name === 'peng-discard') {
    state.players[0] = player('147m 258p 369s 2468s 1p', { chickenPeng: [9] })
  } else if (name === 'discard-peng') {
    state.current = 1
    state.players[1].hand.push(18)
    state.players[0] = player('11s 147m 258p 369s 24s', { chickenDiscard: [18] })
    expect(act(state, 1, { type: 'discard', index: 13 })).toBe(true)
    command = { type: 'respond', action: 'peng' }
  } else if (name === 'passed-hu' || name === 'alias-hu') {
    state.players[0] = player('234567m 234s 66p 789s', { drawn: 26, passedHu: 45 })
    command = { type: name === 'passed-hu' ? 'hu' : 'declareHu' }
  } else if (name.startsWith('kill') || name === 'alias-pass') {
    state.players[0] = player('111123m 456789s 22p', { drawn: 10 })
    state.players[1].declaration = 'ready'
    if (name === 'kill-kong') command = { type: 'kong', tile: 0 }
    if (name === 'alias-pass') command = { type: 'passHu' }
  } else if (name === 'hot-pass') {
    state.current = 1
    state.players[1] = player('147m 258p 369s 2468s 6p', { afterKong: true, drawn: 14 })
    state.players[0] = player('234m 456789s 6p 45p 1p')
    expect(act(state, 1, { type: 'discard', index: 13 })).toBe(true)
    command = { type: 'respond', action: 'pass' }
  } else {
    state.players[0].hand.push(26)
    command = { type: 'declareHu' }
  }
  for (const other of state.players.slice(1)) {
    other.concealedTileCount = other.hand.length
    other.hand = []
    other.drawn = null
  }
  return { state, command }
}

it.each(cases)('联机输入保护与按钮一致：%s', name => {
  for (const mode of ['easy', 'hard'] as const) {
    const scope = effectScope()
    try {
      const external = { send: vi.fn(), auto: vi.fn(), hold: vi.fn(), nextRound: vi.fn(),
        leave: vi.fn(), openingDone: vi.fn() }
      const game = scope.run(() => useYaotongGame({ externalAuthority: external }))!
      const port = scope.run(() => useYaotongPort({}, game))!
      const { state, command } = scenario(name)
      game.mode.value = mode
      game.acceptRemoteState(state)
      if (name === 'discard-peng') expect(port.actionPrompt.value?.canPeng).toBe(mode === 'hard')
      if (name === 'passed-hu') expect(port.userCanHu.value).toBe(mode === 'hard')
      if (name === 'kill-kong') expect(port.userKongs.value.includes('m1')).toBe(mode === 'hard')
      if (name === 'kill-discard' || name === 'hot-pass') expect(Boolean(game.protection.value.pass)).toBe(mode === 'easy')
      const before = structuredClone(state)
      expect(game.dispatch(command)).toBe(mode === 'hard')
      expect(state).toEqual(before) // 客户端不能自行判罚或提前扣分。
      if (mode === 'easy') {
        expect(external.send).not.toHaveBeenCalled()
      } else {
        expect(external.send).toHaveBeenCalledWith(command)
        expect(game.protection.value).toEqual({ hu: '', peng: '', kong: '', pass: '', discards: [] })
      }
    } finally { scope.stop() }
  }
})

it('客户端主动过牌不发送服务端自动保留胡口标记', () => {
  expect(toActionPayload({ type: 'respond', action: 'pass', deferHu: true }))
    .toEqual({ type: 'respond', action: 'pass' })
})
