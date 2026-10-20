import { expect, test } from '@playwright/test'

test.use({ isMobile: true, hasTouch: true, deviceScaleFactor: 2 })

for (const theme of ['jade', 'rosewood', 'happyMahjong', 'llm', 'llmAnime']) {
  for (const [index, viewport] of [{ width: 892, height: 412 }, { width: 844, height: 390 }, { width: 740, height: 360 }].entries()) {
    test(`手机结算摘要紧凑、排名有序且所有操作可见：${theme} ${viewport.width}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto(`/tests/e2e/fixtures/yaotong-final.html?round&theme=${theme}&${['report', 'self&double', 'multi'][index]}`)
      const card = page.locator('.settlement-card')
      const panel = page.getByRole('tabpanel', { name: '概览', exact: true })
      await expect(panel).toBeVisible()
      await panel.evaluate(async element => {
        await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {})))
      })
      const title = (await card.locator('h2').boundingBox())!
      const tabs = (await page.getByRole('tablist', { name: '结算内容' }).boundingBox())!
      expect(Math.abs(title.y + title.height / 2 - tabs.y - tabs.height / 2), '标题和选项卡在同一行').toBeLessThanOrEqual(2)
      await expect(card.locator('.rank-number')).toHaveText(['1位', '2位', '3位', '4位'])
      await expect(card.locator('.rank-score-label')).toHaveText(['本局', '累计', '本局', '累计', '本局', '累计', '本局', '累计'])
      const rows = await card.locator('.round-rankings article').all()
      for (const row of rows) await expect(row).toBeInViewport({ ratio: 1 })
      const positions = await Promise.all(rows.map(row => row.boundingBox()))
      expect(Math.abs(positions[0]!.y - positions[1]!.y)).toBeLessThanOrEqual(1)
      expect(Math.abs(positions[2]!.y - positions[3]!.y)).toBeLessThanOrEqual(1)
      expect(positions[2]!.y).toBeGreaterThan(positions[0]!.y + positions[0]!.height)
      for (const area of [card, panel, page.locator('.yaotong-round-overview'), page.locator('.round-rankings')]) {
        const overflow = await area.evaluate(element => ({ x: element.scrollWidth - element.clientWidth, y: element.scrollHeight - element.clientHeight }))
        expect(overflow.x, '结算内容不应横向溢出').toBeLessThanOrEqual(1)
        expect(overflow.y, '概览内容应完整放入可见区域').toBeLessThanOrEqual(1)
      }
      const summary = (await page.locator('.yaotong-round-overview').boundingBox())!
      const chicken = (await page.locator('.overview-chicken').boundingBox())!
      expect(chicken.y).toBeGreaterThanOrEqual(summary.y)
      expect(chicken.y + chicken.height).toBeLessThanOrEqual(summary.y + summary.height)
      await expect(page.getByRole('button', { name: '继续', exact: true })).toBeInViewport({ ratio: 1 })
      await expect(page.getByRole('button', { name: '查看牌桌', exact: true })).toBeInViewport({ ratio: 1 })
      await page.screenshot({ path: `tmp/mobile-settlement-${theme}-${viewport.width}.png` })
      await page.getByRole('tab', { name: '分数明细', exact: true }).click()
      await page.locator('.yaotong-ledger summary').click()
      await page.getByRole('tabpanel', { name: '分数明细', exact: true }).evaluate(element => { element.scrollTop = element.scrollHeight })
      await expect(page.getByRole('button', { name: '继续', exact: true })).toBeInViewport({ ratio: 1 })
    })
  }
}
