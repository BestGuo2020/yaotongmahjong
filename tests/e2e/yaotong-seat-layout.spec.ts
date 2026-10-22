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
            const boxes = []
            for (const seat of await seats.all()) {
              await expect(seat).toBeInViewport({ ratio: 1 })
              const box = (await seat.boundingBox())!
              expect(box.width, '信息卡宽度须有上限').toBeLessThanOrEqual(121)
              expect(box.height, '信息卡不能再纵向膨胀').toBeLessThanOrEqual(72)
              const avatar = (await seat.locator('.avatar').boundingBox())!
              expect(avatar.width).toBeLessThanOrEqual(30)
              for (const info of await seat.locator('.player-info').all()) {
                const overflow = await info.evaluate(e => e.scrollWidth - e.clientWidth)
                expect(overflow, '名字和分数不得溢出卡片').toBeLessThanOrEqual(1)
              }
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
