import { effectScope, watch } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useYaotongPort } from './useYaotongPort'
import { player, ready, table } from './auditFixtures'
import { OPENING_PACE_MS } from '../../shared/runtime/localOpening'

beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('window', globalThis) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

it.each(['easy', 'hard'] as const)('复现原报后对家点炮，本家胡牌后下一局应继续发牌与行牌：%s', async mode => {
  const scope = effectScope()
  try {
    let seed = 1234
    vi.spyOn(Math, 'random').mockImplementation(() => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32))
    const game = scope.run(() => useYaotongPort())!
    game.local.mode.value = mode
    // 与 App 的开局/规则面板暂停接线一致。
    scope.run(() => watch(game.openingActive, opening => { if (!opening) game.local.paused.value = false }))
    const state = table()
    state.phase = 'original'
    state.dealer = state.current = 2
    state.players[0] = { ...ready(), draws: 0 }
    state.players[2] = player('147m 258p 369s 2468s', { draws: 0 })
    state.wall = [26, 3, 5, 8, 12, 14, 17, 20, 23]
    game.local.state.value = state
    expect(game.local.dispatch({ type: 'original', declare: true })).toBe(true)
    for (const seat of [1, 2, 3]) game.local.dispatch({ type: 'original', declare: false }, seat)
    await vi.advanceTimersByTimeAsync(OPENING_PACE_MS.firstTurn)
    expect(game.local.dispatch({ type: 'discard', index: 13 }, 2)).toBe(true)
    game.userHu()
    await vi.advanceTimersByTimeAsync(15_000)
    expect(state.result).toMatchObject({ kind: 'win', winKind: 'discard', source: 2, winners: [0], nextDealer: 0 })
    expect(game.result.value).not.toBeNull()
    void game.nextRound()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(game.local.state.value!.handNumber).toBe(2)
    expect(game.local.user.value!.declaration).toBe('none')
    expect(game.local.error.value).toBe('')
    expect(game.openingActive.value).toBe(false)
    expect(game.local.paused.value).toBe(false)
    if (game.original.value) game.local.dispatch({ type: 'original', declare: false })
    await vi.advanceTimersByTimeAsync(1500)
    expect(game.local.state.value!.phase).toBe('discard')
    expect(game.local.user.value!.hand).toHaveLength(14)
    expect(game.isUserTurn.value).toBe(true)
  } finally { scope.stop() }
})
