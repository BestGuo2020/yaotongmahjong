import { expect, test, type Browser, type Page } from '@playwright/test'

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

    // 刷新后先显示已保存的房间，再恢复原座位与正在进行的牌桌。
    await pageA.reload()
    await expect(pageA.getByRole('button', { name: /继续对局/ })).toBeVisible()
    await pageA.getByRole('button', { name: /继续对局/ }).click()
    await expect(pageA.locator('canvas').first()).toBeVisible({ timeout: 30_000 })
    await expect(pageA.getByText(roomId!).first()).toBeVisible()
    await expect(pageA.locator('.table-loading')).toHaveCount(0, { timeout: 30_000 })
    await expect(pageA.locator('.hand-rack .hand-tile-slot').first()).toBeVisible({ timeout: 15_000 })

    expect(errors).toEqual([])
    await contextA.close()
    await contextB.close()
  })
})

async function withRoom(browser: Browser, baseURL: string, kind: 'timeout' | 'self', run: (a: Page, b: Page) => Promise<void>) {
  const contexts = await Promise.all([browser.newContext({ baseURL }), browser.newContext({ baseURL })])
  try {
    const [a, b] = await Promise.all(contexts.map(context => context.newPage()))
    await Promise.all([a, b].map(async (page, index) => {
      await page.addInitScript(() => {
        const played: string[] = []
        ;(window as unknown as { interactionSounds: string[] }).interactionSounds = played
        const play = HTMLMediaElement.prototype.play
        HTMLMediaElement.prototype.play = function () {
          const result = play.call(this)
          const file = this.dataset.assetFile
          if (file) void result.then(() => played.push(file), () => {})
          return result
        }
      })
      await page.goto('/')
      await expect(page.locator('.waku-account.authenticated')).toBeVisible()
      await page.getByRole('radio', { name: /联机对战/ }).click()
      await page.getByTestId('lobby-nickname').fill(index === 0 ? '甲' : '乙')
    }))
    await a.getByTestId('lobby-create').click()
    await a.getByTestId('lobby-create-confirm').click()
    const code = a.getByTestId('room-code')
    await expect(code).toHaveText(/[A-Z0-9]{6}/)
    const roomId = await code.innerText()
    await b.getByTestId('lobby-join').click()
    await b.getByTestId('lobby-join-code').fill(roomId)
    await b.getByTestId('lobby-join-confirm').click()
    await expect(b.getByTestId('room-code')).toHaveText(roomId)
    expect((await a.request.post('/api/test/seed', { data: { roomId, kind } })).ok()).toBe(true)
    await Promise.all([a, b].map(page => page.getByRole('button', { name: '准备 / 取消准备' }).click()))
    await a.getByRole('button', { name: /开始对局/ }).click()
    await run(a, b)
  } finally {
    await Promise.all(contexts.map(context => context.close()))
  }
}

const chatButton = (page: Page) => page.getByRole('button', { name: '快捷语', exact: true })
const emoteButton = (page: Page, name: string) => page.getByRole('button', { name: `对${name}使用互动道具` })
const seatBubble = (page: Page, seat: number) => page.locator(`[data-yaotong-seat="${seat}"] .quick-chat-bubble`)

async function sendChat(page: Page, phrase: string) {
  await chatButton(page).click()
  await page.getByRole('dialog', { name: '快捷语' }).getByRole('button', { name: phrase, exact: true }).click()
}

async function sendEmote(page: Page, name: string, emote: string) {
  await emoteButton(page, name).click()
  await page.locator(`.emote-dialog[open] [data-emote-choice="${emote}"]`).click()
}

test.describe('幺筒联机互动', () => {
  test.skip(process.env.YAOTONG_SETTLEMENT_E2E !== '1', '需要 fixtures/yaotong-online-server.py')
  test.setTimeout(120_000)

  test('真实联机双向快捷语和道具各播放一次，并按两端座位显示', async ({ browser, baseURL }) => {
    await withRoom(browser, baseURL!, 'timeout', async (a, b) => {
      await Promise.all([a, b].map(async page => {
        await expect(chatButton(page)).toBeVisible({ timeout: 35_000 })
        await expect(page.locator('.game-table-hud')).toHaveAttribute('data-opening-stage', '', { timeout: 35_000 })
      }))

      await sendChat(a, '能不能跟？')
      await Promise.all([
        expect(seatBubble(a, 0)).toHaveText('能不能跟？'),
        expect(seatBubble(b, 3)).toHaveText('能不能跟？'),
      ])
      await sendChat(b, '让我再想想')
      await Promise.all([
        expect(seatBubble(a, 1)).toHaveText('让我再想想'),
        expect(seatBubble(b, 0)).toHaveText('让我再想想'),
      ])

      await sendEmote(a, '乙', 'tomato')
      await Promise.all([
        expect(a.locator('.emote-performance[data-emote="tomato"][data-from-seat="0"][data-target-seat="1"]')).toHaveCount(1),
        expect(b.locator('.emote-performance[data-emote="tomato"][data-from-seat="3"][data-target-seat="0"]')).toHaveCount(1),
      ])
      await sendEmote(b, '甲', 'like')
      await Promise.all([
        expect(a.locator('.emote-performance[data-emote="like"][data-from-seat="1"][data-target-seat="0"]')).toHaveCount(1),
        expect(b.locator('.emote-performance[data-emote="like"][data-from-seat="0"][data-target-seat="3"]')).toHaveCount(1),
      ])

      await Promise.all([a, b].map(page => expect.poll(() => page.evaluate(() => {
        const sounds = (window as unknown as { interactionSounds: string[] }).interactionSounds
        return sounds.filter(file => /^sounds\/(chat|emote)-/.test(file)).sort()
      })).toEqual(['sounds/chat-follow.ogg', 'sounds/chat-think.ogg', 'sounds/emote-like.ogg', 'sounds/emote-tomato.ogg'])))
    })
  })

  test('结算查看牌桌时可查昵称，连庄后仍能点同一头像选道具', async ({ browser, baseURL }) => {
    await withRoom(browser, baseURL!, 'self', async (a, b) => {
      await expect(a.getByRole('button', { name: '查看牌桌', exact: true })).toBeVisible({ timeout: 65_000 })
      await a.getByRole('button', { name: '查看牌桌', exact: true }).click()
      await expect(a.locator('.game-table-hud')).toHaveAttribute('data-phase', 'settled')
      await expect(emoteButton(a, '乙')).toHaveCount(0)
      await a.getByRole('button', { name: '查看乙的昵称' }).click()
      await expect(a.locator('.player-seat .nickname-popover')).toHaveText('乙')
      await expect(a.locator('.emote-dialog[open]')).toHaveCount(0)

      await Promise.all([
        a.locator('.result-reopen.continue').click(),
        b.locator('.round-settlement').getByRole('button', { name: /^继续/ }).click(),
      ])
      await expect(a.locator('.round-info')).toContainText('东1局')
      await expect(a.locator('.round-honba')).toHaveText(/1本场/, { timeout: 35_000 })
      await expect(a.locator('.game-table-hud')).toHaveAttribute('data-opening-stage', '', { timeout: 35_000 })
      await expect(a.locator('.emote-dialog[open]')).toHaveCount(0)
      await emoteButton(a, '乙').click()
      await expect(a.getByRole('dialog', { name: '对 乙 使用互动道具' })).toBeVisible()
    })
  })
})
