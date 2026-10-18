import { effectScope, isRef, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GAME_PORT_ACTION_KEYS, GAME_PORT_STATE_KEYS } from '../../core/contracts/gamePort'
import { wallStackSlot, wallTilePlacement } from '../../core/rules/wallLayout'
import { tileMarkerFor } from '../../../components/table/three/tileMarker'
import { createGame } from './engine'
import { fromSharedTile, toSharedTile, useYaotongPort } from './useYaotongPort'

afterEach(() => vi.useRealTimers())

describe('幺筒复用原版GamePort与3D表现', () => {
  it('无人响应的出牌仍保留3D飞牌事件，不被紧接着的摸牌覆盖', () => {
    vi.useFakeTimers()
    const scope = effectScope()
    const port = scope.run(() => useYaotongPort())!
    const state = createGame({ dealer: 0, dice: [2, 3] })
    state.phase = 'discard'; state.current = 0
    for (const player of state.players) {
      player.hand = [0, 3, 6, 10, 13, 16, 20, 23, 26, 19, 21, 23, 25]
      player.draws = 2
    }
    state.players[0].hand.push(4)
    state.players[0].drawn = 4
    port.local.state.value = state
    port.userDiscard(13)
    expect(port.lastDiscard.value).toMatchObject({ tile: 'm5', from: 0 })
    expect(state.current).toBe(1)
    expect(state.phase).toBe('discard')
    scope.stop()
  })
  it('提供完整GamePort契约，玩家数组始终读取实时投影', async () => {
    vi.useFakeTimers()
    const scope = effectScope()
    const port = scope.run(() => useYaotongPort())!
    for (const key of GAME_PORT_STATE_KEYS) {
      expect(port).toHaveProperty(key)
      if (key !== 'players') expect(isRef(port[key]), key).toBe(true)
    }
    for (const key of GAME_PORT_ACTION_KEYS) expect(typeof port[key]).toBe('function')
    expect(port.players).toHaveLength(0)
    const opening = port.startGame('east')
    expect(port.players).toHaveLength(4)
    expect(port.players[0].avatar).toContain('avatars/lotus.svg')
    expect(port.wall.value).toHaveLength(108)
    expect(port.players.map((p) => p.hand.length)).toEqual([0, 0, 0, 0])
    await vi.runAllTimersAsync()
    await opening
    expect(port.wall.value).toHaveLength(56)
    expect(port.wallHeadDrawn.value).toBe(52)
    expect(port.players.map((p) => p.hand.length)).toEqual([13, 13, 13, 13])
    expect(port.phase.value).toBe('checking')
    expect(port.original.value).toBe(true)
    port.returnToLobby()
    expect(port.players).toHaveLength(0)
    scope.stop()
  })
  it('3D未就绪时不开局，取消旧开局不会复活旧计时器', async () => {
    vi.useFakeTimers()
    const scope = effectScope()
    const port = scope.run(() => useYaotongPort())!
    let ready!: () => void
    const loading = port.startGame('east', {
      waitForTableReady: () => new Promise<void>((resolve) => (ready = resolve)),
    })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(port.wall.value).toHaveLength(108)
    expect(port.local.state.value!.players.every((p) => p.draws === 0)).toBe(true)
    port.returnToLobby()
    ready()
    await loading
    expect(port.phase.value).toBe('lobby')
    scope.stop()
  })
  it('胡牌先走原版动作与3D演出，再向原版结算提供分数', async () => {
    vi.useFakeTimers()
    const scope = effectScope()
    const port = scope.run(() => useYaotongPort())!
    const state = createGame({ dealer: 0, dice: [2, 3] })
    state.phase = 'discard'
    state.current = 0
    state.players[0].hand = [
      'm2',
      'm3',
      'm4',
      'm5',
      'm6',
      'm7',
      's2',
      's3',
      's4',
      'p6',
      'p6',
      's7',
      's8',
      's9',
    ].map((t) => fromSharedTile(t as any))
    state.players[0].drawn = 26
    state.players[0].draws = 2
    port.local.state.value = state
    port.userHu()
    expect(port.phase.value).toBe('win-effect')
    expect(port.tableActionEvent.value?.type).toBe('self-draw')
    expect(port.result.value).toBeNull()
    await vi.advanceTimersByTimeAsync(2100)
    expect(port.winEffect.value?.winnerIndex).toBe(0)
    expect(port.winPresentation.value?.sourceIndex).toBe(13)
    await vi.advanceTimersByTimeAsync(3000)
    expect(port.phase.value).toBe('settled')
    expect(port.result.value?.scoreChanges.reduce((sum, p) => sum + p.delta, 0)).toBe(0)
    expect(port.revealHands.value).toBe(true)
    scope.stop()
  })
  it('原报锁手通过共同入口保护，幺筒以癞标记而不是翻精', () => {
    expect(toSharedTile(9)).toBe('p1')
    expect(fromSharedTile('s9')).toBe(26)
    expect(tileMarkerFor('p1', ['p1'], [], true)).toBe('laizi')
    expect(tileMarkerFor('p1', ['p1'])).toBe('joker')
    expect(tileMarkerFor('white', ['white'])).toBe('laizi')
  })
  it('108张墙只有54墩，14/13/14/13分布且补尾不回绕136槽', () => {
    const positions = Array.from({ length: 108 }, (_, i) => wallTilePlacement(i, 0, 108, 0, 108))
    expect(new Set(positions.map((p) => `${p.stackIndex}/${p.layer}`)).size).toBe(108)
    expect(Math.max(...positions.map((p) => p.stackIndex))).toBe(53)
    expect(wallTilePlacement(0, 108, 1, 107, 108).stackIndex).toBe(0)
    const slots = Array.from({ length: 54 }, (_, i) => wallStackSlot(i, 108))
    expect(slots.filter((s) => s.z === slots[0].z)).toHaveLength(14)
    expect(slots.filter((s) => s.x === slots[14].x)).toHaveLength(13)
    expect(slots.filter((s) => s.z === slots[27].z)).toHaveLength(14)
    expect(slots.filter((s) => s.x === slots[41].x)).toHaveLength(13)
  })
})
