import { afterEach, expect, it, vi } from 'vitest'
import { createPresentationScheduler } from './presentationScheduler'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
it('先取消旧代际，再退出未完成的开局wait，旧回调不再执行', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('window', globalThis)
  let generation = 0
  const timer = createPresentationScheduler({
    controllers: [],
    stopCountdown() {},
    cancelOpening() {
      generation++
    },
  })
  const oldGeneration = generation,
    done = vi.fn(),
    stale = vi.fn()
  const waiting = timer.wait(5000).then(() => {
    done()
    if (generation === oldGeneration) stale()
  })
  timer.later(stale, 800)
  timer.clear()
  await waiting
  expect(done).toHaveBeenCalledOnce()
  expect(stale).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})
