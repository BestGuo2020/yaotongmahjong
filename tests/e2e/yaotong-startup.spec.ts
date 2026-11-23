import { expect, test } from '@playwright/test'

test('资源失败时保留启动页，重试成功后才开放大厅', async ({ page }) => {
  let emoteSoundRequests = 0
  let readyTrackRequests = 0
  await page.route('**/audio/sounds/emote-tomato.ogg', route => {
    emoteSoundRequests++
    return emoteSoundRequests === 1 ? route.fulfill({ status: 503 }) : route.continue()
  })
  await page.route('**/audio/bgm/ting_bgm.ogg', route => {
    readyTrackRequests++
    return route.continue()
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })

  const startup = page.getByRole('region', { name: '幺筒麻将' })
  const retry = startup.getByRole('button', { name: '重新加载' })
  await expect(retry).toBeVisible({ timeout: 20_000 })
  await expect(startup.getByRole('status')).toHaveText('部分游戏资源加载失败，请重试。')
  await expect(startup.getByRole('progressbar')).not.toHaveAttribute('value', '100')
  await expect(page.locator('.start-button')).toHaveCount(0)

  await retry.click()
  await expect(startup).toHaveCount(0)
  await expect(page.locator('.start-button')).toBeVisible()
  expect(emoteSoundRequests).toBe(2)
  expect(readyTrackRequests).toBe(1)
})

test('进入大厅后开局复用加载完成的牌面、桌布和特效素材', async ({ page }) => {
  const matchAsset = /\/(tiles|themes|avatars|effects|audio|images\/emotes)\/|\/img\/(llm|tips)/
  const requested: string[] = []
  await page.route(matchAsset, route => {
    requested.push(new URL(route.request().url()).pathname)
    return route.continue()
  })
  await page.goto('/?theme=llmAnime', { waitUntil: 'domcontentloaded' })
  const start = page.getByRole('button', { name: /开始东风场/ })
  await expect(start).toBeVisible({ timeout: 20_000 })
  expect(requested).toEqual(expect.arrayContaining([
    '/themes/llm-anime/v1/table-felt.png',
    '/themes/llm-anime/v1/tile-back.png',
    '/effects/yaotong-weather/mesh_wind.obj',
    '/images/emotes/egg-impact.png',
  ]))

  requested.length = 0
  await start.click()
  await expect(page.locator('.game-table-hud canvas')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.table-loading')).toBeHidden({ timeout: 20_000 })
  expect(requested).toEqual([])
})
