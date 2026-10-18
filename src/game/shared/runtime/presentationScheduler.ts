import { createTimerScheduler } from './timerScheduler'

/** Wrap the shared scheduler without changing its WS/P2P contract.
 * The caller must invalidate its generation in cancelOpening before cancelled waits resume.
 */
export function createPresentationScheduler(options: Parameters<typeof createTimerScheduler>[0]) {
  const scheduler = createTimerScheduler(options)
  const waiting = new Set<() => void>()
  function wait(delay: number): Promise<void> {
    return new Promise((resolve) => {
      const finish = () => {
        waiting.delete(finish)
        resolve()
      }
      waiting.add(finish)
      scheduler.later(finish, delay)
    })
  }
  function clear() {
    scheduler.clear()
    waiting.forEach((finish) => finish())
    waiting.clear()
  }
  return { later: scheduler.later, wait, clear }
}
