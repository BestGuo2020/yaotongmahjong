import { describe, expect, it } from 'vitest'
import { act, continueGame, createGame, kongOptions, makePlayer, selfOptions } from './engine'
import { chooseAction } from './ai'
import { discardWaits, evaluateHand, passAllows, waits } from './hands'
import { chickenValue, nextDealer, ownedTiles, readyInfo, settle } from './settlement'
import { breakWall, countsOf, shuffledWall, YAO } from './tiles'
import type { GameState, Meld, Player, Tile, WinContext } from './types'

function tiles(text: string): Tile[] {
  return text
    .trim()
    .split(/\s+/)
    .flatMap((part) => [...part.slice(0, -1)].map((n) => 'mps'.indexOf(part.at(-1)!) * 9 + Number(n) - 1))
}
function player(text: string, extra: Partial<Player> = {}): Player {
  return { ...makePlayer(), draws: 2, hand: tiles(text), ...extra }
}
const peng = (tile: Tile, extra: Partial<Meld> = {}): Meld => ({
  tile,
  kind: 'peng',
  pre: false,
  chicken: 0,
  responsibility: 0,
  ...extra,
})
const ready = () => player('234567m 234s 66p 78s')
const unready = () => player('147m 258p 369s 2468s')
const values = (p: Player, ctx: Partial<WinContext> = {}) =>
  evaluateHand(p, { kind: 'ready', tile: p.hand.at(-1)!, ...ctx })
function table(): GameState {
  const state = createGame({ dealer: 0, dice: [2, 3] })
  state.players = [0, 1, 2, 3].map(() => unready())
  state.wall = [17, 20, 23]
  state.phase = 'discard'
  return state
}
const amount = (s: ReturnType<typeof settle>, from: number, to: number, account?: string) =>
  s.transfers
    .filter((t) => t.from === from && t.to === to && (!account || t.account === account))
    .reduce((n, t) => n + t.amount, 0)

describe('幺筒：牌墙和资格', () => {
  it('108张，每种四张，四家13张，庄家随后才摸第一张', () => {
    const s = createGame({ dealer: 2, dice: [3, 3] })
    expect(s.players.map((p) => p.hand.length)).toEqual([13, 13, 13, 13])
    expect(s.wall).toHaveLength(56)
    expect(countsOf([...s.wall, ...s.players.flatMap((p) => p.hand)])).toEqual(Array(27).fill(4))
    for (let seat = 0; seat < 4; seat++) act(s, seat, { type: 'original', declare: false })
    expect(s.current).toBe(2)
    expect(s.players[2].hand).toHaveLength(14)
    expect(s.players[2].draws).toBe(1)
  })
  it('骰子定方和保留列，保留牌仍在墙中', () => {
    const wall = shuffledWall(() => 0.3)
    expect(breakWall(wall, [3, 6], 0)).toMatchObject({ side: 0, reserved: 3 })
    expect(breakWall(wall, [3, 3], 0)).toMatchObject({ side: 1, reserved: 3 })
    expect(breakWall(wall, [3, 3], 0).wall).toHaveLength(108)
  })
  it('硬鸡胡仍不能接普通炮，但能自摸、抢杠和接热炮', () => {
    const p = player('234567m 234s 66p 789s')
    expect(values(p, { kind: 'discard' })).toHaveLength(0)
    expect(values(p, { kind: 'self' }).length).toBeGreaterThan(0)
    expect(values(p, { kind: 'rob' })[0].h).toBe(35)
    expect(values(p, { kind: 'hot' })[0].h).toBe(35)
  })
  it('无杠鸡胡仍是听牌；报听后可以普通点炮', () => {
    expect(waits(ready()).length).toBeGreaterThan(0)
    const p = player('234567m 234s 66p 789s', { declaration: 'ready' })
    expect(values(p, { kind: 'discard' })[0].h).toBe(35)
  })
  it('癞子可以组成全癞子将、同组多张，替代后清一色不借硬胡', () => {
    expect(values(player('234567m 234789s 11p')).length).toBeGreaterThan(0)
    const result = values(player('123456789m 11m 111p'))
    expect(result.some((v) => v.patterns.some((p) => p.name === '清一色'))).toBe(true)
    expect(
      result
        .filter((v) => v.patterns.some((p) => p.name === '清一色'))
        .every((v) => !v.patterns.some((p) => p.name === '硬胡')),
    ).toBe(true)
  })
  it('七对最高档、癞子龙头和三地龙', () => {
    const seven = values(player('11112222m 3333s 55p'))
    expect(seven.some((v) => v.h === 135 && v.patterns.some((p) => p.name === '三龙七'))).toBe(true)
    const soft = values(player('111222m 3344s 55p 11p'))
    expect(soft.some((v) => v.patterns.some((p) => p.name === '双龙七'))).toBe(true)
    const earth = player('3333p 2222m 55s 2p', { melds: [peng(10)] })
    expect(values(earth, { tile: 10 }).some((v) => v.h === 135 && v.structure === 'earth')).toBe(true)
    expect(
      values({ ...earth, melds: [peng(10, { kind: 'open' })] }, { tile: 10 }).some(
        (v) => v.structure === 'earth',
      ),
    ).toBe(false)
  })
  it('幺筒可作胡入地龙张，素胡独立计25且翻鸡后复核', () => {
    const earth = player('3333p 2222m 55s 1p', { melds: [peng(10)] })
    expect(values(earth, { tile: YAO }).some((v) => v.structure === 'earth' && !v.winningYaoNatural)).toBe(
      true,
    )
    const p = player('234567m 234s 66p 789s')
    expect(values(p, { kind: 'self' }).some((v) => v.h === 25 && v.patterns.length === 1)).toBe(true)
    expect(
      values(p, { kind: 'self', chicken: 1 }).some((v) => v.patterns.some((p) => p.name === '素胡')),
    ).toBe(false)
  })
  it('未碰杠出牌的第一次摸牌区分天胡、地胡；第二次摸牌不计', () => {
    const p = player('234567m 234s 66p 789s', { draws: 1, drawn: 26 })
    expect(values(p, { kind: 'self', isDealer: true })[0].patterns).toContainEqual({ name: '天胡', points: 40 })
    expect(values(p, { kind: 'self', isDealer: false })[0].patterns).toContainEqual({ name: '地胡', points: 40 })
    expect(values({ ...p, draws: 2 }, { kind: 'self', isDealer: true })[0].h).toBe(25)
  })
})

