import { effectScope, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGame } from './engine'
import { useYaotongGame } from './useYaotongGame'

afterEach(() => vi.useRealTimers())

describe('幺筒对局生命周期', () => {
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
    game.state.value = createGame({ dealer: 0, dice: [2, 3] })
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
