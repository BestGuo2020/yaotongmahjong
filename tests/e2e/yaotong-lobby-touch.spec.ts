import { expect, test, type Locator } from '@playwright/test'

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

test('完整规则在独立弹窗中渲染并滚动，关闭后回到速览', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 320 })
  await page.goto('/?theme=jade')
  await page.getByRole('button', { name: '查看规则', exact: true }).tap()
  const overview = page.locator('.rules-panel')
  const openSource = overview.getByRole('button', { name: '查看完整规则原文', exact: true })
  await openSource.tap()
  const source = page.getByRole('dialog', { name: '完整规则原文', exact: true })
  await expect(source).toBeVisible()
  await expect(source.getByRole('heading', { level: 1, name: /^幺筒麻将规则 v/ })).toBeInViewport({ ratio: 1 })
  await expect(source.locator('strong').first()).toHaveText('版本：')
  await expect(source.getByRole('table').first().getByRole('columnheader', { name: '术语' })).toBeVisible()
  const close = source.getByRole('button', { name: '关闭完整规则', exact: true })
  const lastSection = source.getByRole('heading', { name: /^13\.13 / })
  await lastSection.scrollIntoViewIfNeeded()
  await expect(lastSection).toBeInViewport({ ratio: 1 })
  await expect(close).toBeInViewport({ ratio: 1 })
  await close.tap()
  await expect(source).toBeHidden()
  await expect(overview).toBeVisible()
  await openSource.tap()
  await page.keyboard.press('Escape')
  await expect(source).toBeHidden()
  await expect(openSource).toBeFocused()
})

for (const { name, viewport, insets } of [
  { name: 'iPhone mini', viewport: { width: 812, height: 327 }, insets: { left: 50, right: 50, bottom: 21, top: 0 } },
  { name: 'vivo X200 Pro mini', viewport: { width: 844, height: 320 }, insets: { left: 32, right: 16, bottom: 20, top: 0 } },
]) {
  test(`${name} 矮横屏和双倍字号下主题、完整规则及快捷语可用`, async ({ page, context }) => {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/?theme=jade')
    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets })
    await cdp.send('Emulation.setEmulatedOSTextScale', { scale: 2 })
    await expect(page.locator('.game-app')).toHaveCSS('--safe-bottom', `${insets.bottom}px`)
    const topBar = page.locator('.top-bar')
    await expect(topBar).toHaveCSS('left', `${insets.left}px`)
    await expect(topBar).toHaveCSS('padding-left', '8px')
    const nav = (await topBar.locator('nav').boundingBox())!
    expect(viewport.width - nav.x - nav.width).toBeCloseTo(insets.right + 8, 1)

    async function withinSafeArea(layer: Locator) {
      await expect(layer).toBeVisible()
      const box = (await layer.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(insets.left)
      expect(box.y).toBeGreaterThanOrEqual(insets.top)
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - insets.right)
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - insets.bottom)
    }

    await page.getByRole('button', { name: '切换牌桌主题', exact: true }).tap()
    const menu = page.getByRole('menu', { name: '牌桌主题' })
    await withinSafeArea(menu)
    expect(await menu.evaluate(element => element.scrollWidth - element.clientWidth)).toBe(0)
    await menu.getByRole('menuitemradio').last().tap()
    await expect(menu).toBeHidden()

    await page.getByRole('button', { name: '查看规则', exact: true }).tap()
    await page.getByRole('button', { name: '查看完整规则原文', exact: true }).tap()
    const rules = page.getByRole('dialog', { name: '完整规则原文', exact: true })
    await withinSafeArea(rules)
    await expect(rules.getByRole('heading', { level: 1 })).toBeVisible()
    await rules.getByRole('button', { name: '关闭完整规则', exact: true }).tap()
    await page.getByRole('button', { name: '关闭规则', exact: true }).tap()
    await expect(page.locator('.rules-panel')).toHaveCount(0)

    await page.locator('.start-button').tap()
    const chatButton = page.getByRole('button', { name: '快捷语', exact: true })
    await expect(chatButton).toBeVisible({ timeout: 30000 })
    await chatButton.tap()
    const chat = page.getByRole('dialog', { name: '快捷语', exact: true })
    await withinSafeArea(chat)
    await chat.getByRole('button', { name: '关闭快捷语', exact: true }).tap()
    await expect(chat).toBeHidden()
  })
}
