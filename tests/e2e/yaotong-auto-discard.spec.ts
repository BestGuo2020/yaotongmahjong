import { expect, test } from '@playwright/test'

for (const viewport of [{ width: 1280, height: 720 }, { width: 844, height: 390 }]) {
  for (const scenario of ['ready', 'original']) {
    test(`${scenario}声明后无需点击手牌，自动摸切并保留原手牌：${viewport.width}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.goto(`/tests/e2e/fixtures/yaotong-auto-discard.html?scenario=${scenario}`)
      const root = page.locator('.game-app')
      const held = await root.getAttribute('data-held')
      if (scenario === 'original') await page.getByRole('button', { name: '原报', exact: true }).click()
      else {
        await page.getByRole('button', { name: '报听', exact: true }).click()
        await page.locator('.hand-rack.playable .mahjong-tile').last().click()
      }
      await expect(root).toHaveAttribute('data-declaration', scenario)
      await expect(root).toHaveAttribute('data-auto-discard', 'true', { timeout: 15_000 })
      await expect(page.locator('.hand-rack.playable')).toHaveCount(0)
      await expect(root).toHaveAttribute('data-discards', scenario === 'original' ? '1' : '2', { timeout: 15_000 })
      await expect(root).toHaveAttribute('data-held', held!)
      await expect(root).toHaveAttribute('data-autoplay', 'false')
      await page.screenshot({ path: `tmp/auto-discard-${scenario}-${viewport.width}.png` })
    })
  }
}

test('报听后摸到胡牌仍等待确认，不自动丢牌或代胡', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/yaotong-auto-discard.html?scenario=hu')
  const hu = page.getByRole('button', { name: '胡', exact: true })
  await expect(hu).toBeVisible()
  await page.clock.install()
  await page.clock.fastForward(3000)
  const root = page.locator('.game-app')
  await expect(root).toHaveAttribute('data-auto-discard', 'false')
  await expect(root).toHaveAttribute('data-discards', '0')
  await expect(root).toHaveAttribute('data-result', '')
  await hu.click()
  await expect(root).toHaveAttribute('data-result', 'win')
})

test('未声明的普通听牌仍由玩家手动出牌', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/yaotong-auto-discard.html')
  await expect(page.locator('.hand-rack.playable')).toBeVisible()
  await page.clock.install()
  await page.clock.fastForward(3000)
  await expect(page.locator('.game-app')).toHaveAttribute('data-declaration', 'none')
  await expect(page.locator('.game-app')).toHaveAttribute('data-discards', '0')
  await expect(page.locator('.hand-rack.playable')).toBeVisible()
})
