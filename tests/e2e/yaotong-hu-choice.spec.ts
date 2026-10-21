import { expect, test } from '@playwright/test'

for (const width of [1280, 844]) {
  for (const scenario of ['hu', 'hu-response']) {
    for (const flipped of [false, true]) {
      test(`点击胡后自动按最终收益择高：${scenario} 翻九筒=${flipped} ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: width === 844 ? 390 : 720 })
        await page.emulateMedia({ reducedMotion: 'reduce' })
        const errors: string[] = []
        page.on('pageerror', error => errors.push(error.message))
        await page.goto(`/tests/e2e/fixtures/yaotong-guidance.html?scenario=${scenario}${flipped ? '&flip=yao' : ''}`)
        await page.getByRole('button', { name: '胡', exact: true }).click()
        await expect(page.getByRole('dialog', { name: '选择胡牌方式' })).toHaveCount(0)
        const hard = flipped || scenario === 'hu-response'
        const value = await page.evaluate(() => (window as unknown as {
          adoptedHu: () => { naturalYaos: number; wildcards: number }
        }).adoptedHu())
        expect(value).toMatchObject({ naturalYaos: hard ? 2 : 0, wildcards: hard ? 0 : 2 })
        const summary = page.getByRole('list', { name: '最终采用的胡牌方案' })
        await expect(summary).toBeVisible({ timeout: 15000 })
        await expect(summary).toContainText(hard ? '龙七对＋硬胡' : '双龙七')
        await expect(summary).toContainText(hard ? '本牌 2 张，赖子 0 张' : '本牌 0 张，赖子 2 张')
        if (!hard) await expect(summary).toContainText('赖子当')
        await summary.scrollIntoViewIfNeeded()
        await page.screenshot({ path: `tmp/yaotong-auto-hu-${scenario}-${flipped}-${width}.png` })
        await page.getByRole('tab', { name: '分数明细', exact: true }).click()
        await expect(page.locator('.yaotong-hand-score')).toContainText(hard ? '龙七对' : '双龙七')
        await expect(page.locator('.yaotong-hand-score .yaotong-yao-use'))
          .toContainText(hard ? '本牌 2 张，赖子 0 张' : '本牌 0 张，赖子 2 张')
        expect(errors).toEqual([])
      })
    }
  }
}
