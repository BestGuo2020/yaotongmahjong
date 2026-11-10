import { expect, test, type Locator } from '@playwright/test'

test.use({ isMobile: true, hasTouch: true, deviceScaleFactor: 2 })

async function noClipping(area: Locator) {
  const overflow = await area.evaluate(element => ({ x: element.scrollWidth - element.clientWidth, y: element.scrollHeight - element.clientHeight }))
  expect(overflow.x, '文字不应横向溢出').toBeLessThanOrEqual(1)
  expect(overflow.y, '控件内文字不应被裁切').toBeLessThanOrEqual(1)
}

test('手机系统设为双倍字号时大厅与牌桌使用固定字号', async ({ page, context }) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const cdp = await context.newCDPSession(page)
  const root = page.locator('html')
  const start = page.locator('.start-button')
  await cdp.send('Emulation.setEmulatedOSTextScale', { scale: 1 })
  const rootFont = await root.evaluate(element => getComputedStyle(element).fontSize)
  const startFont = await start.evaluate(element => getComputedStyle(element).fontSize)
  await cdp.send('Emulation.setEmulatedOSTextScale', { scale: 2 })
  await expect(root).toHaveCSS('text-size-adjust', '100%')
  await expect(root).toHaveCSS('font-size', rootFont)
  await expect(start).toHaveCSS('font-size', startFont)
  await start.scrollIntoViewIfNeeded()
  await expect(start).toBeInViewport({ ratio: 1 })
  await page.screenshot({ path: 'tmp/os-font-lobby-2.png' })
  await start.click()
  await expect(page.locator('.table-loading')).toHaveCount(0, { timeout: 30000 })
  await expect(page.locator('.game-table-hud canvas')).toBeVisible({ timeout: 30000 })
  for (const name of ['切换牌桌主题', '退出对局', '声音设置', '查看规则']) {
    const button = page.getByRole('button', { name, exact: true })
    await expect(button).toBeInViewport({ ratio: 1 })
    await expect(button.locator('svg[aria-hidden="true"]')).toBeVisible()
    const geometry = await button.evaluate(element => {
      const { width, height } = element.getBoundingClientRect()
      const frame = getComputedStyle(element, '::before')
      return { width, height, frameWidth: frame.width, frameHeight: frame.height, radius: frame.borderRadius }
    })
    expect(geometry).toEqual({ width: 44, height: 44, frameWidth: '32px', frameHeight: '32px', radius: '8px' })
  }
  await expect(page.locator('.round-info')).toHaveCSS('text-size-adjust', '100%')
  await noClipping(page.locator('.round-info'))
  await page.screenshot({ path: 'tmp/os-font-real-table-2.png' })
})

