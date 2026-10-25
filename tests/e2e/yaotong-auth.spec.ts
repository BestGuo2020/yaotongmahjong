import { expect, test } from '@playwright/test'

const account = { id: 'auth-test', displayName: '测试玩家', avatarUrl: null }
const loginRequired = '联机对战需要先登录 WakuDemo 账号'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/login/session', route => route.fulfill({ json: { authenticated: false } }))
  await page.route('**/api/rooms/meta?*', route => route.fulfill({
    status: 401, json: { detail: { code: 'AUTH_REQUIRED' } },
  }))
})

for (const viewport of [{ width: 1280, height: 720 }, { width: 844, height: 390 }]) {
  test(`未登录点击联机只提示登录，不查询房间：${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    const roomRequests: string[] = []
    page.on('request', request => {
      if (new URL(request.url()).pathname.startsWith('/api/rooms')) roomRequests.push(request.url())
    })
    await page.goto('/')
    await expect(page.getByRole('button', { name: '登录', exact: true })).toBeEnabled()
    await page.getByRole('radio', { name: /联机对战/ }).click()
    await expect(page.locator('.waku-auth-error')).toHaveText(loginRequired)
    await expect(page.getByRole('radio', { name: /单机对战/ })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByTestId('lobby-create')).toHaveCount(0)
    await expect(page.locator('.start-button')).toBeVisible()
    // 跨过一次原有的房间轮询周期，确保不会被异步 401 改写成“登录已过期”。
    await page.clock.install()
    await page.clock.fastForward(6000)
    await expect(page.locator('.waku-auth-error')).toHaveText(loginRequired)
    expect(roomRequests).toEqual([])
  })
}

test('登录后可点击联机进入房间大厅', async ({ page }) => {
  let authenticated = false
  await page.route('**/api/login/session', route => route.fulfill({
    json: authenticated ? { authenticated: true, account } : { authenticated: false },
  }))
  await page.route('**/api/login/wakudemo?*', route => {
    authenticated = true
    const returnTo = new URL(route.request().url()).searchParams.get('return_to')!
    return route.fulfill({ status: 302, headers: { location: `${returnTo}?wakudemo_login=success` } })
  })
  await page.route('**/api/rooms/meta?*', route => route.fulfill({ json: { active: 1, max: 20 } }))
  await page.goto('/')
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeEnabled()
  await page.getByRole('radio', { name: /联机对战/ }).click()
  await expect(page.locator('.waku-auth-error')).toHaveText(loginRequired)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.locator('.waku-account')).toContainText('已安全登录')
  await page.getByRole('radio', { name: /联机对战/ }).click()
  await expect(page.getByRole('radio', { name: /联机对战/ })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByTestId('lobby-create')).toBeEnabled()
  await expect(page.getByTestId('lobby-join')).toBeEnabled()
  await expect(page.getByTestId('lobby-nickname')).toHaveValue(account.displayName)
  await expect(page.locator('.waku-auth-error')).toHaveCount(0)
})

for (const cancelRemote of [false, true]) {
  test(cancelRemote ? '重新选择单机取消待登录的联机选择' : '登录状态检查完成后继续此前的联机选择', async ({ page }) => {
    let finishSession!: () => void
    const sessionReady = new Promise<void>(resolve => { finishSession = resolve })
    await page.route('**/api/login/session', async route => {
      await sessionReady
      await route.fulfill({ json: { authenticated: true, account } })
    })
    await page.route('**/api/rooms/meta?*', route => route.fulfill({ json: { active: 1, max: 20 } }))
    await page.goto('/')
    await page.getByRole('radio', { name: /联机对战/ }).click()
    await expect(page.getByRole('radio', { name: /单机对战/ })).toHaveAttribute('aria-checked', 'true')
    if (cancelRemote) await page.getByRole('radio', { name: /单机对战/ }).click()
    finishSession()
    await expect(page.locator('.waku-account')).toContainText('已安全登录')
    if (cancelRemote) {
      await expect(page.getByRole('radio', { name: /单机对战/ })).toHaveAttribute('aria-checked', 'true')
      await expect(page.getByTestId('lobby-create')).toHaveCount(0)
    } else {
      await expect(page.getByRole('radio', { name: /联机对战/ })).toHaveAttribute('aria-checked', 'true')
      await expect(page.getByTestId('lobby-create')).toBeEnabled()
      await expect(page.locator('.waku-auth-error')).toHaveCount(0)
    }
  })
}

test('已登录会话被房间接口拒绝时保留过期提示', async ({ page }) => {
  await page.route('**/api/login/session', route => route.fulfill({ json: { authenticated: true, account } }))
  await page.goto('/')
  await expect(page.locator('.waku-account')).toContainText('已安全登录')
  await page.getByRole('radio', { name: /联机对战/ }).click()
  await expect(page.locator('.waku-auth-error')).toHaveText('登录已过期，请重新登录 WakuDemo 账号')
})
