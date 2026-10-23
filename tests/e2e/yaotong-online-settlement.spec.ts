import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
const paceCases: Array<{ name: string; events: Array<[number, string, number]> }> = JSON.parse(
  readFileSync(new URL('../fixtures/yaotong-pace.json', import.meta.url), 'utf8'),
)

async function createSeededRoom(page: Page, kind: string) {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/?cameraLab&theme=jade')
  await page.getByRole('radio', { name: /联机对战/ }).click()
  await expect(page.getByTestId('lobby-create')).toBeEnabled()
  await page.getByTestId('lobby-nickname').fill('亮牌验收')
  await page.getByTestId('lobby-create').click()
  await page.getByTestId('lobby-create-confirm').click()
  await expect(page.getByTestId('room-code')).toHaveText(/[A-Z0-9]{6}/)
  const roomId = (await page.getByTestId('room-code').textContent())!
  expect((await page.request.post('/api/test/seed', { data: { roomId, kind } })).ok()).toBe(true)
  return roomId
}

async function leaveRoom(page: Page, roomId: string) {
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lgm_session') ?? 'null'))
  if (stored?.rejoinCode) await page.request.post(`/api/rooms/${roomId}/leave`, {
    data: { seat: 0, rejoinCode: stored.rejoinCode },
  })
}

for (const kind of ['self', 'discard'] as const) {
  test(`真实 WS ${kind}：三家手牌完整亮出，演出结束后才开始继续倒计时`, async ({ page }) => {
    test.skip(process.env.YAOTONG_SETTLEMENT_E2E !== '1', '需要 fixtures/yaotong-online-server.py')
    test.setTimeout(90_000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const roomId = await createSeededRoom(page, kind)
    try {
      await page.getByRole('button', { name: '准备 / 取消准备' }).click()
      await page.getByRole('button', { name: /开始对局/ }).click()
      const table = page.locator('.game-table-hud')
      await expect(table.locator('canvas').first()).toBeVisible({ timeout: 30_000 })
      if (kind === 'discard') {
        const drawn = page.locator('.hand-rack .hand-tile-slot').nth(13).locator('.mahjong-tile')
        await expect(drawn).toBeEnabled({ timeout: 25_000 })
        await drawn.click()
      }
      const action = kind === 'self' ? 'self-draw' : 'discard-win'
      await expect(page.locator(`[data-action-type="${action}"]`).first()).toBeVisible({ timeout: 30_000 })
      await expect(table).toHaveAttribute('data-reveal-hands', '0')
      await expect(page.locator('.round-settlement')).toHaveCount(0)
      if (kind === 'self') {
        // 模拟服务器兜底推进比本地演出先到；新局必须暂存，不能抹掉当前终局手牌。
        expect((await page.request.post('/api/test/advance', { data: { roomId } })).ok()).toBe(true)
      }
      await expect(table).toHaveAttribute('data-win-effect-winner', '3', { timeout: 6_000 })
      await expect(table).toHaveAttribute('data-reveal-hands', '0')
      await expect(table).toHaveAttribute('data-reveal-hands', '1', { timeout: 5_000 })
      // 不只检查 DTO：读取 Three.js 实际创建的三家手牌实例投影。
      const canvas = page.locator('canvas.mahjong-scene')
      await expect.poll(async () => {
        const faces = JSON.parse(await canvas.getAttribute('data-hand-face-rects') ?? '[]') as Array<{ seat: number }>
        return [1, 2, 3].map(seat => faces.filter(face => face.seat === seat).length)
      }).toEqual(kind === 'self' ? [13, 13, 13] : [13, 10, 13])
      await expect(page.locator('.round-settlement')).toBeVisible({ timeout: 5_000 })
      const continueButton = page.locator('.round-settlement').getByRole('button', { name: /继续/ })
      await expect(continueButton).toContainText(/10|9/)
      await page.getByRole('button', { name: '查看牌桌', exact: true }).click()
      await expect(page.locator('.round-settlement')).toHaveCount(0)
      await page.screenshot({ path: `test-results/online-reveal-${kind}.png` })
      expect((await table.getAttribute('data-revealed-face-counts'))!.split(',').map(Number).slice(1)).toEqual(
        kind === 'self' ? [13, 13, 14] : [13, 10, 13],
      )
      if (kind === 'self') {
        await page.locator('.result-reopen.continue').click()
        await expect(table).toHaveAttribute('data-reveal-hands', '0')
        await expect(page.locator('.result-reopen')).toHaveCount(0)
      }
      expect(errors).toEqual([])
    } finally {
      await leaveRoom(page, roomId)
    }
  })
}

for (const kind of ['open-kong', 'added-kong']) {
  test(`真实 WS AI ${kind}：宣杠、补摸与出牌分别到达并正确显示`, async ({ page }) => {
    test.skip(process.env.YAOTONG_SETTLEMENT_E2E !== '1', '需要 fixtures/yaotong-online-server.py')
    test.setTimeout(90_000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const events: Array<[number, string, number]> = []
    let serial = 0
    page.on('websocket', socket => socket.on('framereceived', frame => {
      const message = JSON.parse(String(frame.payload))
      if (message.kind !== 'yt_snapshot') return
      for (const event of message.view.events) {
        if (event.id <= serial) continue
        serial = event.id
        if (['draw', 'discard', 'kong', 'kong-intent'].includes(event.kind)) events.push([Date.now(), event.kind, event.seat])
      }
    }))
    const roomId = await createSeededRoom(page, kind)
    try {
      await page.getByRole('button', { name: '准备 / 取消准备' }).click()
      await page.getByRole('button', { name: /开始对局/ }).click()
      const table = page.locator('.game-table-hud')
      await page.waitForFunction(() => {
        const table = document.querySelector('.game-table-hud')
        return table?.getAttribute('data-opening-stage') === ''
          && table.getAttribute('data-phase') !== 'dealing'
          && Number(table.getAttribute('data-deal-serial')) > 0
      }, { timeout: 30_000 })
      if (kind === 'open-kong') await page.locator('.hand-rack .hand-tile-slot').nth(13).locator('.mahjong-tile').click()
      await expect(table).toHaveAttribute('data-meld-tile-counts', '0,4,0,0', { timeout: 10_000 })
      await expect(table).toHaveAttribute('data-concealed-counts', '13,10,13,13')
      await expect(table).toHaveAttribute('data-concealed-counts', '13,11,13,13', { timeout: 5_000 })
      await expect(table).toHaveAttribute('data-discard-counts', '0,1,0,0', { timeout: 4_000 })
      const expected = paceCases.find(scenario => scenario.name === kind)!.events
      const trace = events.slice(0, expected.length).map(([time, event, seat]) => [time - events[0]![0], event, seat])
      expect(trace.map(event => event.slice(1))).toEqual(expected.map(event => event.slice(1)))
      trace.forEach((event, i) => {
        expect(Number(event[0])).toBeGreaterThanOrEqual(Number(expected[i]![0]) - 90)
        expect(Number(event[0])).toBeLessThanOrEqual(Number(expected[i]![0]) + 900)
      })
      console.log(`${kind} browser WS ms: ${JSON.stringify(trace)}`)
      expect(errors).toEqual([])
    } finally { await leaveRoom(page, roomId) }
  })
}
