import { effectScope, nextTick, type EffectScope } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useYaotongPort } from './useYaotongPort'
import { player, table, meld, ready } from './auditFixtures'
import { YAO } from './tiles'
import { YAOTONG_REACTION_MS, YAOTONG_EXTENDED_REACTION_MS } from './useYaotongGame'

const scopes: EffectScope[] = []
function setup() {
  const scope = effectScope(); scopes.push(scope)
  const port = scope.run(() => useYaotongPort())!
  port.local.mode.value = 'hard'
  const s = table()
  s.players[0].hand.push(4); s.players[0].drawn = 4
  port.local.state.value = s
  return { port, s, scope }
}
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('window', globalThis) })
afterEach(() => { scopes.splice(0).forEach(s => s.stop()); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('弃牌观察间隔', () => {
  it.each([[false, 4, 1000], [false, YAO, 2000], [true, 4, 2000]] as const)(
    '杠后=%s 弃牌=%s：满%s毫秒才摸下一张', async (afterKong, tile, delay) => {
      const { port, s } = setup()
      port.local.mode.value = 'easy'
      s.players[0].hand[13] = tile; s.players[0].drawn = tile; s.players[0].afterKong = afterKong
      port.userDiscard(13)
      await vi.advanceTimersByTimeAsync(delay - 1)
      expect(s.players[0].river).toHaveLength(1)
      expect(s.players[1].hand).toHaveLength(13)
      await vi.advanceTimersByTimeAsync(1)
      expect(s.players[1].hand).toHaveLength(14)
    },
  )
  it.each([[4, 1000], [YAO, 2000]] as const)('真人立即碰%s也不能提前取走牌河，须满%s毫秒', async (tile, delay) => {
    const { port, s } = setup(); port.local.mode.value = 'easy'
    s.current = 1; s.players[1].hand.push(tile)
    s.players[0] = player(tile === YAO ? '11p 147m 258p 369s 24s' : '55m 147m 258p 369s 24s')
    port.local.dispatch({ type: 'discard', index: 13 }, 1)
    port.userPeng()
    await vi.advanceTimersByTimeAsync(delay - 1)
    expect(s.players[0].melds).toHaveLength(0)
    expect(s.players[1].river).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(s.players[0].melds[0].kind).toBe('peng')
    expect(s.players[1].river).toEqual([])
  })
  it('补杠先留两秒观察，再正式成杠和补摸', async () => {
    const { port, s } = setup(); port.local.mode.value = 'easy'
    s.players[0] = player('5m 147s 258p 369s 2p', { drawn: 4, melds: [meld(4, { from: 1 })] })
    port.userGang('m5')
    const count = s.wall.length
    await vi.advanceTimersByTimeAsync(YAOTONG_EXTENDED_REACTION_MS - 1)
    expect(s.players[0].melds[0].kind).toBe('peng'); expect(s.wall).toHaveLength(count)
    await vi.advanceTimersByTimeAsync(1)
    expect(s.players[0].melds[0].kind).toBe('added')
  })
})

describe('老手常驻等与每人每小局累计15秒', () => {
  it('等暂停整桌；可分次累计，重复点击不重置，用完不能再等', async () => {
    const { port, s } = setup()
    port.local.startHold()
    port.local.startHold()
    await vi.advanceTimersByTimeAsync(6000)
    expect(port.local.waitRemainingMs.value).toBe(9000)
    expect(port.isUserTurn.value).toBe(false)
    port.userDiscard(13)
    expect(s.players[0].river).toEqual([])
    port.local.passHold()
    expect(s.waitRemainingMs[0]).toBe(9000)
    port.local.startHold()
    await vi.advanceTimersByTimeAsync(4000)
    port.local.passHold()
    expect(s.waitRemainingMs[0]).toBe(5000)
    port.local.startHold()
    await vi.advanceTimersByTimeAsync(5000)
    expect(port.local.holding.value).toBe(false)
    expect(port.local.waitRemainingMs.value).toBe(0)
    port.local.startHold()
    expect(port.local.holding.value).toBe(false)
    expect(s.waitRemainingMs).toEqual([0, 15000, 15000, 15000])
  })
  it('暂停下家的AI摸牌、碰牌推进；过之后只补足原观察间隔', async () => {
    const { port, s } = setup()
    port.userDiscard(13)
    await vi.advanceTimersByTimeAsync(250)
    port.local.startHold()
    await vi.advanceTimersByTimeAsync(4000)
    expect(s.players[1].hand).toHaveLength(13)
    expect(s.players[0].river).toHaveLength(1)
    port.local.passHold()
    await vi.advanceTimersByTimeAsync(0)
    expect(s.players[1].hand).toHaveLength(14)
    expect(s.waitRemainingMs[0]).toBe(11000)
  })
  it('按过时没有可胡机会不受罚；每个座位的额度独立', async () => {
    const { port, s } = setup()
    port.local.startHold(1)
    await vi.advanceTimersByTimeAsync(1000)
    port.local.passHold()
    expect(s.waitRemainingMs).toEqual([15000, 14000, 15000, 15000])
    expect(s.result).toBeNull()
  })
  it('有合法胡牌机会也不替老手自动停桌；按等后可主动胡', async () => {
    const { port, s } = setup()
    s.current = 1; s.players[1].hand.push(26)
    s.players[0] = { ...ready(), declaration: 'ready' }
    port.local.dispatch({ type: 'discard', index: 13 }, 1)
    expect(port.local.response.value?.hu).toBe(true)
    port.local.startHold()
    await vi.advanceTimersByTimeAsync(2000)
    expect(s.pending?.choices[0]).toBeUndefined()
    port.userHu()
    expect(s.result?.winners).toEqual([0])
    expect(s.waitRemainingMs[0]).toBe(13000)
  })
  it('没按等时继续走牌，下一张出牌前保留胡口，不提前记过手', async () => {
    const { port, s } = setup()
    s.current = 1; s.players[1].hand.push(26)
    s.players[0] = { ...ready(), declaration: 'ready' }
    port.local.dispatch({ type: 'discard', index: 13 }, 1)
    await vi.advanceTimersByTimeAsync(YAOTONG_REACTION_MS - 1)
    expect(s.players[0].passedHu).toBeNull()
    await vi.advanceTimersByTimeAsync(1)
    expect(s.players[0].passedHu).toBeNull()
    expect(s.result).toBeNull()
    await vi.advanceTimersByTimeAsync(999)
    port.local.startHold()
    await vi.advanceTimersByTimeAsync(3000)
    expect(s.players[2].hand).toHaveLength(14)
    port.userHu()
    expect(s.result).toMatchObject({ kind: 'win', source: 1, tile: 26, winners: [0] })
    expect(s.players[2].hand).toHaveLength(13)
    expect(s.result?.indicator).toBe(17)
    expect(s.wall).toEqual([20, 23])
    expect(s.players[1].river).toHaveLength(0)
  })
  it('下一张真正打出后才记过手，不能再回胡旧弃牌', async () => {
    const { port, s } = setup()
    s.current = 1; s.players[1].hand.push(26)
    s.players[0] = { ...ready(), declaration: 'ready' }
    port.local.dispatch({ type: 'discard', index: 13 }, 1)
    await vi.advanceTimersByTimeAsync(1500)
    port.local.dispatch({ type: 'discard', index: 13 }, 2)
    expect(s.players[2].river).toHaveLength(1)
    expect(s.players[0].passedHu).toBeGreaterThan(0)
    port.userHu()
    expect(s.result?.reason).toContain('炸胡')
  })
  it('必须胡的弃牌也保留到下一次出牌，逾期才判未杀报包牌', async () => {
    const { port, s } = setup()
    s.current = 1; s.players[1].hand.push(26); s.players[1].drawn = 26
    s.players[1].declaration = 'ready'
    s.players[0] = { ...ready(), declaration: 'ready' }
    port.local.dispatch({ type: 'discard', index: 13 }, 1)
    await vi.advanceTimersByTimeAsync(1500)
    expect(s.result).toBeNull()
    port.local.dispatch({ type: 'discard', index: 13 }, 2)
    expect(s.result).toMatchObject({ kind: 'penalty', offender: 0, reason: '可杀报却放弃胡牌' })
  })
  it('等额度用完仍可在下一次出牌前直接胡上一张', async () => {
    const { port, s } = setup()
    s.waitRemainingMs[0] = 0
    s.current = 1; s.players[1].hand.push(26)
    s.players[0] = { ...ready(), declaration: 'ready' }
    port.local.dispatch({ type: 'discard', index: 13 }, 1)
    await vi.advanceTimersByTimeAsync(1500)
    const before = JSON.stringify(s)
    expect(port.local.dispatch({ type: 'declareHu', plan: 'invalid' })).toBe(false)
    expect(JSON.stringify(s)).toBe(before)
    port.userHu()
    expect(s.result).toMatchObject({ kind: 'win', source: 1, tile: 26, winners: [0] })
  })
  it('下一家碰走后尚未出牌，仍可按等并胡原出牌者，恢复原碰牌前牌张', async () => {
    const { port, s } = setup()
    s.current = 1; s.players[1].hand.push(26)
    s.players[0] = { ...ready(), declaration: 'ready' }
    s.players[2] = player('99s 147m 258p 369s 24s')
    port.local.dispatch({ type: 'discard', index: 13 }, 1)
    port.local.dispatch({ type: 'respond', action: 'peng' }, 2)
    await vi.advanceTimersByTimeAsync(1500)
    expect(s.players[2].melds).toHaveLength(1)
    port.local.startHold()
    port.userHu()
    expect(s.result).toMatchObject({ kind: 'win', source: 1, winners: [0] })
    expect(s.players[2].melds).toHaveLength(0)
    expect(s.players[2].hand).toHaveLength(13)
  })
  it('延长胡口内主动点过立即记过手，之后再次宣胡不能吃回旧牌', async () => {
    const { port, s } = setup()
    s.current = 1; s.players[1].hand.push(26)
    s.players[0] = { ...ready(), declaration: 'ready' }
    port.local.dispatch({ type: 'discard', index: 13 }, 1)
    await vi.advanceTimersByTimeAsync(1200)
    port.local.startHold(); port.local.passHold()
    expect(s.players[0].passedHu).toBeGreaterThan(0)
    port.userHu()
    expect(s.result?.kind).toBe('penalty')
  })
  it('随时可宣胡，不能成胡时按炸胡包牌；新手不开放该入口', async () => {
    const { port, s } = setup()
    port.local.startHold()
    await vi.advanceTimersByTimeAsync(1234)
    port.userHu()
    expect(s.result).toMatchObject({ kind: 'penalty', offender: 0, reason: '炸胡：当前没有可声明的胡牌机会' })
    expect(s.waitRemainingMs[0]).toBe(13766)
    expect(s.result!.deltas.reduce((a, b) => a + b, 0)).toBe(0)
    const other = setup(); other.port.local.mode.value = 'easy'
    expect(other.port.local.dispatch({ type: 'declareHu' })).toBe(false)
    expect(other.s.result).toBeNull()
  })
  it('抢杠观察窗口可按等再胡，不会遗留原补杠计时器', async () => {
    const { port, s } = setup()
    s.current = 1
    s.players[1] = player('5m 147s 258p 369s 2p', { drawn: 4, melds: [meld(4, { from: 2 })] })
    s.players[0] = player('234567m 234s 66p 34m')
    port.local.dispatch({ type: 'kong', tile: 4 }, 1)
    port.local.startHold()
    await vi.advanceTimersByTimeAsync(500)
    port.userHu()
    await vi.advanceTimersByTimeAsync(3000)
    expect(s.result).toMatchObject({ kind: 'win', winKind: 'rob', winners: [0] })
    expect(s.players[1].melds[0].kind).toBe('peng')
    expect(s.waitRemainingMs[0]).toBe(14500)
  })
  it('抢杠窗口早按过也不缩短两秒观察期', async () => {
    const { port, s } = setup()
    s.current = 1
    s.players[1] = player('5m 147s 258p 369s 2p', { drawn: 4, melds: [meld(4, { from: 2 })] })
    s.players[0] = player('234567m 234s 66p 34m')
    port.local.dispatch({ type: 'kong', tile: 4 }, 1)
    port.local.startHold()
    await vi.advanceTimersByTimeAsync(100)
    port.local.passHold()
    await vi.advanceTimersByTimeAsync(1899)
    expect(s.players[1].melds[0].kind).toBe('peng')
    await vi.advanceTimersByTimeAsync(1)
    expect(s.players[1].melds[0].kind).toBe('added')
  })
  it.each(['pause', 'autoplay', 'mode', 'dispose'] as const)('%s取消等待与旧计时器，不多扣时间', async action => {
    const { port, s, scope } = setup()
    port.local.startHold()
    await vi.advanceTimersByTimeAsync(500)
    if (action === 'pause') port.local.paused.value = true
    if (action === 'autoplay') port.local.autoplay.value = true
    if (action === 'mode') port.local.mode.value = 'easy'
    if (action === 'dispose') scope.stop()
    await nextTick()
    expect(s.waitRemainingMs[0]).toBe(14500)
    expect(port.local.holding.value).toBe(false)
  })
  it('新小局和重新开场各重置15秒；返回大厅清除等待', async () => {
    const { port, s } = setup()
    s.waitRemainingMs[0] = 0
    s.players[0] = player('234567m 234s 66p 789s', { drawn: 26 })
    port.userHu()
    port.local.next()
    expect(port.local.state.value!.waitRemainingMs).toEqual([15000, 15000, 15000, 15000])
    port.local.startHold()
    port.local.leave()
    expect(port.local.holding.value).toBe(false)
    port.local.begin(4)
    expect(port.local.waitRemainingMs.value).toBe(15000)
  })
})
