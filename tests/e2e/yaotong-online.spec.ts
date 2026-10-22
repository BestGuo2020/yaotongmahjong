import { expect, test } from '@playwright/test'

test.describe('幺筒联机', () => {
  test('两个 wakudemo 开发身份建房、加入、准备并开局', async ({ browser }) => {
    // 默认 e2e 不启动上游后端；需要显式 YAOTONG_ONLINE_E2E=1 + 本地后端。
    test.skip(process.env.YAOTONG_ONLINE_E2E !== '1', '需要本地幺筒后端')
    test.setTimeout(120_000)
    const contextA = await browser.newContext()
    const contextB = await browser.newContext()
    const pageA = await contextA.newPage()
    const pageB = await contextB.newPage()
    const errors: string[] = []
    pageA.on('pageerror', (error) => errors.push(`A: ${error.message}`))
    pageB.on('pageerror', (error) => errors.push(`B: ${error.message}`))

    await pageA.goto('/')
    await pageB.goto('/')

    await pageA.getByRole('radio', { name: /联机对战/ }).click()
    await expect(pageA.getByTestId('online-create')).toBeVisible()
    await pageA.getByTestId('online-nickname-create').fill('甲')
    await pageA.getByTestId('online-length').selectOption('4')
    await pageA.getByTestId('online-create').click()

    await expect(pageA.getByTestId('online-room-id'))
      .toContainText(/房间 [A-Z0-9]{6}/)
    const roomText = await pageA.getByTestId('online-room-id').textContent()
    const roomId = roomText?.match(/[A-Z0-9]{6}/)?.[0]
    expect(roomId).toBeTruthy()

    await pageB.getByRole('radio', { name: /联机对战/ }).click()
    await expect(pageB.getByTestId('online-join')).toBeVisible()
    await pageB.getByTestId('online-nickname-join').fill('乙')
    await pageB.getByTestId('online-room-code').fill(roomId!)
    await pageB.getByTestId('online-join').click()
    await expect(pageB.getByTestId('online-room-id')).toContainText(roomId!)

    await pageA.getByTestId('online-ready').click()
    await pageB.getByTestId('online-ready').click()
    await expect(pageA.getByTestId('online-start')).toBeEnabled()

    await pageA.getByTestId('online-start').click()

    // 开局快照到达后进入牌桌；联机房间号显示在顶栏。
    await expect(pageA.locator('canvas').first()).toBeVisible({ timeout: 30_000 })
    await expect(pageB.locator('canvas').first()).toBeVisible({ timeout: 30_000 })
    await expect(pageA.getByText(roomId!).first()).toBeVisible({ timeout: 15_000 })

    expect(errors).toEqual([])
    await contextA.close()
    await contextB.close()
  })
})
