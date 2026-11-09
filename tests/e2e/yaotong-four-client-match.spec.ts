import { expect, test, type Page, type BrowserContext } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

// Four isolated browser profiles: separate login cookies, localStorage and actual app WS connections.
async function instrument(context: BrowserContext) {
  await context.addInitScript(() => {
    const w = window as any
    const audit = w.__fourAudit = { socket: null, snapshot: null, rejoins: 0,
      stage: 'original', sentKey: '', stages: {}, errors: [], sends: 0 }
    const Original = window.WebSocket
    w.WebSocket = class extends Original {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols)
        if (!String(url).includes('/ws/room/')) return
        audit.socket = this
        this.addEventListener('message', event => {
          const message = JSON.parse(event.data)
          if (message.kind === 'rejoin_ok') audit.rejoins++
          if (message.kind === 'error') audit.errors.push(message.code)
          if (message.kind === 'yt_snapshot') audit.snapshot = message
        })
      }
    }
  })
}

async function installDriver(page: Page, stage: 'original' | 'play' = 'original') {
  await page.evaluate(async stage => {
    const w = window as any
    const audit = w.__fourAudit
    const { chooseAction } = await import('/src/game/variants/yaotong/ai.ts' as string)
    const { convertSnapshot, toActionPayload } = await import('/src/game/variants/yaotong/remote/protocol.ts' as string)
    audit.stage = stage
    clearInterval(audit.timer)
    audit.timer = setInterval(() => {
      const snapshot = audit.snapshot
      if (!snapshot?.view?.players?.length) return
      const table = document.querySelector('.game-table-hud')
      const current = { phase: table?.getAttribute('data-phase'), reveal: table?.getAttribute('data-reveal-hands'),
        overlay: Boolean(document.querySelector('.round-settlement,.final-board')),
        terminal: Boolean(snapshot.roundResult), at: Date.now() }
      const stages = audit.stages[snapshot.round] ??= []
      const last = stages.at(-1)
      if (!last || last.phase !== current.phase || last.reveal !== current.reveal
        || last.overlay !== current.overlay || last.terminal !== current.terminal) stages.push(current)
      if (snapshot.roundResult || snapshot.opening || audit.stage === 'stop' || audit.socket?.readyState !== 1) return
      if (audit.stage === 'original' && snapshot.view.phase !== 'original') return
      // Every decision uses only this client's private hand and public information.
      const key = JSON.stringify([snapshot.round, snapshot.view.serial, snapshot.view.phase,
        snapshot.view.pending?.choices, snapshot.view.originalDecisions])
      if (key === audit.sentKey) return
      const command = chooseAction(convertSnapshot(snapshot), 0)
      if (command) {
        audit.socket.send(JSON.stringify({ kind: 'action', action: toActionPayload(command) }))
        audit.sentKey = key
        audit.sends++
      }
    }, 150)
  }, stage)
}

const read = (page: Page) => page.evaluate(() => {
  const audit = (window as any).__fourAudit
  return { snapshot: audit.snapshot, rejoins: audit.rejoins, errors: audit.errors,
    stages: audit.stages, sends: audit.sends }
})

async function lobby(page: Page, name: string) {
  await page.goto('/?cameraLab&theme=jade')
  await page.getByRole('radio', { name: /联机对战/ }).click()
  await page.getByTestId('lobby-nickname').fill(name)
  await expect(page.getByTestId('lobby-create')).toBeEnabled()
  await installDriver(page)
}

