import { describe, expect, it } from 'vitest'
import { paymentEdges, chickenCue, settlementTitle, winningPattern } from './presentation'
import { evaluateHand } from './hands'
import { ledger, settle } from './settlement'
import { player, table } from './auditFixtures'

describe('score flow and concise seat presentation', () => {
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
