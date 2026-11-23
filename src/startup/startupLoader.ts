type StartupTask = () => Promise<unknown>

/** Wait for each attempt to finish and retain successes for the next attempt. */
export function createStartupLoader(
  tasks: readonly StartupTask[],
  report: (completed: number, total: number) => void,
  concurrency = 8,
) {
  const remaining = new Set(tasks)
  let inFlight: Promise<void> | undefined

  async function loadRemaining() {
    report(tasks.length - remaining.size, tasks.length)
    const queue = [...remaining].values()
    const errors: unknown[] = []

    async function work() {
      for (const task of queue) {
        try {
          await task()
        } catch (error) {
          errors.push(error)
          continue
        }
        remaining.delete(task)
        report(tasks.length - remaining.size, tasks.length)
      }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, remaining.size) }, work))
    if (errors.length) throw new AggregateError(errors, '游戏资源加载失败')
  }

  return function load() {
    inFlight ??= loadRemaining().finally(() => { inFlight = undefined })
    return inFlight
  }
}
