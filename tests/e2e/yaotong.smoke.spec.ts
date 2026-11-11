import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  // 大厅联机面板以已登录身份验收；未登录与登录失效单独由 yaotong-auth 覆盖。
  await page.route('**/api/login/session', route => route.fulfill({ json: {
    authenticated: true,
    account: { id: 'smoke-test', displayName: '测试玩家', avatarUrl: null },
  } }))
  await page.route('**/api/rooms/meta?*', route => route.fulfill({ json: { active: 0, max: 20 } }))
})

for (const theme of ['jade', 'rosewood', 'happyMahjong', 'llm', 'llmAnime']) {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 844, height: 390 }]) {
    test(`末局结算后可查看完整最终排名：${theme} ${viewport.width}×${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto(`/tests/e2e/fixtures/yaotong-final.html?theme=${theme}`)
      const round = page.getByRole('dialog', { name: /东4局/ })
      const ranking = page.getByRole('dialog', { name: '最终排名', exact: true })
      await expect(round).toBeVisible()
      await expect(ranking).toHaveCount(0)
      await expect(round.getByRole('tab', { name: '概览', exact: true })).toHaveAttribute('aria-selected', 'true')
      await round.getByRole('button', { name: '查看最终排名', exact: true }).click()
      await expect(ranking).toBeVisible()
      await expect(round).toHaveCount(0)
      await expect(ranking.locator('.final-rankings article')).toHaveCount(4)
      await expect(ranking.locator('.final-rankings em')).toHaveText(['82', '71', '-28', '-125'])
      await expect(ranking.locator('.final-name').first()).toHaveText('你')
      await expect(ranking.getByRole('tablist')).toHaveCount(0)
      await expect(ranking.locator('.yaotong-ledger')).toHaveCount(0)
      for (const row of await ranking.locator('.final-rankings article').all())
        await expect(row).toBeInViewport({ ratio: 1 })
      await expect(ranking.getByRole('button', { name: '查看本局结算', exact: true })).toBeInViewport({ ratio: 1 })
      await expect(ranking.getByRole('button', { name: '返回大厅', exact: true })).toBeInViewport({ ratio: 1 })
      const [detailsStyle, lobbyStyle] = await ranking.locator('.final-footer > button').evaluateAll(buttons => buttons.map(button => {
        const style = getComputedStyle(button)
        const { width, height } = button.getBoundingClientRect()
        return { width, height, border: style.border, radius: style.borderRadius,
          background: style.background, shadow: style.boxShadow, color: style.color, font: style.font }
      }))
      expect(detailsStyle).toEqual(lobbyStyle)
      const overflow = await ranking.evaluate(board => board.scrollHeight - board.clientHeight)
      expect(overflow, '排名不应需要滚动整张结算卡片').toBeLessThanOrEqual(1)
    })
  }
}

test('末局明细支持键盘切换，查看牌桌及最终排名后可返回本局', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/tests/e2e/fixtures/yaotong-final.html')
  const round = page.getByRole('dialog', { name: /东4局/ })
  const ranking = page.getByRole('dialog', { name: '最终排名', exact: true })
  const overviewTab = round.getByRole('tab', { name: '概览', exact: true })
  const detailTab = round.getByRole('tab', { name: '分数明细', exact: true })
  const details = round.getByRole('tabpanel', { name: '分数明细', exact: true })
  await overviewTab.focus()
  await overviewTab.press('ArrowRight')
  await expect(detailTab).toBeFocused()
  await expect(detailTab).toHaveAttribute('aria-selected', 'true')
  await expect(details.locator('.yaotong-ledger')).toBeVisible()
  const avatar = details.getByRole('button', { name: '查看望月的分数流向', exact: true })
  await avatar.click()
  await expect(avatar).toHaveAttribute('aria-pressed', 'true')
  await details.locator('.yaotong-ledger summary').click()
  expect(await details.evaluate(panel => {
    panel.scrollTop = panel.scrollHeight
    return panel.scrollTop
  })).toBeGreaterThan(0)
  await detailTab.focus()
  await detailTab.press('Home')
  await expect(overviewTab).toBeFocused()
  await expect(details).not.toBeVisible()
  await overviewTab.press('End')
  await expect(detailTab).toBeFocused()
  await expect(avatar).toHaveAttribute('aria-pressed', 'true')
  await expect(details.locator('.yaotong-ledger summary')).toHaveText('分项账单 · 6 笔')
  await round.getByRole('button', { name: '查看牌桌', exact: true }).click()
  await expect(round).toHaveCount(0)
  await page.getByRole('button', { name: '查看结算', exact: true }).click()
  await expect(details).toBeVisible()
  await round.getByRole('button', { name: '查看最终排名', exact: true }).click()
  await expect(ranking.locator('.final-rankings em')).toHaveText(['82', '71', '-28', '-125'])
  await ranking.getByRole('button', { name: '查看本局结算', exact: true }).click()
  await expect(details).toBeVisible()
  await round.getByRole('button', { name: '查看最终排名', exact: true }).click()
  await ranking.getByRole('button', { name: '返回大厅', exact: true }).click()
  await expect(page.getByTestId('back-to-lobby')).toBeVisible()
})

test('大厅提供幺筒，登录后联机入口进入房间面板', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/?game=legacy')
  await expect(page.locator('.lobby-brand h1')).toHaveText('幺筒麻将')
  await expect(page.getByText(/莲花广麻|翻精癞子|血流到底/)).toHaveCount(0)
  const multiplayer = page.getByRole('radio', { name: '联机对战 创建或加入房间' })
  await expect(multiplayer).toBeVisible()
  await multiplayer.click()
  await expect(multiplayer).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('.waku-account')).toBeVisible()
  await expect(page.getByTestId('lobby-create')).toBeVisible()
  await expect(page.getByTestId('lobby-join')).toBeVisible()
  await expect(page.locator('.start-button')).toHaveCount(0)
  await page.getByRole('radio', { name: /单机对战/ }).click()
  await expect(page.locator('.start-button')).toContainText('开始东风场')
  await page.getByRole('button', { name: /场次 东风场/ }).click()
  await page.getByRole('button', { name: '全庄场 16 庄次 · 连庄不增加庄次' }).click()
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.locator('.start-button')).toContainText('开始全庄场')
  await page.getByRole('button', { name: /游戏规则/ }).click()
  await expect(page.locator('.rules-panel h2')).toHaveText('幺筒麻将 · v1.7')
  await expect(page.locator('.rules-panel')).toContainText('108张')
  expect(errors).toEqual([])
})

for (const viewport of [{ width: 1280, height: 720 }, { width: 844, height: 390 }]) {
  test(`模式选择可确认、取消，并适配五个主题：${viewport.width}`, async ({ page }) => {
    test.setTimeout(60000)
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/?theme=llm')
    const modeRow = page.locator('.game-settings > button').last()
    await expect(modeRow).toHaveText('模式新手模式系统辅助 · 防止违规')
    for (const theme of ['jade', 'rosewood', 'happyMahjong', 'llm', 'llmAnime']) {
      await page.goto(`/?theme=${theme}`)
      await modeRow.click()
      const picker = page.getByRole('dialog', { name: '选择模式' })
      const hard = picker.getByRole('button', { name: /老手模式/ })
      await expect(picker).toBeVisible()
      await expect(picker.getByRole('button', { name: /新手模式/ })).toHaveAttribute('aria-pressed', 'true')
      await expect(hard).toBeInViewport({ ratio: 1 })
      await hard.click()
      await expect(hard).toHaveAttribute('aria-pressed', 'true')
      await picker.getByRole('button', { name: '取消', exact: true }).click()
      await expect(modeRow).toContainText('新手模式')
      await modeRow.click()
      await hard.click()
      const confirm = picker.getByRole('button', { name: '确定', exact: true })
      await expect(confirm).toBeInViewport({ ratio: 1 })
      await page.screenshot({ path: `tmp/yaotong-mode-${theme}-${viewport.width}.png` })
      await confirm.click()
      await expect(modeRow).toHaveText('模式老手模式自主判断 · 违规包牌')
      await modeRow.click()
      await expect(hard).toHaveAttribute('aria-pressed', 'true')
      await picker.getByRole('button', { name: /新手模式/ }).click()
      await confirm.click()
      await expect(modeRow).toContainText('新手模式')
    }
  })
}

test('慢网下等牌面、音效和报听 BGM 就绪才开始发牌', async ({ page }) => {
  test.setTimeout(90_000)
  const slowFiles = ['/tiles/5m.png', '/audio/sounds/peng.ogg', '/audio/bgm/ting_bgm.ogg']
  const release = new Map<string, () => void>()
  await page.route(url => slowFiles.includes(url.pathname), async route => {
    const path = new URL(route.request().url()).pathname
    await new Promise<void>(resolve => { release.set(path, resolve) })
    await route.continue()
  })
  try {
    await page.goto('/?quality=low', { waitUntil: 'domcontentloaded' })
    await expect.poll(() => release.size).toBe(slowFiles.length)
    await page.locator('.start-button').click()
    const table = page.locator('.game-table-hud')
    await expect(table.locator('.table-loading')).toBeVisible()
    await expect(table).toHaveAttribute('data-wall-count', '108')
    release.get('/tiles/5m.png')!()
    await expect(table.locator('canvas')).toBeVisible()
    release.get('/audio/sounds/peng.ogg')!()
    await expect(table).toHaveAttribute('data-opening-stage', '')
    await expect(table.locator('.table-loading')).toBeVisible()
    release.get('/audio/bgm/ting_bgm.ogg')!()
    await expect(table.locator('.table-loading')).toHaveCount(0, { timeout: 30_000 })
    await expect(table).not.toHaveAttribute('data-wall-count', '108', { timeout: 15_000 })
  } finally {
    for (const resume of release.values()) resume()
  }
})

test('幺筒正常开局、托管至结算并返回大厅', async ({ page }) => {
  test.setTimeout(240_000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    localStorage.setItem('lianhua-guangma:audio-preferences:v1', JSON.stringify({ soundOn: false, bgmOn: false, effectsOn: false }))
  })
  await page.goto('/')
  await page.locator('.start-button').click()
  await expect(page.locator('.game-table-hud')).toBeVisible()
  await expect(page.locator('.game-table-hud canvas')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.table-loading')).toHaveCount(0, { timeout: 30_000 })
  await expect(page.locator('.round-info')).toHaveText('东风场 · 东1局')
  await expect(page.getByRole('button', { name: '开打', exact: true })).toHaveCount(0)
  await expect(page.locator('.announcement')).toHaveText('东1局 · 开牌', { timeout: 20_000 })
  // An eligible starting hand still requires its owner's original-report decision.
  const declineOriginal = page.getByRole('button', { name: '不原报', exact: true })
  const settlement = page.locator('.round-settlement')
  await expect.poll(async () => {
    if (await declineOriginal.isVisible()) await declineOriginal.click()
    // A random dealer can legally win before the human's first draw.
    if (await settlement.isVisible()) return true
    // Another dealer can offer us a peng before our first draw. Decline that response explicitly.
    const pass = page.getByRole('button', { name: '过', exact: true })
    if (await pass.isVisible()) await pass.click()
    else {
      const hu = page.getByRole('button', { name: '胡', exact: true })
      if (await hu.isVisible()) await hu.click()
    }
    return await page.locator('.hand-rack.playable .hand-tile-slot').count() === 14
  }, { timeout: 20_000 }).toBe(true)
  if (!await settlement.isVisible()) {
    await expect(page.locator('.hand-rack.playable .hand-tile-slot')).toHaveCount(14, { timeout: 15_000 })
    await page.locator('.hand-rack.playable .mahjong-tile').first().click()
    await expect(page.locator('.hand-tile-slot')).toHaveCount(13)
    const autoplay = page.getByRole('button', { name: '开启机器人托管，自动出牌与过牌' })
    await expect(autoplay).toBeVisible({ timeout: 30_000 })
    await page.screenshot({ path: 'tmp/yaotong-cleanup-table.png' })
    await autoplay.click()
  }
  await expect(page.locator('.round-settlement')).toBeVisible({ timeout: 200_000 })
  await expect(page.locator('.round-rankings article')).toHaveCount(4)
  await expect(page.locator('.round-settlement h2')).toHaveText(/^东[1-4]局 · (自摸|胡牌|抢杠胡|热炮胡|一炮[23]响|荒庄|包牌)$/)
  await expect(page.getByRole('tab', { name: '概览', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.yaotong-ledger')).not.toBeVisible()
  await page.getByRole('tab', { name: '分数明细', exact: true }).click()
  await page.locator('.yaotong-ledger summary').click()
  await expect(page.locator('.yaotong-ledger table')).toBeVisible()
  await page.getByRole('tab', { name: '概览', exact: true }).click()
  for (const viewport of [{ width: 1280, height: 720 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport)
    const footer = page.locator('.round-settlement .settlement-footer')
    await expect.poll(() => page.locator('.round-settlement').evaluate(root => {
      const bottom = Math.max(...Array.from(root.querySelectorAll('.round-rankings article')).map(row => row.getBoundingClientRect().bottom))
      return root.querySelector('.settlement-footer')!.getBoundingClientRect().top - bottom
    }), { message: '切换屏幕后结算按钮应在排名卡片下方' }).toBeGreaterThanOrEqual(0)
    await footer.scrollIntoViewIfNeeded()
    await expect(page.locator('.round-rankings article').last()).toBeInViewport({ ratio: 1 })
    await expect(page.getByRole('button', { name: '继续', exact: true })).toBeInViewport({ ratio: 1 })
    await page.screenshot({ path: `tmp/yaotong-settlement-footer-${viewport.width}.png` })
  }
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.screenshot({ path: 'tmp/yaotong-cleanup-settlement.png' })
  await page.getByRole('button', { name: '继续', exact: true }).click()
  await expect(page.locator('.round-settlement')).toHaveCount(0)
  // A legal repeat hand keeps the same dealer-round label.
  await expect(page.locator('.announcement')).toContainText('开牌', { timeout: 20_000 })
  await expect(page.locator('.game-table-hud canvas')).toBeVisible()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: '退出对局', exact: true }).click()
  await expect(page.locator('.lobby-brand h1')).toHaveText('幺筒麻将')
  expect(errors).toEqual([])
})

test('小屏模式切换、五个主题、角色与声音设置仍可用', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 844, height: 390 })
  await page.goto('/')
  for (let index = 0; index < 5; index++) {
    await page.getByRole('button', { name: '切换牌桌主题' }).click()
    const themes = page.getByRole('menuitemradio')
    await expect(themes).toHaveCount(5)
    await themes.nth(index).click()
    await expect(page.locator('.lobby-brand h1')).toBeVisible()
    await expect(page.locator('.start-button')).toBeVisible()
  }
  await page.getByRole('button', { name: /更换本家形象/ }).click()
  await expect(page.getByRole('radiogroup', { name: '选择本家二次元角色' })).toBeVisible()
  await page.getByRole('radiogroup', { name: '选择本家二次元角色' }).getByRole('radio').nth(1).click()
  await expect(page.getByRole('radiogroup', { name: '选择本家二次元角色' })).toHaveCount(0)
  await page.getByRole('button', { name: '声音设置', exact: true }).click()
  const sound = page.getByRole('switch', { name: /声音总开关/ })
  const enabled = await sound.getAttribute('aria-checked')
  await sound.click()
  await expect(sound).toHaveAttribute('aria-checked', enabled === 'true' ? 'false' : 'true')
  await page.getByRole('button', { name: '声音设置', exact: true }).click()
  await page.getByRole('radio', { name: /联机对战/ }).click()
  await expect(page.getByTestId('lobby-create')).toBeVisible()
  expect(errors).toEqual([])
})
