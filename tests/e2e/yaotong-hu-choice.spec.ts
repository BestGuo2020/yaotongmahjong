import { expect, test } from '@playwright/test'

for (const width of [1280, 844]) {
  for (const scenario of ['hu', 'hu-response']) {
    for (const flipped of [false, true]) {
      test(`翻鸡前确认胡法：${scenario} 翻九筒=${flipped} ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: width === 844 ? 390 : 720 })
        await page.emulateMedia({ reducedMotion: 'reduce' })
        const errors: string[] = []
        page.on('pageerror', error => errors.push(error.message))
        await page.goto(`/tests/e2e/fixtures/yaotong-guidance.html?scenario=${scenario}${flipped ? '&flip=yao' : ''}`)
        await expect(page.locator('.game-table-hud')).toHaveAttribute('data-wall-count', '1')
        await expect(page.getByRole('dialog', { name: '选择胡牌方式' })).toHaveCount(0)
        const hard = scenario === 'hu-response'
        if (hard) await page.getByRole('button', { name: '胡', exact: true }).click()
        else {
          await expect(page.getByRole('button', { name: '胡', exact: true })).toHaveCount(0)
          await expect(page.getByRole('button', { name: /^胡龙七对＋硬胡/ })).toBeVisible()
          await page.getByRole('button', { name: /^胡双龙七/ }).click()
        }
        const value = await page.evaluate(() => (window as unknown as {
          adoptedHu: () => { naturalYaos: number; wildcards: number }
        }).adoptedHu())
        expect(value).toMatchObject({ naturalYaos: hard ? 2 : 0, wildcards: hard ? 0 : 2 })
        const summary = page.getByRole('list', { name: '最终采用的胡牌方案' })
        await expect(summary).toBeVisible({ timeout: 15000 })
        await expect(summary).toContainText(hard ? '龙七对＋硬胡' : '双龙七')
        await expect(summary).toContainText(hard ? '本牌 2 张，赖子 0 张' : '本牌 0 张，赖子 2 张')
        await summary.scrollIntoViewIfNeeded()
        await page.screenshot({ path: `tmp/yaotong-preflip-hu-${scenario}-${flipped}-${width}.png` })
        expect(errors).toEqual([])
      })
    }
  }
  test(`自行选硬龙七搏翻鸡，选择前显示并列按钮而非弹窗 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 844 ? 390 : 720 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/tests/e2e/fixtures/yaotong-guidance.html?scenario=hu&flip=yao')
    await expect(page.locator('.table-loading')).toHaveCount(0, { timeout: 30000 })
    const hard = page.getByRole('button', { name: /^胡龙七对＋硬胡/ })
    await expect(hard).toBeInViewport({ ratio: 1 })
    await expect(page.getByRole('button', { name: /^胡双龙七/ })).toBeInViewport({ ratio: 1 })
    await page.screenshot({ path: `tmp/yaotong-preflip-buttons-${width}.png` })
    await hard.click()
    const summary = page.getByRole('list', { name: '最终采用的胡牌方案' })
    await expect(summary).toContainText('本牌 2 张，赖子 0 张')
    await expect(page.locator('.self-round-score strong')).toHaveText('+405')
  })
  test(`首鸡和跟冲存活横放，碰三张同向；首张被碰后不递补 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 844 ? 390 : 720 })
    await page.goto('/tests/e2e/fixtures/yaotong-guidance.html?scenario=river')
    const canvas = page.locator('canvas.mahjong-scene')
    await expect(canvas).toHaveAttribute('data-sideways-discards', '[[0,2],[0],[0],[0]]')
    await expect(canvas).toHaveAttribute('data-neutral-peng', '1')
    await expect(page.locator('.table-loading')).toHaveCount(0, { timeout: 30000 })
    await page.screenshot({ path: `tmp/yaotong-first-chicken-${width}.png` })
    await page.evaluate(() => (window as unknown as { setGuidanceScenario: (name: string) => void }).setGuidanceScenario('river-claimed'))
    await expect(canvas).toHaveAttribute('data-sideways-discards', '[[1],[0],[0],[0]]')
  })
}
