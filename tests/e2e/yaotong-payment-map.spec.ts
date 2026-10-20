import { expect, test } from '@playwright/test'

for (const viewport of [{ width: 1280, height: 720 }, { width: 844, height: 390 }]) {
  test(`点击头像交换收付视角，其他头像保持原位：${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/tests/e2e/fixtures/yaotong-final.html?round&self')
    await page.getByRole('tab', { name: '分数明细', exact: true }).click()
    const map = page.getByRole('region', { name: '本局分数流向', exact: true })
    const avatars = ['你', '听风', '观山', '望月'].map(name =>
      map.getByRole('button', { name: `查看${name}的分数流向`, exact: true }))
    const expectPositions = async (positions: string[]) => {
      for (const [seat, position] of positions.entries())
        await expect(avatars[seat]).toHaveAttribute('transform', `translate(${position})`)
    }
    await expect(map.getByRole('group', { name: '查看玩家收付', exact: true })).toHaveCount(0)
    await expectPositions(['300,139', '85,30', '300,30', '515,30'])
    await expect(avatars[0]).toHaveAttribute('aria-pressed', 'true')
    const payment = map.locator('.payment-edge').filter({ hasText: '望月向你净付' })
    const amount = (await payment.locator('text').textContent())!.slice(1)
    await expect(payment).toHaveClass(/incoming/)

    await avatars[3].click()
    await expectPositions(['515,30', '85,30', '300,30', '300,139'])
    await expect(map.getByRole('group', { name: '望月的本局收付', exact: true })).toBeVisible()
    await expect(avatars[3]).toHaveAttribute('aria-pressed', 'true')
    await expect(avatars[0]).toHaveAttribute('aria-pressed', 'false')
    await expect(payment).not.toHaveClass(/incoming/)
    await expect(payment.locator('text')).toHaveText(`−${amount}`)
    await expect(payment.locator('.payment-line')).toHaveAttribute('d', 'M 300 116 Q 407.5 85 515 53')
    await payment.click()
    await expect(page.locator('.yaotong-ledger details')).toHaveAttribute('open', '')
    for (const row of await page.locator('.yaotong-ledger tbody tr').all())
      await expect(row.locator('td').first()).toHaveText(/^(望月 → 你|你 → 望月)$/)

    await avatars[1].click()
    await expectPositions(['515,30', '300,139', '300,30', '85,30'])
    await avatars[2].focus()
    await avatars[2].press('Enter')
    await expectPositions(['515,30', '300,30', '300,139', '85,30'])
    await avatars[0].focus()
    await avatars[0].press('Space')
    await expectPositions(['300,139', '300,30', '515,30', '85,30'])
    await expect(map.getByRole('group', { name: '你的本局收付', exact: true })).toBeVisible()
    await avatars[0].click()
    await expectPositions(['300,139', '300,30', '515,30', '85,30'])
    await page.screenshot({ path: `tmp/yaotong-payment-avatars-${viewport.width}.png` })
  })
}
