import { expect, test } from '@playwright/test'

for (const theme of ['jade', 'rosewood', 'happyMahjong', 'llm', 'llmAnime']) {
  for (const viewport of [{ width: 912, height: 666 }, { width: 844, height: 390 }]) {
    test(`${theme} ${viewport.width}：结算排名入场全程不撑出滚动条`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await page.goto(`/tests/e2e/fixtures/yaotong-final.html?round&self&double&closed&theme=${theme}`)
      // Classic scrollbars consume space on Windows; overlay scrollbars can conceal the regression.
      await page.addStyleTag({ content: '.settlement-overview-panel::-webkit-scrollbar { width: 16px; height: 16px; }' })
      await page.getByRole('button', { name: '查看结算', exact: true }).click()
      const panel = page.getByRole('tabpanel', { name: '概览', exact: true })
      const samples = await panel.evaluate(async panel => {
        const animations = panel.getAnimations({ subtree: true })
        animations.forEach(animation => animation.pause())
        const samples = []
        for (const time of [0, 80, 160, 240, 400, 600, 800]) {
          animations.forEach(animation => { animation.currentTime = time })
          await new Promise(requestAnimationFrame)
          samples.push({ time, horizontal: panel.scrollWidth - panel.clientWidth, vertical: panel.scrollHeight - panel.clientHeight })
        }
        return samples
      })
      for (const sample of samples) {
        expect(sample.horizontal, `${sample.time}ms 不应有横向溢出`).toBeLessThanOrEqual(1)
        expect(sample.vertical, `${sample.time}ms 不应挤出纵向滚动条`).toBeLessThanOrEqual(1)
      }
      for (const row of await page.locator('.round-rankings article').all()) await expect(row).toBeInViewport({ ratio: 1 })
      await expect(page.getByRole('button', { name: '继续', exact: true })).toBeInViewport({ ratio: 1 })
      await page.screenshot({ path: `tmp/settlement-motion-${theme}-${viewport.width}.png` })
    })
  }
}

test('明细仍可滚动，切回概览与重新打开时不遗留滚动条', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await page.goto('/tests/e2e/fixtures/yaotong-final.html?round&self&double')
  await page.getByRole('tab', { name: '分数明细', exact: true }).click()
  await page.locator('.yaotong-ledger summary').click()
  const details = page.getByRole('tabpanel', { name: '分数明细', exact: true })
  expect(await details.evaluate(panel => {
    panel.scrollTop = panel.scrollHeight
    return panel.scrollTop
  })).toBeGreaterThan(0)
  await expect(page.getByRole('button', { name: '继续', exact: true })).toBeInViewport({ ratio: 1 })
  await page.getByRole('tab', { name: '概览', exact: true }).click()
  await page.getByRole('button', { name: '查看牌桌', exact: true }).click()
  await page.getByRole('button', { name: '查看结算', exact: true }).click()
  const overflow = await page.getByRole('tabpanel', { name: '概览', exact: true }).evaluate(panel =>
    Math.max(panel.scrollWidth - panel.clientWidth, panel.scrollHeight - panel.clientHeight))
  expect(overflow).toBeLessThanOrEqual(1)
})
