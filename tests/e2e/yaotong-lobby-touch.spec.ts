import { expect, test } from '@playwright/test'

test.use({ hasTouch: true, isMobile: true })

for (const theme of ['jade', 'happyMahjong', 'rosewood', 'llm', 'llmAnime']) {
  for (const viewport of [{ width: 844, height: 390 }, { width: 667, height: 320 }]) {
    test(`${theme} ${viewport.width}：触摸可打开、关闭底部回放和两处规则入口`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.goto(`/?theme=${theme}`)
      for (const name of ['对局回放 →', '游戏规则 →']) {
        const button = page.getByRole('button', { name, exact: true })
        await expect(button).toBeVisible()
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44)
      }
      for (const name of ['对局回放 →', '游戏规则 →', '查看规则']) {
        const isReplay = name === '对局回放 →'
        const button = page.getByRole('button', { name, exact: true })
        // 真正走触摸事件，并验证文字下方的按钮内边距也能命中。
        await button.tap({ position: name === '查看规则' ? undefined : { x: 12, y: 35 } })
        const panel = isReplay ? page.getByTestId('replay-list') : page.locator('.rules-panel')
        await expect(panel).toBeVisible()
        await expect(panel).toHaveCSS('opacity', '1')
        await expect(panel).toHaveCSS('transform', 'none')
        const heading = panel.getByRole('heading', { level: 2 })
        await expect(heading).toBeInViewport({ ratio: 1 })
        const close = panel.getByRole('button', { name: isReplay ? '关闭' : '关闭规则', exact: true })
        await close.tap()
        await expect(panel).toHaveCount(0)
      }
    })
  }
}

test('本地存储迟迟未就绪时，回放先显示加载状态且仍能关闭、查看规则', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await page.addInitScript(() => {
    // 模拟手机浏览器中的 IndexedDB 请求挂起。
    Object.defineProperty(window, 'indexedDB', { value: { open: () => ({}) } })
  })
  await page.goto('/?theme=jade')
  await page.getByTestId('open-replay').tap()
  const panel = page.getByTestId('replay-list')
  await expect(panel.getByText('加载中…', { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: '关闭', exact: true }).tap()
  await expect(panel).toHaveCount(0)
  await page.getByRole('button', { name: '查看规则', exact: true }).tap()
  await expect(page.locator('.rules-panel')).toContainText('108张')
})
