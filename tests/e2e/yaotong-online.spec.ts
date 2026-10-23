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
    await expect(pageA.getByTestId('lobby-create')).toBeEnabled({ timeout: 15_000 })
    await pageA.getByTestId('lobby-nickname').fill('甲')
    await pageA.getByTestId('lobby-create').click()
    await expect(pageA.getByRole('dialog', { name: '创建房间' })).toBeVisible()
    await pageA.locator('.game-settings button').filter({ hasText: '模式' }).click()
    await expect(pageA.getByRole('dialog', { name: '选择模式' })).toBeVisible()
    await pageA.getByRole('button', { name: /老手模式/ }).click()
    await pageA.getByRole('button', { name: '确定', exact: true }).click()
    await expect(pageA.getByRole('dialog', { name: '创建房间' })).toBeVisible()
    await pageA.waitForTimeout(400)
    await pageA.screenshot({ path: 'test-results/online-create.png' })
    await pageA.getByTestId('lobby-create-confirm').click()

    await expect(pageA.getByTestId('room-code')).toHaveText(/[A-Z0-9]{6}/)
    await expect(pageA.locator('.room-game-config')).toContainText('东风场')
    await expect(pageA.locator('.room-game-config')).toContainText('老手模式')
    const roomId = await pageA.getByTestId('room-code').textContent()

    await pageB.getByRole('radio', { name: /联机对战/ }).click()
    await expect(pageB.getByTestId('lobby-join')).toBeEnabled({ timeout: 15_000 })
    await pageB.getByTestId('lobby-nickname').fill('乙')
    await pageB.getByTestId('lobby-join').click()
    await pageB.getByTestId('lobby-join-code').fill(roomId!)
    await pageB.getByTestId('lobby-join-confirm').click()
    await expect(pageB.getByTestId('room-code')).toHaveText(roomId!)
    await pageA.screenshot({ path: 'test-results/online-room.png' })

    await pageA.getByRole('button', { name: '准备 / 取消准备' }).click()
    await pageB.getByRole('button', { name: '准备 / 取消准备' }).click()
    const start = pageA.getByRole('button', { name: /开始对局/ })
    await expect(start).toBeEnabled({ timeout: 15_000 })

    await start.click()

    // 开局快照到达后进入牌桌；联机房间号显示在顶栏。
    await expect(pageA.locator('canvas').first()).toBeVisible({ timeout: 30_000 })
    await expect(pageB.locator('canvas').first()).toBeVisible({ timeout: 30_000 })
    await expect(pageA.getByText(roomId!).first()).toBeVisible({ timeout: 15_000 })
    await expect(pageA.locator('.table-loading')).toHaveCount(0, { timeout: 30_000 })
    await pageA.waitForFunction(() => {
      const table = document.querySelector('[data-opening-stage]')
      return (!table || table.getAttribute('data-opening-stage') === '')
        && document.querySelectorAll('.hand-rack .hand-tile-slot').length >= 13
    }, { timeout: 30_000 })
    await pageA.waitForTimeout(600)
    await pageA.screenshot({ path: 'test-results/online-table-hard.png' })

    // 老手“等”：点等暂停整桌，胡/过解除；额度按实际等待扣减。
    const waitButton = pageA.locator('.wait-action')
    await expect(waitButton).toBeVisible()
    await waitButton.click()
    await expect(pageA.locator('.action.hu').first()).toBeVisible()
    await expect(pageA.locator('.action.pass')).toBeVisible()
    await pageA.waitForTimeout(1200)
    await pageA.locator('.action.pass').click()
    await expect(waitButton).toBeVisible()
    await expect(waitButton).not.toContainText('15秒')

    expect(errors).toEqual([])
    await contextA.close()
    await contextB.close()
  })
})