describe('幺筒：文档计分算例', () => {
  it('四张幺筒 30+20+15+10+第五份10，翻九筒=255', () => {
    const p = player('1p', {
      river: [30, 20, 15].map((chicken, id) => ({ tile: YAO, chicken, stage: 'normal', id })),
    })
    expect(chickenValue(p, 1, YAO)).toBe(255)
    expect(chickenValue(p, 0, YAO, true)).toBe(65)
  })
  it('固定鸡成杠翻鸡为(10+2)×3=36；普通翻鸡四张为5', () => {
    const p = player('', { hand: [], melds: [peng(18, { kind: 'stored', chicken: 10 })] })
    expect(chickenValue(p, 0, 18)).toBe(36)
    expect(chickenValue({ ...p, melds: [peng(4, { kind: 'stored' })] }, 0, 4)).toBe(5)
  })
  it.each([
    [false, 65, 45],
    [true, 120, 90],
  ])('幺筒碰，预冲=%s', (pre, responsibility, other) => {
    const s = table()
    s.players[0] = player('234567m 66p 78s', {
      melds: [peng(YAO, { pre, from: 1, chicken: pre ? 90 : 45, responsibility: pre ? 30 : 20 })],
    })
    s.wall = []
    const r = settle(s, { kind: 'win' })
    expect(amount(r, 1, 0)).toBe(responsibility)
    expect(amount(r, 2, 0)).toBe(other)
  })
  it('未听碰幺筒反赔责任家65、其他听者45，不赔未听者', () => {
    const s = table()
    s.players[0] = player('147m 258p 369s 2s', {
      melds: [peng(YAO, { from: 1, chicken: 45, responsibility: 20 })],
    })
    s.players[1] = ready()
    s.players[2] = ready()
    s.wall = []
    const r = settle(s, { kind: 'win' })
    expect(amount(r, 0, 1)).toBe(65)
    expect(amount(r, 0, 2)).toBe(45)
    expect(amount(r, 0, 3)).toBe(0)
  })
  it('烧鸡不改变听牌，可收未听者露出鸡', () => {
    const s = table()
    s.wall = []
    s.players[0] = { ...ready(), burned: true, river: [{ tile: 18, chicken: 4, stage: 'normal', id: 1 }] }
    s.players[1].river = [{ tile: 0, chicken: 4, stage: 'normal', id: 2 }]
    const r = settle(s, { kind: 'win' })
    expect(amount(r, 1, 0, '鸡分')).toBe(4)
    expect(amount(r, 2, 0, '鸡分')).toBe(0)
  })
  it('幺筒补杠继承责任，成功后不重复碰分；存杠不收杠分', () => {
    const s = table()
    s.wall = []
    s.players[0] = player('234567m 66p 78s', {
      melds: [peng(YAO, { kind: 'added', from: 1, chicken: 60, responsibility: 20 })],
    })
    const r = settle(s, { kind: 'win' })
    expect(amount(r, 1, 0) - amount(r, 1, 0, '见面礼')).toBe(100)
    expect(amount(r, 2, 0) - amount(r, 2, 0, '见面礼')).toBe(80)
    s.players[0].melds[0].kind = 'stored'
    expect(settle(s, { kind: 'draw' }).transfers.some((t) => t.account === '杠分')).toBe(false)
  })
  it('流局硬清一色30+露出鸡4=34，不另收听者自己的鸡', () => {
    const s = table()
    s.wall = []
    s.players[1] = player('234567789m 22m 45m', { river: [{ tile: 18, chicken: 6, stage: 'normal', id: 1 }] })
    s.players[0].river = [{ tile: 0, chicken: 4, stage: 'normal', id: 2 }]
    expect(readyInfo(s.players[1]).price).toBe(30)
    const r = settle(s, { kind: 'draw' })
    expect(amount(r, 0, 1)).toBe(34)
    expect(r.indicator).toBeNull()
  })
  it('包牌最低45，双倍每家90，不结杠和见面礼', () => {
    const s = table()
    s.dice = [4, 4]
    s.players[0].melds = [peng(YAO, { kind: 'turn', chicken: 60 })]
    const r = settle(s, { kind: 'penalty', offender: 0 })
    expect(r.deltas).toEqual([-270, 90, 90, 90])
    expect(r.transfers.every((t) => t.account === '一般包牌赔付')).toBe(true)
    expect(r.indicator).toBeNull()
  })
  it('包牌用不含基础5的最高牌型价，见面礼不需听牌', () => {
    const s = table()
    s.players[1] = player('11112222m 33s 55p 6p')
    expect(readyInfo(s.players[1]).price).toBe(90)
    expect(amount(settle(s, { kind: 'penalty', offender: 0 }), 0, 2)).toBe(90)
    s.players = [unready(), unready(), unready(), unready()]
    s.players[0].river = [0, 1, 2, 3].map((id) => ({ tile: YAO, chicken: 15, stage: 'later', id }))
    expect(amount(settle(s, { kind: 'draw' }), 1, 0, '见面礼')).toBe(100)
  })
  it('杀原报只加40，胡牌和见面礼不翻三倍', () => {
    const s = table()
    s.wall = [17]
    s.players[0] = player('234567m 234s 66p 789s')
    s.players[1].declaration = 'original'
    const r = settle(s, { kind: 'win', winners: [0], winKind: 'self', tile: 26 })
    expect(amount(r, 1, 0, '胡牌分')).toBe(15)
    expect(amount(r, 1, 0, '杀报加分')).toBe(40)
    expect(amount(r, 2, 0, '杀报加分')).toBe(0)
  })
})

