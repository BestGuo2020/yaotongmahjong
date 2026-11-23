export function createStartupScreen() {
  const screen = document.getElementById('game-startup')
  const status = document.getElementById('startup-status')
  const percent = document.getElementById('startup-percent')
  const detail = document.getElementById('startup-detail')
  const progress = document.querySelector<HTMLProgressElement>('#startup-progress')
  const retry = document.querySelector<HTMLButtonElement>('#startup-retry')

  return {
    update(completed: number, total: number) {
      const value = Math.floor(completed * 100 / total)
      if (retry) { retry.hidden = true; retry.onclick = null }
      const message = completed === total ? '正在进入游戏' : '正在准备游戏资源'
      if (status && status.textContent !== message) status.textContent = message
      if (progress) progress.value = value
      if (percent) { percent.hidden = false; percent.textContent = `${value}%` }
      if (detail) detail.textContent = `已就绪 ${completed} / ${total} 项`
    },
    fail(message: string, onRetry: () => void) {
      if (status) status.textContent = message
      if (retry) { retry.hidden = false; retry.onclick = onRetry }
    },
    remove() { screen?.remove() },
  }
}
