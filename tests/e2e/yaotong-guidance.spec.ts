import { expect, test, type Locator, type Page } from '@playwright/test'

async function scenario(page: Page, value: string) {
  await page.evaluate((name) => (window as unknown as { setGuidanceScenario: (value: string) => void }).setGuidanceScenario(name), value)
}

for (const theme of ['jade', 'rosewood', 'happyMahjong', 'llm', 'llmAnime']) {
  test(`${theme} 常驻按钮共用主题外观与选中描边`, async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 320 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(`/tests/e2e/fixtures/yaotong-guidance.html?scenario=hard-wait-idle&quickChat&theme=${theme}`)
    const rail = page.locator('.table-persistent-actions')
    const autoplay = rail.locator('.autoplay-action')
    const wait = rail.getByRole('button', { name: /^等，/ })
    const chat = rail.getByRole('button', { name: '快捷语', exact: true })
    await expect(rail.locator('> .action')).toHaveCount(3, { timeout: 30000 })
    const appearance = (button: Locator) => button.evaluate(element => {
      const style = getComputedStyle(element)
      return {
        border: style.border,
        radius: style.borderRadius,
        background: style.background,
        shadow: style.boxShadow,
        color: style.color,
        outlineWidth: style.outlineWidth,
        outlineColor: style.outlineColor,
      }
    })

    const idle = await appearance(autoplay)
    expect(await appearance(wait)).toEqual(idle)
    expect(await appearance(chat)).toEqual(idle)
    if (theme === 'llmAnime') await page.screenshot({ path: 'tmp/yaotong-llmAnime-persistent-after.png' })

    await chat.click()
    await expect(chat).toHaveAttribute('aria-expanded', 'true')
    await expect(chat).toHaveCSS('outline-width', '1px')
    const selected = await appearance(chat)
    expect(selected.background).toBe(idle.background)
    await page.getByRole('dialog', { name: '快捷语' }).getByRole('button', { name: '关闭快捷语' }).click()
    await expect(chat).toHaveAttribute('aria-expanded', 'false')

    await autoplay.click()
    await expect(autoplay).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => appearance(autoplay)).toEqual(selected)
    await autoplay.click()
    await expect(autoplay).toHaveAttribute('aria-pressed', 'false')
    await expect.poll(() => appearance(autoplay)).toEqual(idle)
  })

  for (const viewport of [{ width: 1280, height: 720 }, { width: 844, height: 390 }]) {
    test(`系统防护可点击查看、关闭且不遮挡操作：${theme} ${viewport.width}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto(`/tests/e2e/fixtures/yaotong-guidance.html?theme=${theme}`)
      const trigger = page.getByRole('button', { name: '系统防护', exact: true })
      await expect(trigger).toHaveText('')
      await expect(trigger.locator('svg[aria-hidden="true"]')).toBeVisible()
      await expect(trigger).toHaveAccessibleDescription('本巡已碰鸡，请打其他牌')
      await expect(trigger).toBeInViewport({ ratio: 1 })
      await trigger.click()
      const help = page.getByRole('dialog', { name: '系统防护' })
      await expect(help).toBeVisible()
      await expect(help).toContainText('本巡已碰鸡，请打其他牌')
      await expect(help).toContainText('下次实际摸牌后解除')
      await expect(help).toContainText('现在怎么做')
      const confirm = help.getByRole('button', { name: '知道了' })
      await expect(confirm).toBeInViewport({ ratio: 1 })
      await page.screenshot({ path: `tmp/yaotong-guidance-${theme}-${viewport.width}.png` })
      await confirm.click()
      await expect(help).not.toBeVisible()
      await expect(trigger).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(help).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(help).not.toBeVisible()
      await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    })
  }
}

test('同时展示多个限制；状态解除后关闭详情并清除旧提示', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await page.goto('/tests/e2e/fixtures/yaotong-guidance.html?scenario=multiple')
  await page.getByRole('button', { name: /系统防护/ }).click()
  const help = page.getByRole('dialog', { name: '系统防护' })
  await expect(help.locator('article')).toHaveCount(2)
  await expect(help).toContainText('过手中，暂时不能胡')
  await expect(help).toContainText('本巡已打鸡，不能碰鸡')
  await help.getByRole('button', { name: '知道了' }).click()
  await page.getByRole('button', { name: /系统防护/ }).click()
  await scenario(page, 'clear')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.getByRole('button', { name: /系统防护/ })).toHaveCount(0)
  // Modal top layer must be released as the state changes.
  await scenario(page, 'mandatory')
  await page.getByRole('button', { name: /系统防护/ }).click()
  await expect(help).toContainText('已有玩家原报或报听')
  await help.getByRole('button', { name: '关闭提示' }).click()
  await expect(page.getByRole('button', { name: '胡', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '过', exact: true })).toHaveCount(0)
})

test('原报和报听提示按当前选择更新，老手模式不出现新手模式教学', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/yaotong-guidance.html?scenario=original')
  const trigger = page.getByRole('button', { name: '操作提示', exact: true })
  await expect(trigger).toHaveAccessibleDescription('起手已听，可选择原报')
  await trigger.click()
  await expect(page.getByRole('dialog')).toContainText('不原报')
  await page.getByRole('button', { name: '知道了' }).click()
  await scenario(page, 'declare')
  await expect(trigger).toHaveAccessibleDescription('可报听：先点报听，再出牌')
  const declare = page.getByRole('button', { name: '报听', exact: true })
  const waits = page.getByRole('button', { name: '查看听牌提示', exact: true })
  const autoplay = page.getByRole('button', { name: '开启机器人托管，自动出牌与过牌', exact: true })
  await expect(declare).toHaveText('报听')
  for (const button of [trigger, waits, autoplay]) {
    await expect(button).toHaveText('')
    await expect(button.locator('svg[aria-hidden="true"]')).toBeVisible()
  }
  await declare.click()
  const cancel = page.getByRole('button', { name: '取消报听', exact: true })
  await expect(cancel).toHaveText('取消报听')
  await expect(cancel).toHaveAttribute('aria-pressed', 'true')
  await expect(cancel).toHaveAttribute('title', '取消报听')
  await expect(trigger).toHaveAccessibleDescription('报听已选，请打带箭头的牌')
  await trigger.click()
  await expect(page.getByRole('dialog')).toContainText('取消报听')
  await page.getByRole('button', { name: '知道了' }).click()
  await cancel.click()
  await expect(declare).toHaveAttribute('aria-pressed', 'false')
  await scenario(page, 'hard')
  await expect(trigger).toHaveCount(0)
  await expect(page.getByRole('button', { name: /系统防护/ })).toHaveCount(0)
})
