import { expect, test } from '@playwright/test'

const themes = ['jade', 'rosewood', 'happyMahjong', 'llm', 'llmAnime']
for (const [index, theme] of themes.entries()) {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 844, height: 390 }]) {
    const source = (index + (viewport.width === 844 ? 1 : 0)) % 4
    const winners = index % 2 + 2
    test(`${theme} ${viewport.width}：${source}号位放炮${winners}响先播放共用字效`, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.setViewportSize(viewport)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto(`/tests/e2e/fixtures/yaotong-multi-win.html?theme=${theme}&source=${source}&winners=${winners}${index === 0 ? '&hot' : ''}`)
      await expect(page.locator('.game-table-hud canvas')).toBeVisible({ timeout: 30_000 })
      await page.getByRole('button', { name: '播放结算' }).click()
      const intro = page.locator('[data-multi-intro="1"]')
      await expect(intro).toBeVisible()
      await expect(intro).toHaveAttribute('data-source-index', String(source))
      await expect(intro.getByRole('img', { name: '一炮多响' })).toBeVisible()
      await expect(intro).toBeInViewport({ ratio: 1 })
      const root = page.locator('.game-app')
      for (const stage of ['action', 'effect', 'reveal', 'result']) await expect(root).toHaveAttribute(`data-${stage}`, 'false')
      await page.screenshot({ path: `tmp/yaotong-multi-${theme}-${viewport.width}.png` })
      await expect(intro).toHaveCount(0, { timeout: 4_000 })
      await expect(root).toHaveAttribute('data-result', 'true', { timeout: 5_000 })
      expect(errors).toEqual([])
    })
  }
}
