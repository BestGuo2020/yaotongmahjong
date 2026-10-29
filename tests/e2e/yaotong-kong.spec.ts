import { test, expect } from '@playwright/test'

for (const theme of ['happyMahjong', 'llmAnime']) {
  for (const mobile of [false, true]) {
    test(`${theme} ${mobile ? '手机横屏' : '桌面'}：明暗杠及存杠显示杠，补杠显示补杠`, async ({ page }) => {
      await page.setViewportSize(mobile ? { width: 844, height: 390 } : { width: 1280, height: 720 })
      await page.goto(`/tests/e2e/fixtures/yaotong-kong.html?theme=${theme}`)
      await expect(page.getByRole('button', { name: '暗杠', exact: true })).toBeEnabled({ timeout: 30000 })
      for (const [name, type, seat] of [['暗杠', 'concealed-gang', 0], ['明杠', 'discard-gang', 1],
        ['补杠', 'added-gang', 2], ['存杠', 'concealed-gang', 3]] as const) {
        await page.getByRole('combobox', { name: '开杠玩家' }).selectOption(String(seat))
        await page.getByRole('button', { name, exact: true }).click()
        const cue = page.locator(`.action-gang[data-action-type="${type}"][data-action-seat="${seat}"]`)
        await expect(cue).toBeVisible()
        const copy = cue.locator(theme === 'llmAnime' ? '.anime-action-copy strong' : 'span')
        await expect(copy).toHaveText(name === '补杠' ? '补杠' : '杠')
        if (name === '补杠') await expect(copy).toHaveCSS('white-space', 'nowrap')
        await expect(cue).toHaveCount(0)
        await page.getByRole('button', { name: '清除', exact: true }).click()
      }
    })
  }
}

test('成功开杠才出现对应天气，切换玩家与清除正确', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/yaotong-kong.html')
  const canvas = page.locator('canvas.mahjong-scene')
  await expect(page.getByRole('button', { name: '明杠', exact: true })).toBeEnabled({ timeout: 30000 })
  await page.getByLabel('保留验收画面').check()
  for (const [name, kind, seat] of [['明杠', 'tornado', 0], ['补杠', 'tornado', 1], ['暗杠', 'rain', 2], ['存杠', 'rain', 3]] as const) {
    await page.getByRole('combobox', { name: '开杠玩家' }).selectOption(String(seat))
    await page.getByRole('button', { name, exact: true }).click()
    await expect(canvas).toHaveAttribute('data-kong-weather', JSON.stringify([{ seat, kind }]))
    await page.getByRole('button', { name: '清除', exact: true }).click()
    await expect(canvas).toHaveAttribute('data-kong-weather', '[]')
  }
  await page.getByRole('combobox', { name: '开杠玩家' }).selectOption('0')
  await page.getByRole('button', { name: '明杠', exact: true }).click()
  const progress = page.getByRole('slider', { name: '动画进度' })
  await progress.press('Home')
  await expect.poll(async () => JSON.parse(await canvas.getAttribute('data-kong-weather-layout') ?? '[]')[0]?.x).toBeGreaterThan(0)
  await progress.press('End')
  await expect.poll(async () => JSON.parse(await canvas.getAttribute('data-kong-weather-layout') ?? '[]')[0]?.x).toBeLessThan(0)
  await page.getByRole('button', { name: '暗杠', exact: true }).click()
  await expect(canvas).toHaveAttribute('data-kong-weather-layout', /"layer":"screen"/)
  await page.getByRole('button', { name: '清除', exact: true }).click()
  await page.getByRole('button', { name: '抢杠', exact: true }).click()
  await expect(page.locator('.game-table-hud')).toHaveAttribute('data-reveal-hands', '1', { timeout: 15000 })
  await expect(canvas).toHaveAttribute('data-kong-weather', '[]')
})