describe('幺筒：操作、判罚、末张、轮庄', () => {
  it('同巡同鸡种碰打、打碰留按钮后判包牌', () => {
    const s = table()
    s.players[0] = player('147m 258p 369s 2468s 1p', { chickenPeng: [9] })
    expect(act(s, 0, { type: 'discard', index: 13 })).toBe(true)
    expect(s.result).toMatchObject({ kind: 'penalty', offender: 0 })
    const q = table()
    q.players[0] = player('147m 258p 369s 2468s 1s')
    q.players[1] = player('11s 147m 258p 369s 24s', { chickenDiscard: [18] })
    act(q, 0, { type: 'discard', index: 13 })
    expect(q.pending?.options[1]).toMatchObject({ peng: true, restrictedPeng: true })
    act(q, 1, { type: 'respond', action: 'peng' })
    expect(q.result?.kind).toBe('penalty')
  })
  it('过手胡的变大牌门槛：同45不行，大于此前且>=45才行', () => {
    const p = ready()
    p.passedHu = 45
    expect(passAllows(p, 45)).toBe(false)
    expect(passAllows(p, 55)).toBe(true)
    p.passedHu = 5
    expect(passAllows(p, 35)).toBe(false)
  })
  it('合法杀报不胡触发包牌；过手原本不可胡则不强制', () => {
    const s = table()
    s.players[0] = player('234567m 234s 66p 789s', { drawn: 26 })
    s.players[1].declaration = 'ready'
    expect(selfOptions(s, 0).mandatory).toBe(true)
    act(s, 0, { type: 'discard', index: 13 })
    expect(s.result?.kind).toBe('penalty')
    const q = table()
    q.players[0] = player('234567m 234s 66p 789s', { drawn: 26, passedHu: 45 })
    q.players[1].declaration = 'ready'
    expect(selfOptions(q, 0)).toMatchObject({ hu: true, restrictedHu: true, mandatory: false })
    act(q, 0, { type: 'hu' })
    expect(q.result?.kind).toBe('penalty')
  })
  it('报听后锁牌禁碰杠；原报仅在庄家第一次摸前', () => {
    const s = table()
    s.players[0] = player('1111m 234567s 234p 5p', { declaration: 'ready', drawn: 13 })
    expect(kongOptions(s, 0)).toEqual([])
    expect(act(s, 0, { type: 'discard', index: 0 })).toBe(false)
    expect(act(s, 0, { type: 'original', declare: true })).toBe(false)
    expect(act(s, 0, { type: 'discard', index: 13 })).toBe(true)
  })
  it('最后一家的首张幺筒和直接碰仍为预冲；之后首冲独立计次', () => {
    const s = table()
    s.players.forEach((p, i) => (p.discards = i === 0 ? 0 : 1))
    s.players[0] = player('147m 258p 369s 2468s 1p')
    s.players[1] = player('11p 147m 258p 369s 24s', { discards: 1 })
    act(s, 0, { type: 'discard', index: 13 })
    expect(s.pending?.discard?.chicken).toBe(30)
    act(s, 1, { type: 'respond', action: 'peng' })
    expect(s.players[1].melds[0]).toMatchObject({ pre: true, chicken: 90, responsibility: 30 })
    expect(s.firstYaoDiscard).toBe(false)
  })
  it('牌墙空仍能碰，完成出牌响应后才荒庄，禁止再杠', () => {
    const s = table()
    s.wall = []
    s.players[0] = player('147m 258p 369s 2468s 5m')
    s.players[1] = player('55m 147m 258p 369s 24s')
    act(s, 0, { type: 'discard', index: 13 })
    expect(s.pending?.options[1]).toMatchObject({ peng: true, kong: false })
    act(s, 1, { type: 'respond', action: 'peng' })
    expect(s.phase).toBe('discard')
    expect(s.current).toBe(1)
    act(s, 1, { type: 'discard', index: 0 })
    while (s.phase === 'response') {
      const seat = Number(Object.keys(s.pending!.options).find((i) => !s.pending!.choices[Number(i)]))
      act(s, seat, { type: 'respond', action: 'pass' })
    }
    expect(s.result?.kind).toBe('draw')
    expect(s.result?.indicator).toBeNull()
  })
  it.each([
    [true, true, true, true],
    [false, false, true, true],
    [false, false, false, false],
  ])('流局未听人数不是1则原庄继续 %s', (...r) => {
    const s = table()
    s.dealer = 2
    expect(nextDealer(s, { kind: 'draw', ready: r, winners: [], source: null })).toBe(2)
  })
  it('末庄允许连庄，直到换庄才结束；每小局重置全部首巡状态', () => {
    const s = table()
    s.dealerRound = 4
    s.players[0] = ready()
    s.players[1] = ready()
    s.players[2] = ready()
    s.result = settle(s, { kind: 'draw' })
    expect(s.result).toMatchObject({ nextDealer: 3, finished: true })
    s.players[3] = ready()
    s.players[0] = unready()
    s.result = settle(s, { kind: 'draw' })
    expect(s.result).toMatchObject({ nextDealer: 0, finished: false })
    const next = continueGame(s, { dice: [1, 1] })
    expect(next).toMatchObject({
      dealerRound: 4,
      repeats: 1,
      handNumber: 2,
      firstFixedDiscard: [],
      firstFixedPeng: false,
      firstYaoDiscard: false,
    })
    expect(next.players.every((p) => p.draws === 0 && p.discards === 0 && p.passedHu === null)).toBe(true)
  })
})

