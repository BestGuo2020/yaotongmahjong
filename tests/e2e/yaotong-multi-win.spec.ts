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
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await page.goto(`/tests/e2e/fixtures/yaotong-multi-win.html?patterns&theme=${theme}&source=${source}&winners=${winners}${index === 0 ? '&hot' : ''}`)
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
      const seats = [0, 1, 2, 3].filter(seat => seat !== source).slice(0, winners)
      const action = page.locator('[data-action-type="discard-win"]')
      await expect(action).toHaveCount(winners)
      for (const seat of seats) {
        const actor = page.locator(`[data-action-type="discard-win"][data-action-seat="${seat}"]`)
        await expect(actor).toBeVisible()
        await expect(actor).toContainText('胡')
        await expect(actor).not.toContainText('清一色')
        await expect(actor).toBeInViewport({ ratio: 1 })
      }
      const titles = page.locator('.yaotong-win-patterns [data-title-seat]')
      await expect(titles).toHaveCount(0)
      await expect(titles).toHaveCount(winners, { timeout: 4_000 })
      // The outgoing portrait can retain an invisible DOM node during its CSS leave animation.
      // Sample the readable title window instead of waiting for that node's removal.
      await expect(root).toHaveAttribute('data-action', 'false')
      await expect(titles.first()).toHaveCSS('opacity', '1')
      await expect(page.locator('canvas.mahjong-scene')).toHaveAttribute('data-win-effect-seats', JSON.stringify(seats))
      expect(await titles.evaluateAll(elements => elements.map(element => Number(element.getAttribute('data-title-seat'))))).toEqual(seats)
      for (const [i, label] of ['清一色', '七小对', '碰碰胡'].slice(0, winners).entries()) {
        await expect(titles.nth(i).getByRole('img', { name: label, exact: true })).toBeVisible()
        await expect(titles.nth(i)).toBeInViewport({ ratio: 1 })
      }
      await expect(root).toHaveAttribute('data-reveal', 'false')
      await page.screenshot({ path: `tmp/yaotong-pattern-${theme}-${viewport.width}.png` })
      await expect(root).toHaveAttribute('data-result', 'true', { timeout: 5_000 })
      await expect(titles).toHaveCount(0)
      await expect(action).toHaveCount(0)
      await expect(page.locator('canvas.mahjong-scene')).toHaveAttribute('data-win-effect-seats', '[]')
      await expect(page.locator('canvas.mahjong-scene')).toHaveAttribute('data-win-display-seats', JSON.stringify(seats))
      expect(errors).toEqual([])
    })
  }
}

test('单家自摸先报自摸，再展示清一色，结算后清除牌型字效', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/yaotong-multi-win.html?patterns&self')
  await page.getByRole('button', { name: '播放结算' }).click()
  await expect(page.locator('[data-action-type="self-draw"]')).toContainText('自摸')
  await expect(page.locator('[data-multi-intro]')).toHaveCount(0)
  await expect(page.locator('.yaotong-win-patterns')).toHaveCount(0)
  await expect(page.locator('.yaotong-win-patterns').getByRole('img', { name: '清一色', exact: true })).toBeVisible()
  await expect(page.locator('.game-app')).toHaveAttribute('data-action', 'false')
  await expect(page.locator('.game-app')).toHaveAttribute('data-result', 'true', { timeout: 5_000 })
  await expect(page.locator('.yaotong-win-patterns')).toHaveCount(0)
})