for (const { name, viewport, insets, theme } of [
  { name: 'iPhone mini', viewport: { width: 812, height: 327 }, insets: { left: 50, right: 50, bottom: 21, top: 0 }, theme: 'jade' },
  { name: 'vivo X200 Pro mini', viewport: { width: 844, height: 320 }, insets: { left: 32, right: 16, bottom: 20, top: 0 }, theme: 'happyMahjong' },
]) {
  test(`${name} 矮横屏系统双倍字号下按钮可读，手牌贴近安全区`, async ({ page, context }) => {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(`/tests/e2e/fixtures/yaotong-guidance.html?scenario=hu-crowded&theme=${theme}`)
    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets })
    const row = page.locator('.turn-action-row')
    const actions = row.locator('button.action')
    const icons = actions.locator('svg.table-control-icon')
    const laiziMark = page.locator('.hand-rack .mahjong-tile.laizi .joker-mark').first()
    await expect(actions).toHaveCount(6, { timeout: 30000 })
    await expect(row).toHaveCSS('bottom', `${78 + insets.bottom}px`)
    await expect(icons).toHaveCount(3)
    const persistent = page.locator('.table-persistent-actions > button')
    await expect(persistent).toHaveCount(2)
    await expect(persistent.last()).toHaveAccessibleName('快捷语')
    const autoplayBox = (await persistent.first().boundingBox())!
    const chatBox = (await persistent.last().boundingBox())!
    expect(chatBox.y - autoplayBox.y - autoplayBox.height).toBeCloseTo(14, 1)
    await expect(laiziMark).toHaveText('癞')
    const iconSizes = () => icons.evaluateAll(elements => elements.map(element => {
      const { width, height } = element.getBoundingClientRect()
      return { width, height }
    }))

    await cdp.send('Emulation.setEmulatedOSTextScale', { scale: 1 })
    const standardIcons = await iconSizes()
    const standardMarkFontSize = await laiziMark.evaluate(element => getComputedStyle(element).fontSize)
    await cdp.send('Emulation.setEmulatedOSTextScale', { scale: 2 })
    await expect(page.locator('html')).toHaveCSS('text-size-adjust', '100%')
    expect(await iconSizes()).toEqual(standardIcons)
    await expect(laiziMark).toHaveCSS('font-size', standardMarkFontSize)

    const timer = row.locator('.turn-timer')
    await expect(timer).toHaveText('20')
    await expect(timer).toBeInViewport({ ratio: 1 })
    await noClipping(timer)
    const timerBox = (await timer.boundingBox())!
    const firstAction = (await actions.first().boundingBox())!
    expect(timerBox.height).toBe(firstAction.height)
    expect(timerBox.y).toBe(firstAction.y)
    const opponent = (await page.locator('.seat-top .avatar-wrap').boundingBox())!
    const handBounds = () => page.locator('.hand-rack .hand-tile-slot').evaluateAll(tiles => {
      const boxes = tiles.map(tile => tile.getBoundingClientRect())
      return {
        left: Math.min(...boxes.map(box => box.left)),
        top: Math.min(...boxes.map(box => box.top)),
        bottom: Math.max(...boxes.map(box => box.bottom)),
      }
    })
    const hand = await handBounds()
    const identity = page.locator('.user-identity')
    await expect(identity).toHaveCSS('bottom', '38px')
    const card = (await identity.boundingBox())!
    expect(card.x + card.width).toBeLessThanOrEqual(hand.left - 8)
    expect(card.y + card.height).toBeGreaterThan(hand.top)
    const rowBox = (await row.boundingBox())!
    for (const button of await persistent.all()) {
      await expect(button).toBeInViewport({ ratio: 1 })
      const box = (await button.boundingBox())!
      expect(box.width).toBe(32)
      expect(box.height).toBe(32)
      expect(box.x).toBeGreaterThan(rowBox.x + rowBox.width)
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - insets.right)
    }
    expect(rowBox.y).toBeGreaterThanOrEqual(opponent.y + opponent.height)
    expect(rowBox.y + rowBox.height).toBeLessThanOrEqual(hand.top)
    await expect(page.locator('.user-area')).toHaveCSS('bottom', `${insets.bottom}px`)
    expect(viewport.height - hand.bottom).toBeCloseTo(insets.bottom + 9, 1)
    for (const action of await actions.all()) {
      await expect(action).toBeInViewport({ ratio: 1 })
      const box = (await action.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(insets.left)
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - insets.right)
      expect(box.width).toBe(48)
      expect(box.height).toBe(48)
      await noClipping(action)
    }

    const labels = row.locator('.hu-plan-label > span')
    await expect(labels).toHaveText(['双龙七', '龙七对', '硬胡'])
    for (const label of await labels.all()) {
      await expect(label).toBeVisible()
      expect(await label.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(12)
    }
    await expect(row.locator('.hu-plan .action-detail')).toHaveText(['本0·赖2', '本2·赖0'])

    await row.getByRole('button', { name: '报听', exact: true }).tap()
    const armed = row.getByRole('button', { name: '取消报听', exact: true })
    await expect(armed).toHaveAttribute('aria-pressed', 'true')
    const box = (await armed.boundingBox())!
    expect(box.width).toBe(48)
    expect(box.height).toBe(48)

    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { ...insets, bottom: 0 } })
    await expect(page.locator('.user-area')).toHaveCSS('bottom', '0px')
    await expect(row).toHaveCSS('bottom', '78px')
    expect(viewport.height - (await handBounds()).bottom).toBeCloseTo(9, 1)

    await page.setViewportSize({ ...viewport, width: 700 })
    await expect(identity).not.toHaveClass(/\bbeside-hand\b/)
    await expect.poll(async () => {
      const raisedCard = (await identity.boundingBox())!
      return raisedCard.y + raisedCard.height - (await handBounds()).top
    }).toBeLessThanOrEqual(0)
  })
}