describe('幺筒：抢杠、多响与点炮责任', () => {
  it('胡入本牌幺筒翻九筒：放炮家H+90，另两家各30', () => {
    const s = table()
    s.players[1] = player('234m 456789s 66p 123p', { declaration: 'ready' })
    const r = settle(s, {
      kind: 'win',
      winners: [1],
      source: 0,
      winKind: 'discard',
      tile: YAO,
      responsibility: 20,
    })
    expect(r.values[1].winningYaoNatural).toBe(true)
    expect(amount(r, 0, 1)).toBe(r.values[1].h + 90)
    expect(amount(r, 2, 1)).toBe(30)
    expect(amount(r, 3, 1)).toBe(30)
    expect(r.deltas[1]).toBe(r.values[1].h + 150)
  })
  it('胡入癞子幺筒：责任20不翻三倍，不计本牌鸡分', () => {
    const s = table()
    s.players[1] = player('234m 456789s 66p 45p 1p', { declaration: 'ready' })
    const r = settle(s, {
      kind: 'win',
      winners: [1],
      source: 0,
      winKind: 'discard',
      tile: YAO,
      responsibility: 20,
    })
    expect(r.values[1].winningYaoNatural).toBe(false)
    expect(amount(r, 0, 1, '幺筒责任分')).toBe(20)
    expect(amount(r, 0, 1, '鸡分')).toBe(0)
  })
  it('放炮家包三份见面礼，不叠加一般包牌', () => {
    const s = table()
    s.wall = []
    s.players[1] = player('234m 567s 22p 45s 1p', {
      declaration: 'ready',
      melds: [peng(YAO, { from: 2, chicken: 45, responsibility: 20 })],
    })
    const r = settle(s, {
      kind: 'win',
      winners: [1],
      source: 0,
      winKind: 'discard',
      tile: YAO,
      responsibility: 20,
    })
    expect(amount(r, 0, 1, '见面礼')).toBe(300)
    expect(amount(r, 2, 1, '见面礼')).toBe(0)
    expect(amount(r, 3, 1, '见面礼')).toBe(0)
    expect(r.transfers.some((t) => t.account === '一般包牌赔付')).toBe(false)
  })
  it('补杠幺筒被抢，保留原碰，不收成功杠分、不收四张见面礼', () => {
    const s = table()
    s.players[0] = player('147m 258p 369s 2s 1p', {
      drawn: YAO,
      melds: [peng(YAO, { from: 2, chicken: 45, responsibility: 20 })],
    })
    s.players[1] = player('234m 456789s 66p 45p')
    expect(act(s, 0, { type: 'kong', tile: YAO })).toBe(true)
    expect(s.pending?.kind).toBe('rob')
    expect(s.players[0].melds[0].kind).toBe('peng')
    act(s, 1, { type: 'respond', action: 'hu' })
    expect(s.result?.winKind).toBe('rob')
    expect(s.players[0].burned).toBe(true)
    expect(s.players[0].hand.includes(YAO)).toBe(false)
    expect(s.players[0].melds[0].kind).toBe('peng')
    expect(
      s.result!.transfers.some((t) => t.to === 0 && (t.account === '杠分' || t.account === '见面礼')),
    ).toBe(false)
  })
  it('手持幺筒有合法接热炮机会却选择过，立即一般包牌', () => {
    const s = table()
    s.players[0] = player('147m 258p 369s 2468s 6p', { afterKong: true, drawn: 14 })
    s.players[1] = player('234m 456789s 6p 45p 1p')
    act(s, 0, { type: 'discard', index: 13 })
    expect(s.pending?.options[1]).toMatchObject({ hu: true, mandatory: true })
    act(s, 1, { type: 'respond', action: 'pass' })
    expect(s.result).toMatchObject({ kind: 'penalty', offender: 1 })
  })
  it('同一弃牌等待全部响应，多赢家分别结算，放炮者坐庄', () => {
    const s = table()
    s.dealer = 3
    s.players[0] = player('147m 258p 369s 2468s 6p')
    s.players[1] = player('234m 456789s 6p 345p', { declaration: 'ready' })
    s.players[2] = player('345m 234678s 6p 456p', { declaration: 'original' })
    act(s, 0, { type: 'discard', index: 13 })
    act(s, 1, { type: 'respond', action: 'hu' })
    expect(s.result).toBeNull()
    act(s, 2, { type: 'respond', action: 'hu' })
    expect(s.result!.winners).toEqual([1, 2])
    expect(s.result!.nextDealer).toBe(0)
    expect(s.players[0].river).toHaveLength(0)
    expect(amount(s.result!, 1, 2, '胡牌分')).toBe(0)
    expect(amount(s.result!, 2, 1, '胡牌分')).toBe(0)
    expect(s.result!.deltas.reduce((a, b) => a + b, 0)).toBe(0)
  })
  it('杠冲不要求打出的幺筒就是补摸牌，不叠加预冲', () => {
    const s = table()
    s.players[0] = player('147m 258p 369s 2468s 1p', { afterKong: true, drawn: 2 })
    act(s, 0, { type: 'discard', index: 13 })
    expect(s.players[0].river[0]).toMatchObject({ tile: YAO, chicken: 100, stage: 'hot' })
    expect(s.firstYaoDiscard).toBe(false)
  })
  it('首巡杠冲被直接碰：冲牌100与碰牌预冲档分别按事件判断', () => {
    const s = table()
    s.players[0] = player('147m 258p 369s 2468s 1p', { afterKong: true, drawn: 2 })
    s.players[1] = player('11p 147m 258p 369s 24s')
    act(s, 0, { type: 'discard', index: 13 })
    expect(s.pending?.discard).toMatchObject({ stage: 'hot', chicken: 100, pre: true })
    act(s, 1, { type: 'respond', action: 'peng' })
    expect(s.players[1].melds[0]).toMatchObject({ pre: true, chicken: 90, responsibility: 30 })
  })
  it('双骰仅应用一次，翻鸡三倍后每份355变710', () => {
    const s = table()
    s.dice = [6, 6]
    s.players[0] = player('234m 567s 123p 66p 78s', {
      river: [30, 20, 15].map((chicken, id) => ({ tile: YAO, chicken, stage: 'normal', id })),
    })
    expect(chickenValue(s.players[0], 1, YAO)).toBe(255)
    const r = settle(s, { kind: 'win' })
    expect(amount(r, 1, 0)).toBe(710)
    expect(amount(r, 1, 0, '见面礼')).toBe(200)
  })
  it('烧鸡只归零鸡分；已有独立责任和杠分按分项保留', () => {
    const s = table()
    s.wall = []
    s.players[0] = player('234567m 66p 78s', {
      burned: true,
      melds: [peng(YAO, { from: 1, chicken: 45, responsibility: 20 })],
    })
    const r = settle(s, { kind: 'win' })
    expect(amount(r, 1, 0, '鸡分')).toBe(0)
    expect(amount(r, 1, 0, '幺筒责任分')).toBe(20)
  })
  it('流局只按S+L及独立杠、礼结算，不套普通胡牌碰杠责任', () => {
    const s = table()
    s.wall = []
    s.players[0] = player('147m 258p 369s 2s', {
      melds: [peng(YAO, { from: 1, chicken: 45, responsibility: 20 })],
    })
    s.players[1] = ready()
    const r = settle(s, { kind: 'draw' })
    expect(amount(r, 0, 1)).toBe(55)
    expect(r.transfers.some((t) => t.account === '幺筒责任分')).toBe(false)
  })
})

