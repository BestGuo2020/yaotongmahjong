import { expect, test, type Page } from '@playwright/test'

async function scenario(page: Page, value: string) {
  await page.evaluate((name) => (window as unknown as { setGuidanceScenario: (value: string) => void }).setGuidanceScenario(name), value)
}

for (const theme of ['jade', 'rosewood', 'happyMahjong', 'llm', 'llmAnime']) {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 844, height: 390 }]) {
    test(`系统防护可点击查看、关闭且不遮挡操作：${theme} ${viewport.width}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto(`/tests/e2e/fixtures/yaotong-guidance.html?theme=${theme}`)
      const trigger = page.getByRole('button', { name: /系统防护/ })
      await expect(trigger).toContainText('本巡已碰鸡，请打非鸡牌')
      await expect(trigger).toBeInViewport({ ratio: 1 })
      await trigger.click()
      const help = page.getByRole('dialog', { name: '系统防护' })
      await expect(help).toBeVisible()
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

test('原报和报听提示按当前选择更新，困难模式不出现简单模式教学', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/yaotong-guidance.html?scenario=original')
  let trigger = page.getByRole('button', { name: /操作提示/ })
  await expect(trigger).toContainText('起手已听，可选择原报')
  await trigger.click()
  await expect(page.getByRole('dialog')).toContainText('不原报')
  await page.getByRole('button', { name: '知道了' }).click()
  await scenario(page, 'declare')
  await expect(trigger).toContainText('可报听：先点报听，再出牌')
  await page.getByRole('button', { name: '报听', exact: true }).click()
  await expect(trigger).toContainText('报听已选，请打带箭头的牌')
  await trigger.click()
  await expect(page.getByRole('dialog')).toContainText('取消报听')
  await page.getByRole('button', { name: '知道了' }).click()
  await scenario(page, 'hard')
  await expect(trigger).toHaveCount(0)
  await expect(page.getByRole('button', { name: /系统防护/ })).toHaveCount(0)
})
