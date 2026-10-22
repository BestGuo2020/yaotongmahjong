import { expect, test } from '@playwright/test'

const screens = [
  { width: 880, height: 405, deviceScaleFactor: 3 },
  // Produces exactly 2640×1216 pixels, matching the reported screenshot.
  { width: 1320, height: 608, deviceScaleFactor: 2 },
  { width: 2640, height: 1216, deviceScaleFactor: 1 },
]

for (const screen of screens) {
  test.describe(`四家紧凑信息卡 ${screen.width}`, () => {
    test.use({ isMobile: true, hasTouch: true, deviceScaleFactor: screen.deviceScaleFactor })
    for (const theme of ['jade', 'rosewood', 'happyMahjong', 'llm', 'llmAnime']) {
      for (const scale of [1, 2]) {
        for (const reveal of [false, true]) {
          test(`${theme} 字号${scale} 亮牌${reveal}`, async ({ page, context }) => {
            await page.setViewportSize({ width: screen.width, height: screen.height })
            await page.emulateMedia({ reducedMotion: 'reduce' })
            await page.goto(`/tests/e2e/fixtures/yaotong-guidance.html?scenario=seat-layout&theme=${theme}${reveal ? '&reveal' : ''}`)
            const cdp = await context.newCDPSession(page)
            await cdp.send('Emulation.setEmulatedOSTextScale', { scale })
            await expect(page.locator('.table-loading')).toHaveCount(0, { timeout: 30000 })
            const seats = page.locator('.yaotong-table .player-seat .avatar-wrap, .yaotong-table .user-identity')
            await expect(seats).toHaveCount(4)
            await expect(page.locator('.player-seat .relative-seat-label')).toHaveText(['下家', '对家', '上家'])
            await expect(page.getByRole('region', { name: '对家 · 观山' })).toBeVisible()
            const across = (await page.locator('.seat-top .avatar-wrap').boundingBox())!
            expect(Math.abs(across.x + across.width / 2 - screen.width / 2), '对家卡须位于正上方，不能混入右家区域').toBeLessThanOrEqual(1)
            const boxes = []
            for (const seat of await seats.all()) {
              await expect(seat).toBeInViewport({ ratio: 1 })
              const box = (await seat.boundingBox())!
              const isAcross = await seat.evaluate(e => Boolean(e.closest('.seat-top')))
              expect(box.width, '信息卡宽度须有上限').toBeLessThanOrEqual(isAcross ? 320 : 129)
              if (isAcross) expect(box.height, '对家身份栏须保持扁平，不侵入牌河').toBeLessThanOrEqual(40)
              // happyMahjong 主题卡边框为 2px，比其余主题高不到 1px；保留 1px 亚像素余量。
              expect(box.height, '信息卡不能再纵向膨胀').toBeLessThanOrEqual(73)
              const avatar = (await seat.locator('.avatar').boundingBox())!
              expect(avatar.width).toBeLessThanOrEqual(30)
              for (const info of await seat.locator('.player-info').all()) {
                const overflow = await info.evaluate(e => e.scrollWidth - e.clientWidth)
                expect(overflow, '名字和分数不得溢出卡片').toBeLessThanOrEqual(1)
              }
              const nameOverflow = await seat.locator('.player-info strong').evaluate(e => e.scrollWidth - e.clientWidth)
              expect(nameOverflow, '方位和姓名须完整可见').toBeLessThanOrEqual(1)
              boxes.push(box)
            }
            const overlap = (a: typeof boxes[number], b: typeof boxes[number]) =>
              Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) &&
              Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y)
            for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++)
              expect(overlap(boxes[i], boxes[j]), '四家的信息卡互不遮挡').toBe(false)
            for (const tile of await page.locator('.hand-rack .mahjong-tile').all()) {
              const box = (await tile.boundingBox())!
              for (const seat of boxes) expect(overlap(seat, box), '信息卡不遮本家手牌').toBe(false)
            }
            if (theme === 'jade' && reveal) await page.screenshot({ path: `tmp/compact-seats-${screen.width}-${scale}.png` })
          })
        }
      }
    }
  })
}

// mini 横屏（以及桌面小窗/内嵌 WebView）可能上报 fine 指针，触控能力查询不会命中。
// 尺寸兜底后仍须使用移动端紧凑信息卡与手牌宽度，不能掉回桌面几何。
test.describe('未上报粗指针的 mini 横屏仍使用移动端布局', () => {
  test.use({ isMobile: false, hasTouch: false, deviceScaleFactor: 3 })
  test('880×405：四家信息卡不遮挡，手牌保持移动端宽度', async ({ page }) => {
    await page.setViewportSize({ width: 880, height: 405 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/tests/e2e/fixtures/yaotong-guidance.html?scenario=seat-layout&theme=jade')
    await expect(page.locator('.table-loading')).toHaveCount(0, { timeout: 30000 })
    const seats = page.locator('.yaotong-table .player-seat .avatar-wrap, .yaotong-table .user-identity')
    await expect(seats).toHaveCount(4)
    const boxes = []
    for (const seat of await seats.all()) {
      await expect(seat).toBeInViewport({ ratio: 1 })
      const box = (await seat.boundingBox())!
      const isAcross = await seat.evaluate(e => Boolean(e.closest('.seat-top')))
      expect(box.width, '信息卡宽度须有上限').toBeLessThanOrEqual(isAcross ? 320 : 129)
      expect(box.height, '信息卡不能再纵向膨胀').toBeLessThanOrEqual(72)
      const avatar = (await seat.locator('.avatar').boundingBox())!
      expect(avatar.width, '头像须为移动端紧凑尺寸').toBeLessThanOrEqual(30)
      boxes.push(box)
    }
    const overlap = (a: typeof boxes[number], b: typeof boxes[number]) =>
      Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) &&
      Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y)
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++)
      expect(overlap(boxes[i], boxes[j]), '四家的信息卡互不遮挡').toBe(false)
    const tileWidth = await page.locator('.hand-rack .mahjong-tile').first().evaluate(e => e.getBoundingClientRect().width)
    expect(tileWidth, '手牌须使用移动端宽度，不能回落到桌面 48px').toBeLessThanOrEqual(44)
  })
})