for (const theme of ['jade', 'rosewood', 'happyMahjong', 'llm', 'llmAnime']) {
for (const scale of theme === 'jade' ? [.85, 1, 1.3, 2] : [2]) {
  for (const width of [740, 844]) {
    test(`系统文字倍率 ${scale} 时游戏固定为 100%，手机横屏 ${width} ${theme}`, async ({ page, context }) => {
      await page.setViewportSize({ width, height: width === 740 ? 360 : 390 })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      const cdp = await context.newCDPSession(page)
      // Actual OS text scale emulation, not DPR, page zoom, or a root font override.
      await cdp.send('Emulation.setEmulatedOSTextScale', { scale })
      await page.goto(`/tests/e2e/fixtures/yaotong-guidance.html?scenario=hard-wait-idle&theme=${theme}`)
      await cdp.send('Emulation.setEmulatedOSTextScale', { scale })
      await expect(page.locator('.table-loading')).toHaveCount(0, { timeout: 30000 })
      const effectiveScale = await page.evaluate(() => {
        const probe = document.createElement('span'); probe.style.cssText = 'position:fixed;width:calc(100px * env(preferred-text-scale, 1));'; document.body.append(probe)
        const width = probe.getBoundingClientRect().width; probe.remove()
        return width / 100
      })
      expect(effectiveScale, '浏览器须收到模拟的系统字号倍率').toBeCloseTo(scale, 2)
      await expect(page.locator('html')).toHaveCSS('text-size-adjust', '100%')
      await page.getByRole('button', { name: '等，暂停牌局并使用本局等待时间', exact: true }).click()
      for (const name of ['胡', '过']) {
        const button = page.getByRole('button', { name, exact: true })
        await expect(button).toBeInViewport({ ratio: 1 })
        await expect(button).toHaveCSS('text-size-adjust', '100%')
        await noClipping(button)
      }
      for (const seat of await page.locator('.avatar-wrap, .user-identity').all()) {
        await expect(seat).toBeInViewport({ ratio: 1 })
        await expect(seat).toHaveCSS('text-size-adjust', '100%')
        for (const text of await seat.locator('.player-info').all()) await noClipping(text)
      }
      const self = (await page.locator('.user-identity').boundingBox())!
      for (const tile of await page.locator('.hand-rack .mahjong-tile').all()) {
        const box = (await tile.boundingBox())!
        expect(self.x + self.width <= box.x || self.y + self.height <= box.y || box.x + box.width <= self.x,
          '本家头像不遮手牌').toBe(true)
      }
      const huText = page.locator('.action.hu b')
      const fontSize = await huText.evaluate(element => getComputedStyle(element).fontSize)
      await cdp.send('Emulation.setEmulatedOSTextScale', { scale: 1 })
      await expect(huText).toHaveCSS('font-size', fontSize)
      await cdp.send('Emulation.setEmulatedOSTextScale', { scale })
      expect(parseFloat(fontSize)).toBeGreaterThanOrEqual(16)
      await page.screenshot({ path: `tmp/os-font-table-${theme}-${width}-${scale}.png` })
      await page.goto(`/tests/e2e/fixtures/yaotong-final.html?round&report&theme=${theme}`)
      await cdp.send('Emulation.setEmulatedOSTextScale', { scale })
      await expect(page.getByRole('tabpanel', { name: '概览', exact: true })).toBeVisible()
      await page.getByRole('tabpanel', { name: '概览', exact: true }).evaluate(async element => {
        await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {})))
      })
      const card = page.locator('.settlement-card')
      await expect(card).toHaveCSS('text-size-adjust', '100%')
      for (const name of ['继续', '查看牌桌']) {
        const button = page.getByRole('button', { name, exact: true })
        await expect(button).toBeInViewport({ ratio: 1 })
        await noClipping(button)
      }
      await noClipping(card)
      await expect(page.locator('.round-rankings article')).toHaveCount(4)
      await page.screenshot({ path: `tmp/os-font-settlement-${theme}-${width}-${scale}.png` })
      for (const row of await page.locator('.round-rankings article').all()) {
        await row.evaluate(e => e.scrollIntoView({ block: 'center', inline: 'nearest' }))
        await expect(row).toBeInViewport({ ratio: 1 })
        await noClipping(row)
      }
      await page.getByRole('tab', { name: '分数明细', exact: true }).click()
      await page.locator('.yaotong-ledger summary').click()
      await expect(page.getByRole('button', { name: '继续', exact: true })).toBeInViewport({ ratio: 1 })
    })
  }
}
}
