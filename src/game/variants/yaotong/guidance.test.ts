import { effectScope, triggerRef } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act } from './engine'
import { player, ready, table } from './auditFixtures'
import { useYaotongPort } from './useYaotongPort'

beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('window', globalThis) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

function inspect(check: (port: ReturnType<typeof useYaotongPort>) => void) {
  const scope = effectScope()
  try { check(scope.run(() => useYaotongPort())!) } finally { scope.stop() }
}

it('碰鸡后说明禁打牌种、可选操作和解除条件；摸牌后不留下旧原因', () => inspect((port) => {
  const state = table()
  state.players[0] = player('147m 258p 369s 2468s 1p', { chickenPeng: true })
  port.local.state.value = state
  expect(port.guidance.value).toEqual([expect.objectContaining({
    id: 'chicken-peng', protection: true, summary: '本巡已碰鸡，请打非鸡牌',
    action: expect.stringContaining('一万、一条、八筒和幺筒'),
    release: '下次实际摸牌后解除。',
  })])
  state.players[0].chickenPeng = false
  triggerRef(port.local.state)
  expect(port.guidance.value).toEqual([])
}))

it('同时受过手胡和碰鸡限制时，分别展示两个原因，不误提示必胡', () => inspect((port) => {
  const state = table()
  state.current = 1
  state.players[1] = player('147m 258p 369s 2468s 1m', { declaration: 'ready', drawn: 0 })
  state.players[0] = player('11m 23m 456789m 888m', { chickenDiscard: true, passedHu: 100 })
  act(state, 1, { type: 'discard', index: 13 })
  port.local.state.value = state
  expect(state.pending?.options[0]).toMatchObject({ restrictedHu: true, restrictedPeng: true, mandatory: false })
  expect(port.guidance.value.map((hint) => hint.id)).toEqual(['passed-hu', 'chicken-discard'])
  expect(port.guidance.value[0].release).toContain('达到45分且高于上次可胡分数')
  expect(port.guidance.value[1].action).toContain('请选择「过」')
}))

it.each(['hot', 'rob'] as const)('持幺筒必须%s时，说明具体场景而不只显示必胡', (kind) => inspect((port) => {
  const state = table()
  state.current = 1
  state.players[1] = player('147m 258p 369s 2468s 6p', { afterKong: true, drawn: 14 })
  state.players[0] = player('234m 456789s 6p 45p 1p')
  act(state, 1, { type: 'discard', index: 13 })
  state.pending!.kind = kind
  port.local.state.value = state
  expect(port.guidance.value).toHaveLength(1)
  expect(port.guidance.value[0].id).toBe(`must-${kind}`)
  expect(port.guidance.value[0].reason).toContain(kind === 'hot' ? '接热炮' : '抢杠胡')
  expect(port.guidance.value[0].action).toContain('不会替你自动胡牌')
}))

it('可杀报时解释原报/报听与必须胡的关系', () => inspect((port) => {
  const state = table()
  state.players[0] = player('234567m 234s 66p 789s', { drawn: 26 })
  state.players[1].declaration = 'ready'
  port.local.state.value = state
  expect(port.guidance.value[0]).toMatchObject({ id: 'must-kill', reason: expect.stringContaining('已有玩家原报或报听') })
}))

it('原报窗口、报听开关和锁手分别给出下一步提示', () => inspect((port) => {
  const state = table()
  state.phase = 'original'
  state.players[0] = ready()
  port.local.state.value = state
  expect(port.guidance.value[0].id).toBe('original')
  expect(port.guidance.value[0].action).toContain('不原报')
  state.phase = 'discard'
  state.players[0].draws = 1
  state.players[0].hand.push(8)
  state.players[0].drawn = 8
  triggerRef(port.local.state)
  expect(port.guidance.value[0].id).toBe('can-declare')
  port.declarationArmed.value = true
  expect(port.guidance.value[0].id).toBe('declare-armed')
  port.local.dispatch({ type: 'discard', index: 13, declare: true })
  state.phase = 'discard'
  state.current = 0
  state.players[0].hand.push(8)
  state.players[0].drawn = 8
  triggerRef(port.local.state)
  expect(port.guidance.value[0].id).toBe('locked-hand')
  expect(port.guidance.value[0].action).toContain('只能打出刚摸到的那张牌')
}))

it('困难模式、托管、开场及终局期间不显示简单模式教学提示', () => inspect((port) => {
  const state = table()
  state.players[0] = player('147m 258p 369s 2468s 1p', { chickenPeng: true })
  port.local.state.value = state
  expect(port.guidance.value).toHaveLength(1)
  port.local.mode.value = 'hard'
  expect(port.guidance.value).toEqual([])
  port.local.mode.value = 'easy'
  port.local.autoplay.value = true
  expect(port.guidance.value).toEqual([])
  port.local.autoplay.value = false
  port.openingActive.value = true
  expect(port.guidance.value).toEqual([])
  port.openingActive.value = false
  state.phase = 'settled'
  triggerRef(port.local.state)
  expect(port.guidance.value).toEqual([])
}))
