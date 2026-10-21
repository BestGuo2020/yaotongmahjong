import { expect, test } from '@playwright/test'

for (const width of [1280, 844]) {
  for (const [opening, label] of [['heaven', '天胡'], ['earth', '地胡'], ['after-peng', '']] as const) {
    test(`首次摸牌结算标注：${opening} ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 844 ? 390 : 720 })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(`/tests/e2e/fixtures/yaotong-final.html?round&opening=${opening}`)
      await page.getByRole('tab', { name: '分数明细', exact: true }).click()
      const ledger = page.locator('.yaotong-ledger')
      await ledger.locator('summary').click()
      const rows = ledger.locator('tbody')
      if (label) {
        await expect(rows).toContainText(label)
        await expect(rows).not.toContainText(label === '天胡' ? '地胡' : '天胡')
      } else {
        await expect(rows).toContainText('硬胡')
        await expect(rows).not.toContainText(/天胡|地胡/)
      }
      await expect(rows).not.toContainText('天胡／地胡')
      await page.screenshot({ path: `tmp/yaotong-opening-${opening}-${width}.png` })
      expect(errors).toEqual([])
    })
  }
}
