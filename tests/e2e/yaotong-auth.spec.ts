import { expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'

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
    // WebKit cannot fulfill an intercepted request with 302; emulate the provider's return page.
    return route.fulfill({ contentType: 'text/html',
      body: `<script>location.replace(${JSON.stringify(`${returnTo}?wakudemo_login=success`)})</script>` })
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

for (const explicitTheme of [null, 'jade']) {
  test(explicitTheme ? '大模型房尊重玩家明确选择的主题' : '大模型房默认切换到 llmAnime', async ({ page }) => {
    const roomId = 'ANIME1'
    const nickname = account.displayName
    const room = {
      roomId, rulesetId: 'yaotong', matchLength: 4, capacity: 4, status: 'lobby', creatorSeat: 0,
      llmEnabled: true, llmAvailable: true, effectiveLlmEnabled: true, reservedSeats: [],
      seats: [{ seat: 0, nickname, ready: false, connected: true }, null, null, null],
    }
    await page.route('**/api/login/session', route => route.fulfill({ json: { authenticated: true, account } }))
    await page.route('**/api/rooms/meta?*', route => route.fulfill({ json: {
      active: 0, max: 4, llmAvailable: true,
    } }))
    await page.route('**/api/rooms', async route => {
      expect(route.request().postDataJSON().llmEnabled).toBe(true)
      await route.fulfill({ json: room })
    })
    await page.route('**/api/rooms/ANIME1/join', route => route.fulfill({ json: {
      roomId, seat: 0, nickname, rejoinCode: 'TEST', playerId: 'wakudemo-auth-test', rejoin: false,
    } }))
    await page.route('**/api/rooms/ANIME1', route => route.fulfill({ json: room }))
    await page.routeWebSocket('**/ws/room/ANIME1*', ws => {
      ws.send(JSON.stringify({ kind: 'rejoin_ok', seat: 0, nickname, matchLength: 4 }))
    })

    await page.goto(explicitTheme ? '/?theme=jade' : '/')
    await expect(page.locator('.waku-account.authenticated')).toBeVisible()
    const app = page.locator('main.game-app')
    await expect(app).toHaveAttribute('data-table-theme', 'jade')
    await page.getByRole('radio', { name: /联机对战/ }).click()
    await page.getByTestId('lobby-create').click()
    await page.getByTestId('remote-llm-enabled').check()
    await page.getByTestId('lobby-create-confirm').click()
    await expect(page.getByTestId('room-code')).toHaveText(roomId)
    await expect(app).toHaveAttribute('data-table-theme', explicitTheme ?? 'llmAnime')
    expect(new URL(page.url()).searchParams.get('theme')).toBe(explicitTheme)
  })
}

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

test('跨站 Cookie 不可用时，授权回大厅、刷新和退出仍保持正确登录态', async ({ page, context }) => {
  const token = 't'.repeat(43)
  let challenge = '', exchanged = false, revoked = false
  await page.route('**/api/login/session', route => route.fulfill({ json:
    exchanged && !revoked && route.request().headers().authorization === `Bearer ${token}`
      ? { authenticated: true, account: { id: 'safari-user', displayName: '苹果测试玩家', avatarUrl: null } }
      : { authenticated: false },
  }))
  await page.route('**/api/login/wakudemo?*', route => {
    const url = new URL(route.request().url())
    challenge = url.searchParams.get('session_challenge')!
    const target = new URL(url.searchParams.get('return_to')!)
    target.searchParams.set('wakudemo_login', 'success')
    target.hash = `wakudemo_ticket=${'k'.repeat(43)}`
    return route.fulfill({ contentType: 'text/html',
      body: `<script>location.replace(${JSON.stringify(target.href)})</script>` })
  })
  await page.route('**/api/login/exchange', async route => {
    const payload = route.request().postDataJSON()
    expect(createHash('sha256').update(payload.verifier).digest('base64url')).toBe(challenge)
    expect(payload.ticket).toBe('k'.repeat(43))
    expect(route.request().headers().cookie).toBeUndefined()
    exchanged = true
    await route.fulfill({ json: { sessionToken: token } })
  })
  await page.route('**/api/login/logout', async route => {
    expect(route.request().headers().authorization).toBe(`Bearer ${token}`)
    revoked = true
    await route.fulfill({ json: { authenticated: false } })
  })
  await page.goto('/')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.locator('.waku-account')).toContainText('苹果测试玩家')
  await expect(page.locator('.waku-account')).toContainText('已安全登录')
  expect(page.url()).not.toContain('wakudemo_')
  expect(await context.cookies()).toEqual([])
  await page.reload()
  await expect(page.locator('.waku-account')).toContainText('已安全登录')
  await page.getByRole('button', { name: '退出', exact: true }).click()
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeEnabled()
  expect(await page.evaluate(() => sessionStorage.getItem('yaotong.auth.session'))).toBeNull()
})

test('授权返回后会话仍失效时明确提示，不静默恢复为登录按钮', async ({ page }) => {
  await page.route('**/api/login/session', route => route.fulfill({ json: { authenticated: false } }))
  await page.goto('/?wakudemo_login=success')
  await expect(page.getByRole('alert')).toContainText('登录会话未能恢复')
  expect(page.url()).not.toContain('wakudemo_login')
})