describe('幺筒：确定性整局验收', () => {
  it('20个种子四AI跑到终局，始终守恒、不会卡住或丢牌', () => {
    for (let seed = 1; seed <= 20; seed++) {
      let x = seed
      const random = () => {
        x = (Math.imul(x, 1664525) + 1013904223) >>> 0
        return x / 4294967296
      }
      const s = createGame({ random })
      let steps = 0
      while (s.phase !== 'settled' && steps++ < 500) {
        const seat =
          s.phase === 'original'
            ? s.originalDecisions.findIndex((d) => !d)
            : s.phase === 'response'
              ? Number(Object.keys(s.pending!.options).find((i) => !s.pending!.choices[Number(i)]))
              : s.current
        const action = chooseAction(s, seat)
        expect(action, `seed ${seed}, step ${steps}`).not.toBeNull()
        expect(act(s, seat, action!)).toBe(true)
        if ((s as GameState).phase !== 'settled') {
          const physical = [...s.wall, ...s.players.flatMap((p) => ownedTiles(p))]
          expect(physical).toHaveLength(108)
          expect(countsOf(physical)).toEqual(Array(27).fill(4))
        }
      }
      expect(s.phase, `seed ${seed}`).toBe('settled')
      expect(s.result!.deltas.reduce((a, b) => a + b, 0)).toBe(0)
    }
  }, 60_000)
})
