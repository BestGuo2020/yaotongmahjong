import { expect, test } from '@playwright/test'

test.use({ hasTouch: true, isMobile: true, viewport: { width: 844, height: 390 } })

test('原报接对家点炮后查看规则，关闭规则再续局，庄家手牌可触摸打出', async ({ page }) => {
  test.setTimeout(60000)
  await page.goto('/?theme=jade')
  await expect(page.locator('.lobby')).toBeVisible()
  await page.evaluate(async () => {
    // 只注入确定性起手，其余操作使用真实 App、声音、结算和下一局流程。
    const { table, player, ready } = await import('/src/game/variants/yaotong/auditFixtures.ts')
    const game = (document.querySelector('#app') as any).__vue_app__._instance.setupState.yaotongGame
    ;(window as any).originalNextGame = game
    const state = table()
    state.phase = 'original'
    state.dealer = state.current = 2
    state.players[0] = { ...ready(), draws: 0 }
    state.players[2] = player('147m 258p 369s 2468s', { draws: 0 })
    state.wall = [26, 3, 5, 8, 12, 14, 17, 20, 23]
    game.local.state.value = state
  })
  await expect(page.locator('.table-loading')).toHaveCount(0, { timeout: 30000 })
  await page.getByRole('button', { name: '原报', exact: true }).tap()
  await page.waitForFunction(() => (window as any).originalNextGame.local.state.value.phase === 'discard')
  await page.evaluate(() => (window as any).originalNextGame.local.dispatch({ type: 'discard', index: 13 }, 2))
  await page.getByRole('button', { name: '胡', exact: true }).tap()
  await page.getByRole('button', { name: '查看规则', exact: true }).tap()
  await expect(page.locator('.rules-panel')).toBeVisible()
  await page.getByRole('button', { name: '关闭规则', exact: true }).tap()
  await expect(page.locator('.rules-panel')).toHaveCount(0)
  await page.getByRole('button', { name: '继续', exact: true }).tap({ timeout: 30000 })
  await page.waitForFunction(() => {
    const game = (window as any).originalNextGame
    return !game.openingActive.value && (game.isUserTurn.value || (game.original.value && game.local.waiting.value.length))
  }, undefined, { timeout: 20000 })
  // 下一手若又有原报资格，玩家必须先作出选择。
  const declineOriginal = page.getByRole('button', { name: '不原报', exact: true })
  if (await declineOriginal.count()) await declineOriginal.tap()
  await expect(page.locator('.hand-rack.playable .mahjong-tile')).toHaveCount(14)
  await expect.poll(() => page.evaluate(() => {
    const game = (window as any).originalNextGame
    return { hand: game.local.state.value.handNumber, dealer: game.dealer.value, paused: game.local.paused.value }
  })).toEqual({ hand: 2, dealer: 0, paused: false })
  const tile = page.locator('.hand-rack .mahjong-tile[aria-disabled="false"]').first()
  await tile.tap()
  await expect(page.locator('.hand-rack .mahjong-tile.selected')).toHaveCount(1)
  await tile.tap()
  await expect.poll(() => page.evaluate(() => (window as any).originalNextGame.local.state.value.players[0].discards)).toBe(1)
})
