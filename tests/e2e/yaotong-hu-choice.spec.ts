import { expect, test } from '@playwright/test'

for (const width of [1280, 844]) {
  for (const scenario of ['hu', 'hu-response']) {
    test(`选择软硬胡并保留本牌用法：${scenario} ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 844 ? 390 : 720 })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(`/tests/e2e/fixtures/yaotong-guidance.html?scenario=${scenario}`)
      await page.getByRole('button', { name: '胡', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: '选择胡牌方式' })
      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole('button', { name: /双龙七/ })).toBeVisible()
      const hard = dialog.getByRole('button', { name: /龙七对.*硬胡/ })
      await expect(hard).toContainText('2 张本牌，0 张赖子')
      await expect(hard).toBeInViewport({ ratio: 1 })
      const best = dialog.locator('.hu-choice').first()
      await expect(best).toContainText(scenario === 'hu' ? '双龙七' : '硬胡')
      await page.screenshot({ path: `tmp/yaotong-hu-choice-${scenario}-${width}.png` })
      await page.keyboard.press('Escape')
      await expect(dialog).not.toBeVisible()
      await expect(page.getByRole('button', { name: '胡', exact: true })).toBeFocused()
      await page.getByRole('button', { name: '胡', exact: true }).click()
      await hard.click()
      await expect(dialog).not.toBeVisible()
      const selected = await page.evaluate(() => (window as unknown as { selectedHu: () => { naturalYaos: number; wildcards: number } }).selectedHu())
      expect(selected).toMatchObject({ naturalYaos: 2, wildcards: 0 })
      expect(errors).toEqual([])
    })
  }
}
