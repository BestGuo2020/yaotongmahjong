import { expect, test } from '@playwright/test'

test.describe('手机 3D 牌桌', () => {
  test.use({ isMobile: true, hasTouch: true, deviceScaleFactor: 2, viewport: { width: 844, height: 390 } })

  test('双击出牌从首帧开始按原分辨率局部重绘，并完成飞牌入河', async ({ page }) => {
    test.setTimeout(90_000)
    await page.addInitScript(() => {
      document.addEventListener('touchend', event => {
        if (!(event.target instanceof Element) || !event.target.closest('.hand-tile-slot.drawn')) return
        const root = document.querySelector<HTMLElement>('.game-app')
        if (root) root.dataset.drawnTileReleases = String(Number(root.dataset.drawnTileReleases ?? 0) + 1)
      }, true)
      document.addEventListener('click', event => {
        if (!(event.target instanceof Element) || !event.target.closest('.hand-tile-slot.drawn')) return
        const root = document.querySelector<HTMLElement>('.game-app')
        if (root) root.dataset.drawnTileClicks = String(Number(root.dataset.drawnTileClicks ?? 0) + 1)
      }, true)
      const { clear, scissor } = WebGL2RenderingContext.prototype
      WebGL2RenderingContext.prototype.clear = function (mask) {
        if (this.canvas instanceof HTMLCanvasElement && this.canvas.dataset.observeDiscardRedraw === '1'
          && this.canvas.closest<HTMLElement>('.game-app')?.dataset.discards === '1'
          && this.getParameter(this.DRAW_FRAMEBUFFER_BINDING) === null) {
          this.canvas.dataset.firstDiscardRedraw = this.isEnabled(this.SCISSOR_TEST) ? 'clipped' : 'full'
          delete this.canvas.dataset.observeDiscardRedraw
        }
        clear.call(this, mask)
      }
      WebGL2RenderingContext.prototype.scissor = function (x, y, width, height) {
        if (this.canvas instanceof HTMLCanvasElement && this.canvas.classList.contains('mahjong-scene')
          && this.getParameter(this.DRAW_FRAMEBUFFER_BINDING) === null && width > 0 && height > 0
          && width < this.drawingBufferWidth && height < this.drawingBufferHeight) {
          this.canvas.dataset.discardScissor = `${width}x${height}`
        }
        scissor.call(this, x, y, width, height)
      }
    })
    await page.goto('/tests/e2e/fixtures/yaotong-auto-discard.html?quality=low', { waitUntil: 'domcontentloaded' })
    const canvas = page.locator<HTMLCanvasElement>('canvas.mahjong-scene')
    await expect(canvas).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.table-loading')).toHaveCount(0, { timeout: 30_000 })
    const buffer = () => canvas.evaluate(element => ({
      retained: element.getContext('webgl2')?.getContextAttributes()?.preserveDrawingBuffer,
      width: element.width,
      height: element.height,
    }))
    const initialBuffer = await buffer()
    expect(initialBuffer.retained).toBe(true)
    await canvas.evaluate(element => { delete element.dataset.discardScissor })
    const drawn = page.locator('.hand-rack.playable .hand-tile-slot.drawn .mahjong-tile')
    await drawn.tap()
    await canvas.evaluate(element => { element.dataset.observeDiscardRedraw = '1' })
    await drawn.tap()
    await expect(page.locator('.game-app')).toHaveAttribute('data-discards', '1')
    await expect(page.locator('.game-app')).toHaveAttribute('data-drawn-tile-releases', '2')
    await expect(page.locator('.game-app')).not.toHaveAttribute('data-drawn-tile-clicks', /\d+/)
    await expect(canvas).toHaveAttribute('data-first-discard-redraw', 'clipped')
    await expect(canvas).toHaveAttribute('data-discard-scissor', /^\d+x\d+$/)
    expect(await buffer()).toEqual(initialBuffer)
  })

  test('向上滑动一次只弃一张牌', async ({ page, context }) => {
    await page.goto('/tests/e2e/fixtures/yaotong-auto-discard.html?quality=low', { waitUntil: 'domcontentloaded' })
    const drawn = page.locator('.hand-rack.playable .hand-tile-slot.drawn .mahjong-tile')
    await expect(drawn).toBeVisible()
    const box = (await drawn.boundingBox())!
    const x = box.x + box.width / 2, y = box.y + box.height / 2
    const cdp = await context.newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 46 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect(page.locator('.game-app')).toHaveAttribute('data-discards', '1')
  })
})

for (const viewport of [{ width: 1280, height: 720 }, { width: 844, height: 390 }]) {
  for (const scenario of ['ready', 'original']) {
    test(`${scenario}声明后无需点击手牌，自动摸切并保留原手牌：${viewport.width}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.goto(`/tests/e2e/fixtures/yaotong-auto-discard.html?scenario=${scenario}`)
      const root = page.locator('.game-app')
      const held = await root.getAttribute('data-held')
      if (scenario === 'original') await page.getByRole('button', { name: '原报', exact: true }).click()
      else {
        await page.getByRole('button', { name: '报听', exact: true }).click()
        await page.locator('.hand-rack.playable .mahjong-tile').last().click()
      }
      await expect(root).toHaveAttribute('data-declaration', scenario)
      await expect(root).toHaveAttribute('data-auto-discard', 'true', { timeout: 15_000 })
      await expect(page.locator('.hand-rack.playable')).toHaveCount(0)
      await expect(root).toHaveAttribute('data-discards', scenario === 'original' ? '1' : '2', { timeout: 15_000 })
      await expect(root).toHaveAttribute('data-held', held!)
      await expect(root).toHaveAttribute('data-autoplay', 'false')
      await page.screenshot({ path: `tmp/auto-discard-${scenario}-${viewport.width}.png` })
    })
  }
}

test('报听后摸到胡牌仍等待确认，不自动丢牌或代胡', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/yaotong-auto-discard.html?scenario=hu')
  const hu = page.getByRole('button', { name: '胡', exact: true })
  await expect(hu).toBeVisible()
  await page.clock.install()
  await page.clock.fastForward(3000)
  const root = page.locator('.game-app')
  await expect(root).toHaveAttribute('data-auto-discard', 'false')
  await expect(root).toHaveAttribute('data-discards', '0')
  await expect(root).toHaveAttribute('data-result', '')
  await hu.click()
  await expect(root).toHaveAttribute('data-result', 'win')
})

test('未声明的普通听牌仍由玩家手动出牌', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/yaotong-auto-discard.html')
  await expect(page.locator('.hand-rack.playable')).toBeVisible()
  await page.clock.install()
  await page.clock.fastForward(3000)
  await expect(page.locator('.game-app')).toHaveAttribute('data-declaration', 'none')
  await expect(page.locator('.game-app')).toHaveAttribute('data-discards', '0')
  await expect(page.locator('.hand-rack.playable')).toBeVisible()
})