// 手机矮横屏：昵称不占位，点头像弹出完整昵称；桌面：昵称折两行。
test.describe('长昵称：手机点头像查看，桌面折两行', () => {
  test.use({ isMobile: false, hasTouch: false, deviceScaleFactor: 2 })
  const expected = ['听风就是雨的超长昵称', '观山望月看一整晚牌', '望月听风打到天亮', '麻将对局昵称超过十二个字']
  const noOverlap = (boxes: { x: number; y: number; width: number; height: number }[]) => {
    const overlap = (a: typeof boxes[number], b: typeof boxes[number]) =>
      Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) &&
      Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y)
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++)
      expect(overlap(boxes[i], boxes[j]), '四家的信息卡互不遮挡').toBe(false)
  }

  test('880×405 手机：昵称不占位，点头像显示完整昵称', async ({ page }) => {
    await page.setViewportSize({ width: 880, height: 405 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/tests/e2e/fixtures/yaotong-guidance.html?scenario=seat-layout&longNames=1&theme=jade')
    await expect(page.locator('.table-loading')).toHaveCount(0, { timeout: 30000 })
    const names = page.locator('.yaotong-table .player-name')
    await expect(names).toHaveCount(4)
    for (const name of await names.all()) await expect(name).toBeHidden()
    // 方位标记保留，昵称不占位。
    await expect(page.locator('.yaotong-table .relative-seat-label')).toHaveText(['下家', '对家', '上家'])
    await page.screenshot({ path: 'tmp/long-names-mobile-hidden.png' })
    const right = page.locator('.yaotong-table .seat-right')
    await right.locator('.avatar-button').click()
    await expect(right.locator('.nickname-popover')).toBeVisible()
    await expect(right.locator('.nickname-popover')).toHaveText(expected[0])
    await page.screenshot({ path: 'tmp/long-names-mobile-popover.png' })
    const user = page.locator('.yaotong-table .user-identity')
    await user.locator('.avatar-button').click()
    await expect(user.locator('.nickname-popover')).toHaveText(expected[3])
    const boxes = []
    for (const seat of await page.locator('.yaotong-table .player-seat .avatar-wrap, .yaotong-table .user-identity').all()) {
      const box = (await seat.boundingBox())!
      const isAcross = await seat.evaluate(e => Boolean(e.closest('.seat-top')))
      expect(box.height, '信息卡高度须保持紧凑').toBeLessThanOrEqual(isAcross ? 40 : 72)
      boxes.push(box)
    }
    noOverlap(boxes)
    for (const tile of await page.locator('.hand-rack .mahjong-tile').all()) {
      const box = (await tile.boundingBox())!
      for (const seat of boxes) {
        const overlap = (a: typeof boxes[number], b: typeof boxes[number]) =>
          Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) &&
          Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y)
        expect(overlap(seat, box), '信息卡不遮本家手牌').toBe(false)
      }
    }
  })

  test('1280×720 桌面：昵称折两行，点头像也显示完整昵称', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/tests/e2e/fixtures/yaotong-guidance.html?scenario=seat-layout&longNames=1&theme=jade')
    await expect(page.locator('.table-loading')).toHaveCount(0, { timeout: 30000 })
    const strongs = page.locator('.yaotong-table .player-info strong')
    await expect(strongs).toHaveCount(4)
    for (let i = 0; i < 4; i++) {
      await expect(strongs.nth(i)).toContainText(expected[i])
      expect(await strongs.nth(i).evaluate(e => getComputedStyle(e).webkitLineClamp), `昵称${i}须两行`).toBe('2')
      expect((await strongs.nth(i).boundingBox())!.height, `昵称${i}须实际折行`).toBeGreaterThan(20)
    }
    const top = page.locator('.yaotong-table .seat-top')
    await top.locator('.avatar-button').click()
    await expect(top.locator('.nickname-popover')).toBeVisible()
    await expect(top.locator('.nickname-popover')).toHaveText(expected[1])
    await page.screenshot({ path: 'tmp/long-names-desktop-popover.png' })
    const boxes = []
    for (const seat of await page.locator('.yaotong-table .player-seat .avatar-wrap, .yaotong-table .user-identity').all())
      boxes.push((await seat.boundingBox())!)
    noOverlap(boxes)
  })
})
