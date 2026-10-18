import { describe, expect, it } from 'vitest'
import {
  paymentEdges,
  chickenCue,
  giftAwards,
  giftPayments,
  settlementCue,
  settlementTitle,
  winningPattern,
} from './presentation'
import { evaluateHand } from './hands'
import { ledger, settle } from './settlement'
import { player, table } from './auditFixtures'

describe('score flow and concise seat presentation', () => {
  it.each([false, true])('见面礼飞分使用实际流水，双倍=%s，三家各付而非复制整局净分', (double) => {
    const s = table()
    const book = ledger(double ? [3, 3] : [2, 3])
    for (const from of [0, 1, 3]) book.add(from, 2, '见面礼', 100, '四张')
    book.add(2, 0, '鸡分', 45, '反向鸡分')
    s.result = { ...settle(s, { kind: 'draw' }), transfers: book.transfers }
    const copy = structuredClone(book.transfers)
    expect(giftAwards(book.transfers)).toEqual([{ seat: 2, amount: double ? 600 : 300 }])
    expect(giftPayments(book.transfers).map(({ from, to, amount }) => ({ from, to, amount }))).toEqual(
      [0, 1, 3].map((from) => ({ from, to: 2, amount: double ? 200 : 100 })),
    )
    expect(settlementCue(s, 7)).toMatchObject({
      id: 7,
      burned: [],
      gifts: [{ seat: 2, amount: double ? 600 : 300 }],
    })
    expect(book.transfers).toEqual(copy)
  })
  it.each([300, 600])('包见面礼%s只产生实际责任家的一条付款线', (amount) => {
    const book = ledger(amount === 600 ? [2, 2] : [2, 3])
    book.add(3, 1, '见面礼', 300, '包三份')
    book.add(0, 1, '胡牌分', 45, '其他分项')
    expect(giftPayments(book.transfers)).toEqual([
      { from: 3, to: 1, amount, parts: [{ account: '见面礼', amount }] },
    ])
  })
  it('烧鸡只标记本家，不制造额外付款，包牌不播放烧鸡/见面礼', () => {
    const s = table()
    s.players[3].burned = true
    s.result = settle(s, { kind: 'win' })
    expect(settlementCue(s, 8)).toMatchObject({ burned: [3], gifts: [], payments: [] })
    s.result = settle(s, { kind: 'penalty', offender: 3 })
    expect(settlementCue(s, 9)).toBeNull()
    expect(settlementCue(null, 1)).toBeNull()
  })
  it('同一人烧鸡但仍持有四幺筒时，烧鸡和见面礼同时保留', () => {
    const s = table()
    s.players[1].burned = true
    s.result = settle(s, { kind: 'win' })
    const book = ledger([2, 3])
    for (const from of [0, 2, 3]) book.add(from, 1, '见面礼', 100, '仍归本人四张')
    s.result.transfers = book.transfers
    expect(settlementCue(s, 10)).toMatchObject({ burned: [1], gifts: [{ seat: 1, amount: 300 }] })
    expect(settlementCue(s, 10)?.payments).toHaveLength(3)
  })
  it('nets each pair, retains signed categories, and reproduces each player’s exact balance', () => {
    const { transfers, add } = ledger([2, 2])
    add(0, 1, '胡牌分', 35, '清一色')
    add(1, 0, '鸡分', 20, '首冲')
    add(0, 1, '鸡分', 2, '底鸡')
    add(2, 0, '见面礼', 100, '四张')
    add(2, 3, '鸡分', 10, '本牌')
    add(3, 2, '鸡分', 10, '本牌')
    const edges = paymentEdges(transfers)
    expect(edges).toEqual([
      {
        from: 0,
        to: 1,
        amount: 34,
        parts: [
          { account: '胡牌分', amount: 70 },
          { account: '鸡分', amount: -36 },
        ],
      },
      { from: 2, to: 0, amount: 200, parts: [{ account: '见面礼', amount: 200 }] },
    ])
    for (let seat = 0; seat < 4; seat++) {
      const balance = (list: Array<{ from: number; to: number; amount: number }>) =>
        list.reduce((n, t) => n + (t.to === seat ? t.amount : t.from === seat ? -t.amount : 0), 0)
      expect(balance(edges)).toBe(balance(transfers))
    }
    expect(edges.every((edge) => edge.parts.reduce((n, p) => n + p.amount, 0) === edge.amount)).toBe(true)
  })
  it('chicken cue identifies its actor and tariff; it is absent after penalty', () => {
    const s = table()
    const event = {
      id: 3,
      seat: 2,
      kind: 'discard' as const,
      tile: 9,
      text: '',
      chicken: 100,
      rush: 'hot' as const,
    }
    expect(chickenCue(event, s)).toMatchObject({ seat: 2, points: 100, label: '杠冲', strong: true })
    expect(chickenCue({ ...event, kind: 'ready' }, s)).toBeNull()
    s.result = settle(s, { kind: 'penalty', offender: 2 })
    expect(chickenCue(event, s)).toBeNull()
    expect(settlementTitle(s.result)).toBe('包牌')
  })
  it('announces one real structural pattern, with correct multi-winner and draw labels', () => {
    const v = evaluateHand(player('11112222m 3333s 55p'), { kind: 'ready', tile: 13 })[0]
    expect(winningPattern(v)).toBe('三龙七')
    const r = settle(table(), { kind: 'draw' })
    expect(settlementTitle(r)).toBe('荒庄')
    expect(settlementTitle({ ...r, kind: 'win', winners: [1, 2, 3] })).toBe('一炮3响')
  })
})
