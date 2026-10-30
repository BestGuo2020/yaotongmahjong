import { expect, test } from '@playwright/test'

for (const width of [1280, 844]) {
  test(`未听赔付明细：杠分反向，碰杠鸡按原价，翻鸡新增分不计赔 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 844 ? 390 : 720 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('/tests/e2e/fixtures/yaotong-final.html?round&unready-compensation')
    await page.getByRole('tab', { name: '分数明细', exact: true }).click()
    const ledger = page.locator('.yaotong-ledger')
    await ledger.locator('summary').click()
    const rows = ledger.locator('tbody tr')
    const kong = rows.filter({ hasText: '你 → 听风' }).filter({ hasText: '未听反赔：八筒暗杠' })
    await expect(kong).toHaveCount(1)
    await expect(kong.locator('.ledger-amount')).toHaveText('−5分')
    const chicken = rows.filter({ hasText: '你 → 听风' }).filter({ hasText: '未听赔露出鸡' })
    await expect(chicken).toContainText('一筒·预冲 30分；八筒·暗杠 10分')
    await expect(chicken.locator('.ledger-amount')).toHaveText('−40分')
    await expect(chicken).not.toContainText(/五万|翻鸡|额外|×3/)
    await kong.scrollIntoViewIfNeeded()
    await expect(page.getByRole('button', { name: '继续', exact: true })).toBeInViewport({ ratio: 1 })
    await page.screenshot({ path: `tmp/yaotong-unready-compensation-${width}.png` })
    expect(errors).toEqual([])
  })
}
