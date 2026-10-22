import { effectScope, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGame } from './engine'
import { useYaotongGame, YAOTONG_REACTION_MS } from './useYaotongGame'
import { player, ready, table, unready } from './auditFixtures'
import { AI_DELAYS } from '../../core/controllers/playerController'
import { OPENING_PACE_MS } from '../../shared/runtime/localOpening'
import { PACE_MS } from '../../core/local/localGameConfig'

afterEach(() => vi.useRealTimers())

describe('幺筒对局生命周期', () => {
  it.each((['easy', 'hard'] as const).flatMap(mode =>
    (['ready', 'original'] as const).map(declaration => ({ mode, declaration })),
  ))('$mode模式$declaration后自动摸切，不开启整局托管、不改变锁定手牌', async ({ mode, declaration }) => {
    vi.useFakeTimers()
    const scope = effectScope()
    try {
      const game = scope.run(useYaotongGame)!
      const state = table()
      state.wall = [4, 5, 6, 7, 8]
      state.players[0] = ready()
      game.mode.value = mode
      if (declaration === 'original') {
        state.phase = 'original'
        state.originalDecisions = [false, true, true, true]
        state.players[0].draws = 0
        game.state.value = state
        game.dispatch({ type: 'original', declare: true })
        await vi.advanceTimersByTimeAsync(OPENING_PACE_MS.firstTurn)
      } else {
        state.players[0].hand.push(8)
        state.players[0].drawn = 8
        state.players[0].draws = 1
        game.state.value = state
        game.dispatch({ type: 'discard', index: 13, declare: true })
        await vi.advanceTimersByTimeAsync(YAOTONG_REACTION_MS)
        for (const seat of [1, 2, 3]) {
          expect(state.current).toBe(seat)
          game.dispatch({ type: 'discard', index: state.players[seat].hand.length - 1 }, seat)
          await vi.advanceTimersByTimeAsync(YAOTONG_REACTION_MS)
        }
      }
      expect(game.autoplay.value).toBe(false)
      expect(game.autoDiscard.value).toBe(true)
      const held = state.players[0].hand.slice(0, -1)
      const drawn = state.players[0].drawn
      const discarded = state.players[0].river.length
      await vi.advanceTimersByTimeAsync(AI_DELAYS.turn - 1)
      expect(state.players[0].river).toHaveLength(discarded)
      await vi.advanceTimersByTimeAsync(1)
      expect(state.players[0].river).toHaveLength(discarded + 1)
      expect(state.players[0].river.at(-1)!.tile).toBe(drawn)
      expect(state.players[0].hand).toEqual(held)
      expect(state.players[0].drawn).toBeNull()
      expect(state.players[0].declaration).toBe(declaration)
      expect(game.error.value).toBe('')
    } finally { scope.stop() }
  })
  it.each([false, true])('报听后自摸可胡时等玩家确认，不自动出牌或代胡，必须胡=%s', async mandatory => {
    vi.useFakeTimers()
    const scope = effectScope()
    try {
      const game = scope.run(useYaotongGame)!
      const state = table()
      state.players[0] = player('234567m 234s 66p 789s', { declaration: 'ready', drawn: 26 })
      if (mandatory) state.players[1].declaration = 'ready'
      game.state.value = state
      expect(game.self.value).toMatchObject({ hu: true, mandatory })
      expect(game.autoDiscard.value).toBe(false)
      await vi.advanceTimersByTimeAsync(3000)
      expect(state.players[0].river).toHaveLength(0)
      expect(state.result).toBeNull()
      game.dispatch({ type: 'hu' })
      expect(state.result?.winners).toEqual([0])
    } finally { scope.stop() }
  })
  it('报听后可胡他家出牌时保留响应，不自动过牌', async () => {
    vi.useFakeTimers()
    const scope = effectScope()
    try {
      const game = scope.run(useYaotongGame)!
      const state = table()
      state.current = 1
      state.players[0] = { ...ready(), declaration: 'ready' }
      state.players[1].hand.push(26)
      state.players[1].drawn = 26
      game.state.value = state
      game.dispatch({ type: 'discard', index: 13 }, 1)
      expect(game.response.value?.hu).toBe(true)
      await vi.advanceTimersByTimeAsync(3000)
      expect(state.phase).toBe('response')
      expect(state.pending!.choices[0]).toBeUndefined()
      game.dispatch({ type: 'respond', action: 'hu' })
      expect(state.result?.winners).toEqual([0])
    } finally { scope.stop() }
  })
  it.each(['pause', 'leave', 'dispose'] as const)('报听摸切定时器在%s时取消，不操作旧牌局', async action => {
    vi.useFakeTimers()
    const scope = effectScope()
    try {
      const game = scope.run(useYaotongGame)!
      const state = table()
      state.players[0] = player('234567m 234s 66p 78s 9m', { declaration: 'ready', drawn: 8 })
      game.state.value = state
      await vi.advanceTimersByTimeAsync(200)
      if (action === 'pause') game.paused.value = true
      else if (action === 'leave') game.leave()
      else scope.stop()
      await vi.advanceTimersByTimeAsync(2000)
      expect(state.players[0].river).toHaveLength(0)
      if (action === 'pause') {
        game.paused.value = false
        await vi.advanceTimersByTimeAsync(AI_DELAYS.turn)
        expect(state.players[0].river).toHaveLength(1)
      }
    } finally { scope.stop() }
  })
  it('普通听牌未声明时仍由玩家决定弃牌', async () => {
    vi.useFakeTimers()
    const scope = effectScope()
    try {
      const game = scope.run(useYaotongGame)!
      const state = table()
      state.players[0] = player('234567m 234s 66p 78s 9m', { drawn: 8 })
      game.state.value = state
      expect(game.autoDiscard.value).toBe(false)
      await vi.advanceTimersByTimeAsync(3000)
      expect(state.players[0].river).toHaveLength(0)
      expect(state.phase).toBe('discard')
    } finally { scope.stop() }
  })
  it('托管到终局后停在账单，只有明确续局才开下一局', async () => {
    vi.useFakeTimers()
    const scope = effectScope()
    const game = scope.run(useYaotongGame)!
    game.begin(4)
    game.autoplay.value = true
    await nextTick()
    await vi.runAllTimersAsync()
    expect(game.state.value!.phase).toBe('settled')
    expect(game.state.value!.handNumber).toBe(1)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(game.state.value!.handNumber).toBe(1)
    game.autoplay.value = false
    game.next()
    expect(game.state.value!.handNumber).toBe(2)
    scope.stop()
  })
  it('暂停会取消已安排的AI动作，恢复后继续原报窗口', async () => {
    vi.useFakeTimers()
    const scope = effectScope()
    const game = scope.run(useYaotongGame)!
    const state = createGame({ dealer: 0, dice: [2, 3] })
    state.players[0].hand = ready().hand
    game.state.value = state
    await nextTick()
    game.paused.value = true
    await nextTick()
    await vi.advanceTimersByTimeAsync(1000)
    expect(game.state.value!.originalDecisions).toEqual([false, false, false, false])
    game.paused.value = false
    await nextTick()
    await vi.advanceTimersByTimeAsync(1000)
    expect(game.state.value!.originalDecisions).toEqual([false, true, true, true])
    expect(game.state.value!.phase).toBe('original')
    scope.stop()
  })
  it('无原报资格时自动确认，与AI共用500ms窗口，650ms后庄家首摸', async () => {
    vi.useFakeTimers()
    const scope = effectScope()
    try {
      const game = scope.run(useYaotongGame)!
      const state = createGame({ dealer: 0, dice: [2, 3] })
      state.players[0].hand = unready().hand
      game.state.value = state
      await vi.advanceTimersByTimeAsync(AI_DELAYS.claim - 1)
      expect(state.originalDecisions).toEqual([false, false, false, false])
      await vi.advanceTimersByTimeAsync(1)
      expect(state.originalDecisions).toEqual([true, true, true, true])
      expect(game.flowStep.value).toBe('first-draw')
      expect(state.players[0].declaration).toBe('none')
      await vi.advanceTimersByTimeAsync(OPENING_PACE_MS.firstTurn - 1)
      expect(state.players[0].hand).toHaveLength(13)
      await vi.advanceTimersByTimeAsync(1)
      expect(state.players[0].hand).toHaveLength(14)
      expect(state.players[0].draws).toBe(1)
    } finally {
      scope.stop()
    }
  })
  it.each([false, true])('有原报资格时等玩家选择，不自动拒绝或代报，选择=%s', async (declare) => {
    vi.useFakeTimers()
    const scope = effectScope()
    try {
      const game = scope.run(useYaotongGame)!
      const state = createGame({ dealer: 0, dice: [2, 3] })
      state.players[0].hand = ready().hand
      game.state.value = state
      await vi.advanceTimersByTimeAsync(3000)
      expect(state.originalDecisions).toEqual([false, true, true, true])
      expect(state.players[0].draws).toBe(0)
      game.dispatch({ type: 'original', declare })
      expect(state.players[0].declaration).toBe(declare ? 'original' : 'none')
      await vi.advanceTimersByTimeAsync(OPENING_PACE_MS.firstTurn)
      expect(state.players[0].draws).toBe(1)
    } finally {
      scope.stop()
    }
  })
  it('离桌、组件卸载均清除AI定时器，旧局不会继续改变', async () => {
    vi.useFakeTimers()
    const scope = effectScope()
    const game = scope.run(useYaotongGame)!
    game.begin(8)
    await nextTick()
    const old = game.state.value!
    game.leave()
    await nextTick()
    await vi.advanceTimersByTimeAsync(1000)
    expect(game.state.value).toBeNull()
    expect(old.originalDecisions).toEqual([false, false, false, false])
    game.begin(4)
    await nextTick()
    scope.stop()
    expect(vi.getTimerCount()).toBe(0)
  })
})
