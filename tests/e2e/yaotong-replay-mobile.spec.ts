import { expect, test, type Page } from '@playwright/test'

test.use({ hasTouch: true, isMobile: true, deviceScaleFactor: 3 })

async function openReplay(page: Page, limited = false) {
  await page.setViewportSize({ width: 915, height: 412 })
  await page.goto(`/tests/e2e/fixtures/yaotong-replay.html?theme=jade${limited ? '&limited' : ''}`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('body')).toHaveAttribute('data-fixture', 'ready', { timeout: 60000 })
  await page.goto('/?cameraLab&theme=jade', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '对局回放 →' }).click()
  await page.getByRole('button', { name: '查看', exact: true }).click()
  await expect(page.locator('.replay-viewer canvas')).toBeVisible({ timeout: 30000 })
  await expect(page.locator('.table-loading')).toHaveCount(0)
}

async function faceCounts(page: Page) {
  const faces = JSON.parse(await page.locator('.replay-viewer canvas').getAttribute('data-hand-face-rects') ?? '[]')
  return [1, 2, 3].map(seat => faces.filter((face: { seat: number }) => face.seat === seat).length)
}

// CSS 视口随系统显示缩放和浏览器工具栏变化，并不直接等于面板的物理分辨率。
for (const size of [
  { width: 915, height: 412 }, { width: 844, height: 390 }, { width: 390, height: 844 },
  { width: 880, height: 405 }, { width: 780, height: 360 }, { width: 720, height: 320 }, { width: 360, height: 780 },
]) {
  test(`移动回放 ${size.width}x${size.height}：布局、触控与实际明暗牌切换`, async ({ page }) => {
    test.setTimeout(60000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await openReplay(page)
    await page.setViewportSize(size)
    if (size.width === 720 || size.width === 360) {
      await page.evaluate(landscape => {
        document.documentElement.style.setProperty('-webkit-text-size-adjust', '125%')
        if (landscape) {
          const viewer = document.querySelector<HTMLElement>('.replay-viewer')!
          viewer.style.setProperty('--safe-left', '32px')
          viewer.style.setProperty('--safe-right', '16px')
          viewer.style.setProperty('--safe-bottom', '12px')
        }
      }, size.width === 720)
    }
    await expect(page.locator('.orientation-gate')).toHaveCount(0)
    await expect(page.locator('.replay-log-body')).toBeHidden()
    await expect.poll(() => faceCounts(page)).toEqual([13, 13, 13])
    const position = await page.getByTestId('replay-turn').locator('i').textContent()
    await page.getByTestId('replay-perspective').tap()
    await expect(page.getByTestId('replay-viewer')).toHaveAttribute('data-replay-perspective', 'self')
    await expect.poll(() => faceCounts(page)).toEqual([0, 0, 0])
    await page.getByTestId('replay-perspective').tap()
    await expect.poll(() => faceCounts(page)).toEqual([13, 13, 13])
    await expect(page.getByTestId('replay-turn').locator('i')).toHaveText(position!)
    await page.getByRole('button', { name: '播放', exact: true }).tap()
    await expect.poll(() => page.getByTestId('replay-turn').locator('i').textContent()).not.toBe(position)
    await page.getByRole('button', { name: '暂停', exact: true }).tap()
    for (const selector of ['.replay-back', '.replay-view-mode', '.replay-user', '.replay-timeline']) {
      await expect(page.locator(selector)).toBeInViewport({ ratio: 1 })
    }
    const bounds = await page.evaluate(() => {
      const hand = document.querySelector('.replay-hand-rack')!.getBoundingClientRect()
      const footer = document.querySelector('.replay-timeline')!.getBoundingClientRect()
      const buttons = [...document.querySelectorAll('.replay-topbar button,.replay-timeline button,.replay-timeline select')]
        .filter(element => element.getBoundingClientRect().width > 0)
        .map(element => element.getBoundingClientRect().toJSON())
      return { handBottom: hand.bottom, footerTop: footer.top, overflow: document.documentElement.scrollWidth > innerWidth,
        clipped: buttons.some(rect => rect.left < 0 || rect.right > innerWidth || rect.top < 0 || rect.bottom > innerHeight),
        clippedTiles: [...document.querySelectorAll('.replay-hand-rack .mahjong-tile')].some(tile => {
          const rect = tile.getBoundingClientRect()
          return rect.left < 0 || rect.right > innerWidth || rect.bottom > footer.top
        }) }
    })
    expect(bounds.overflow).toBe(false)
    expect(bounds.clipped).toBe(false)
    expect(bounds.clippedTiles).toBe(false)
    expect(bounds.handBottom).toBeLessThanOrEqual(bounds.footerTop)
    await page.screenshot({ path: `test-results/replay-mobile-${size.width}.png`, animations: 'disabled' })
    await page.locator('.replay-log-toggle').tap()
    await expect(page.locator('.replay-log-body')).toBeVisible()
    await page.locator('.replay-log-start').tap()
    await expect(page.locator('.replay-log-body')).toBeHidden()
    await page.getByTestId('replay-info-toggle').tap()
    await expect(page.getByTestId('replay-info-body')).toBeInViewport({ ratio: 1 })
    await page.getByRole('button', { name: '关闭分数' }).tap()
    await page.getByRole('button', { name: '← 返回回放列表' }).tap()
    await expect(page.getByTestId('replay-list')).toBeVisible()
    await expect(page.locator('.orientation-gate')).toHaveCount(0)
    expect(errors).toEqual([])
  })
}

test('缺少暗牌的联机回放明确解释视角限制，支持跳至终局亮牌', async ({ page }) => {
  await openReplay(page, true)
  await expect(page.getByTestId('replay-viewer')).toHaveAttribute('data-replay-perspective', 'limited')
  await expect(page.getByTestId('replay-perspective')).toContainText('本人视角')
  await expect.poll(() => faceCounts(page)).toEqual([0, 0, 0])
  await page.getByTestId('replay-perspective').tap()
  await expect(page.getByRole('status')).toContainText('未保存当时的对手暗牌')
  await page.screenshot({ path: 'test-results/replay-limited-perspective.png', animations: 'disabled' })
  await page.getByRole('button', { name: '查看终局亮牌' }).tap()
  await expect(page.getByTestId('replay-viewer')).toHaveAttribute('data-replay-perspective', 'settled')
  await expect.poll(async () => (await faceCounts(page)).every(count => count > 0)).toBe(true)
  await page.getByRole('button', { name: '结算明细', exact: true }).tap()
  await expect(page.getByRole('dialog', { name: '回放结算明细' })).toBeVisible()
})