for (const mode of ['easy', 'hard'] as const) test(`四客户端完整东风场 ${mode}`, async ({ browser }) => {
  test.skip(process.env.YAOTONG_FOUR_CLIENT_E2E !== '1', '需要隔离本地 WS fixture')
  test.setTimeout(20 * 60_000)
  const contexts: BrowserContext[] = []
  const pages: Page[] = []
  const pageErrors: string[] = []
  const rounds: any[] = []
  let roomId = ''
  let playReconnected = false
  let settlementRestored = false
  const started = Date.now()
  try {
    for (let seat = 0; seat < 4; seat++) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'no-preference' })
      contexts.push(context)
      await instrument(context)
      const page = await context.newPage()
      page.on('pageerror', error => pageErrors.push(`seat${seat}: ${error.message}`))
      pages.push(page)
      await lobby(page, `${mode}-${seat}`)
      if (seat === 0) {
        await page.getByTestId('lobby-create').click()
        await page.getByTestId('lobby-create-confirm').click()
        await expect(page.getByTestId('room-code')).toHaveText(/[A-Z0-9]{6}/)
        roomId = (await page.getByTestId('room-code').textContent())!
        expect((await page.request.post('/api/test/seed', { data: { roomId, kind: 'four-client', yaotongMode: mode } })).ok()).toBe(true)
      } else {
        await page.getByTestId('lobby-join').click()
        await page.getByTestId('lobby-join-code').fill(roomId)
        await page.getByTestId('lobby-join-confirm').click()
        await expect(page.getByTestId('room-code')).toHaveText(roomId)
      }
      await page.getByRole('button', { name: '准备 / 取消准备' }).click()
    }
    await expect(pages[0].getByRole('button', { name: /开始对局/ })).toBeEnabled()
    await pages[0].getByRole('button', { name: /开始对局/ }).click()
    await expect.poll(async () => (await read(pages[0])).snapshot?.view.phase, { timeout: 35_000 }).toBe('discard')
    const first = (await read(pages[0])).snapshot
    expect(first.view.ownOptions.mandatory).toBe(true)
    expect(first.view.players.every((p: any) => p.playerKind === 'human')).toBe(true)
    const drawn = pages[0].locator('.hand-rack .hand-tile-slot').nth(13).locator('.mahjong-tile')
    if (mode === 'easy') {
      await expect(drawn).toBeDisabled()
      await expect(pages[0].getByRole('button', { name: /系统防护/ })).toBeVisible()
      // 同时验证服务端保护，其他三个真实客户端不能收到误判包牌。
      await pages[0].evaluate(() => (window as any).__fourAudit.socket.send(JSON.stringify({ kind: 'action', action: { type: 'discard', index: 13 } })))
      await expect.poll(async () => (await read(pages[0])).errors).toContain('PROTECTED_ACTION')
      expect((await Promise.all(pages.map(read))).every(client => !client.snapshot.roundResult)).toBe(true)
      await pages[0].getByRole('button', { name: /^胡/ }).first().click()
    } else {
      await expect(drawn).toBeEnabled()
      await drawn.click()
    }
    console.log(`${mode} ${roomId}: four clients joined; initial ${mode === 'easy' ? 'protection' : 'penalty'} submitted`)
    let completedRound = 0
    let lastProgress = Date.now()
    while (Date.now() - started < 19 * 60_000) {
      const clients = await Promise.all(pages.map(read))
      const current = clients[0].snapshot
      if (!current) throw new Error('缺少房主快照')
      if (!playReconnected && current.round >= 2 && !current.opening && !current.roundResult && current.view.serial >= 8) {
        const count = clients[2].rejoins
        await pages[2].evaluate(() => (window as any).__fourAudit.socket.close())
        await contexts[2].setOffline(true)
        await new Promise(resolve => setTimeout(resolve, 2500))
        await contexts[2].setOffline(false)
        await expect.poll(async () => (await read(pages[2])).rejoins, { timeout: 15_000 }).toBeGreaterThan(count)
        const restored = (await read(pages[2])).snapshot
        expect(restored.seat).toBe(2)
        expect(restored.yaotongMode).toBe(mode)
        expect(restored.view.players[2].hand.length).toBeGreaterThan(0)
        if (restored.roundResult) expect(restored.view.players.every((player: any) => player.hand.length > 0)).toBe(true)
        else expect(restored.view.players[0].hand).toEqual([])
        playReconnected = true
        console.log(`${mode} ${roomId}: seat2 disconnected for 2.5s and restored at hand ${restored.round}`)
      }
      if (current.roundResult && current.round > completedRound) {
        const round = current.round
        if (!settlementRestored) {
          // 刷新整个页面，验证存储会话恢复，不只测试当前 WebSocket 重连。
          await pages[3].reload()
          await pages[3].getByRole('button', { name: /继续对局/ }).click()
          await installDriver(pages[3], 'play')
          settlementRestored = true
          console.log(`${mode} ${roomId}: seat3 page reloaded and session resumed at settlement`)
        }
        await expect.poll(async () => (await Promise.all(pages.map(read))).every(client =>
          client.snapshot?.round === round && Boolean(client.snapshot.roundResult)), { timeout: 15_000 }).toBe(true)
        const settled = await Promise.all(pages.map(read))
        for (const client of settled) expect(client.snapshot.roundResult).toEqual(current.roundResult)
        expect(current.view.players.reduce((sum: number, p: any) => sum + p.score, 0)).toBe(0)
        if (round === 1) expect(current.roundResult.kind).toBe(mode === 'easy' ? 'win' : 'penalty')
        if (round > 1) expect(current.roundResult.kind).not.toBe('penalty')
        await Promise.all(pages.map(async (page, localSeat) => {
          const table = page.locator('.game-table-hud')
          await expect(table).toHaveAttribute('data-reveal-hands', '1', { timeout: 15_000 })
          const expected = [1, 2, 3].map(offset => {
            const seat = (localSeat + offset) % 4
            const count = current.view.players[seat].hand.length
            return count - (current.roundResult.kind === 'win' && current.roundResult.winners[0] === seat ? 1 : 0)
          })
          await expect.poll(async () => {
            const faces = JSON.parse(await page.locator('canvas.mahjong-scene').getAttribute('data-hand-face-rects') ?? '[]')
            return [1, 2, 3].map(seat => faces.filter((face: any) => face.seat === seat).length)
          }).toEqual(expected)
          await expect(page.locator('.round-settlement')).toBeVisible({ timeout: 10_000 })
        }))
        const stages = await Promise.all(pages.map(read))
        for (const client of stages) {
          // 新局发牌开始时上一局弹窗会淡出 300ms；只核对本局终局后的先后顺序。
          const trace = (client.stages[round] ?? []).filter((step: any) => step.terminal)
          expect(trace.some((step: any) => step.reveal === '1')).toBe(true)
          expect(trace.some((step: any) => step.overlay && step.reveal === '0')).toBe(false)
        }
        rounds.push({ round, dealerRound: current.view.dealerRound, dealer: current.dealer,
          result: current.roundResult, scores: current.view.players.map((p: any) => p.score),
          handCounts: current.view.players.map((p: any) => p.hand.length), stages: stages.map(client => client.stages[round]) })
        console.log(`${mode} ${roomId}: hand ${round}, dealer round ${current.view.dealerRound}/4, ${current.roundResult.kind}/${current.roundResult.winKind}, all four reveals verified`)
        completedRound = round
        if (current.matchFinished) {
          expect(current.view.dealerRound).toBe(4)
          expect(playReconnected && settlementRestored).toBe(true)
          expect(rounds.some(hand => hand.result.kind === 'win')).toBe(true)
          await Promise.all(pages.map(async (page, seat) => {
            const ranking = page.getByRole('dialog', { name: '最终排名', exact: true })
            await expect(ranking).toHaveCount(0)
            await page.locator('.round-settlement').getByRole('button', { name: '查看最终排名', exact: true }).click()
            await expect(ranking).toBeVisible()
            await expect(ranking.locator('.yaotong-ledger')).toHaveCount(0)
            await page.screenshot({ path: `test-results/four-client-${mode}-seat${seat}-final.png` })
          }))
          break
        }
        // 三人确认仍不能换局；第四人确认后，才收到新小局与开场演出。
        await Promise.all(pages.slice(0, 3).map(page => page.locator('.round-settlement').getByRole('button', { name: /^继续/ }).click()))
        expect((await read(pages[0])).snapshot.round).toBe(round)
        await pages[3].locator('.round-settlement').getByRole('button', { name: /^继续/ }).click()
        await Promise.all(pages.map(page => page.evaluate(() => { (window as any).__fourAudit.stage = 'play' })))
        await expect.poll(async () => (await Promise.all(pages.map(read))).every(client => client.snapshot?.round === round + 1), { timeout: 15_000 }).toBe(true)
      }
      if (Date.now() - lastProgress > 25_000) {
        console.log(`${mode} ${roomId}: hand ${current.round}, serial ${current.view.serial}, phase ${current.view.phase}, wall ${current.view.wallCount}`)
        lastProgress = Date.now()
      }
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    expect((await read(pages[0])).snapshot.matchFinished).toBe(true)
    expect(pageErrors).toEqual([])
    const final = await Promise.all(pages.map(read))
    for (const client of final) expect(client.errors.filter((code: string) => !['PROTECTED_ACTION', 'STALE_ACTION', 'INVALID_ACTION'].includes(code))).toEqual([])
    await mkdir('test-results/four-client', { recursive: true })
    await writeFile(`test-results/four-client/${mode}.json`, JSON.stringify({ mode, roomId, durationMs: Date.now() - started,
      playReconnected, settlementRestored, rounds, sends: final.map(client => client.sends), errors: final.map(client => client.errors) }, null, 2))
  } catch (error) {
    await mkdir('test-results/four-client', { recursive: true })
    await writeFile(`test-results/four-client/${mode}-failure.json`, JSON.stringify({ roomId, pageErrors, rounds,
      clients: await Promise.all(pages.map(page => read(page).catch(() => null))) }, null, 2))
    await Promise.all(pages.map((page, seat) => page.screenshot({ path: `test-results/four-client-${mode}-seat${seat}-failure.png` }).catch(() => {})))
    throw error
  } finally {
    for (let seat = 0; roomId && seat < pages.length; seat++) {
      const page = pages[seat]
      if (page.isClosed()) continue
      const session = await page.evaluate(() => JSON.parse(localStorage.getItem('lgm_session') ?? 'null')).catch(() => null)
      if (session) await page.request.post(`/api/rooms/${roomId}/leave`, {
        data: { seat, rejoinCode: session.rejoinCode },
      }).catch(() => {})
    }
    await Promise.all(contexts.map(context => context.close()))
  }
})
