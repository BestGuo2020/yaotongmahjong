import { describe, expect, it } from 'vitest'
import { act, continueGame, createGame, kongOptions } from './engine'
import { evaluateHand, huOpportunity, passAllows, shapePoints } from './hands'
import { chickenBreakdown, chickenValue, nextDealer, readyInfo, settle } from './settlement'
import { breakWall, countsOf, shuffledWall, YAO } from './tiles'
import { meld, player, ready, table, tiles, unready } from './auditFixtures'
import type { Settlement, WinKind } from './types'
const amount = (s: Settlement, from: number, to: number, account?: string) =>
  s.transfers
    .filter((t) => t.from === from && t.to === to && (!account || t.account === account))
    .reduce((n, t) => n + t.amount, 0)

describe('鸡分账单明细', () => {
  it('单份翻牌鸡、底鸡和未听赔出的冲鸡直接显示分数', () => {
    const s = table()
    s.players[0] = player('234567m 567s 22p 78p')
    s.players[1].river = [{ tile: 0, chicken: 4, stage: 'normal', id: 1 }]
    s.wall = [3]
    const transfers = settle(s, { kind: 'win' }).transfers.filter((t) => t.account === '鸡分')
    expect(transfers.filter((t) => t.to === 0 && t.reason === '五万·翻牌鸡 1分；八筒·底鸡 2分'))
      .toHaveLength(3)
    expect(transfers.find((t) => t.reason.startsWith('未听赔露出鸡：'))).toMatchObject({
      from: 1, to: 0, base: 4, amount: 4, reason: '未听赔露出鸡：一万·冲鸡 4分',
    })
  })

  it.each([
    { hand: '234567m 567s 88p 67s', wall: [], reason: '八筒·底鸡 2×2=4分', base: 4 },
    { hand: '234567m 567s 22p 78p', wall: [15], reason: '八筒·底鸡 2×3=6分', base: 6 },
    { hand: '234567m 567s 88p 67s', wall: [15], reason: '八筒·底鸡 2×2×3=12分', base: 12 },
  ])('保留有意义的数量、翻鸡倍数：$reason', ({ hand, wall, reason, base }) => {
    const s = table()
    s.players[0] = player(hand)
    s.wall = wall
    s.dice = [3, 3]
    const incoming = settle(s, { kind: 'win' }).transfers
      .filter((t) => t.to === 0 && t.account === '鸡分')
    expect(incoming).toHaveLength(3)
    incoming.forEach((t) => expect(t).toMatchObject({ reason, base, multiplier: 2, amount: base * 2 }))
  })
})

describe('v1.0 clause audit — physical flow and eligibility', () => {
  it('§2.1 all 36 dice combinations and four dealers select sum-relative side and minimum reserved stacks', () => {
    const wall = shuffledWall(() => 0.3)
    for (let dealer = 0; dealer < 4; dealer++)
      for (let a = 1; a <= 6; a++)
        for (let b = 1; b <= 6; b++) {
          const broken = breakWall(wall, [a, b], dealer)
          expect(broken.side).toBe((dealer + ((a + b - 1) % 4)) % 4)
          expect(broken.reserved).toBe(Math.min(a, b))
          expect(countsOf(broken.wall)).toEqual(Array(27).fill(4))
        }
  })
  it('§3.1 jokers cannot substitute for missing matching tiles in a peng or kong', () => {
    const s = table()
    s.players[0] = player('147m 258p 369s 2468s 5m')
    s.players[1] = player('5m 1p 147m 258p 369s 24s')
    act(s, 0, { type: 'discard', index: 13 })
    expect(s.pending?.options[1]?.peng ?? false).toBe(false)
    expect(kongOptions(s, 1)).toEqual([])
  })
  it('§5.1 every seat can 原报 before first draw; declaration survives and locks the original thirteen', () => {
    for (let seat = 0; seat < 4; seat++) {
      const s = createGame({ dealer: 0, dice: [1, 2] })
      s.players[seat] = { ...ready(), draws: 0 }
      expect(act(s, seat, { type: 'original', declare: true })).toBe(true)
      expect(s.players[seat].declaration).toBe('original')
      expect(s.players[seat].draws).toBe(0)
      expect(act(s, seat, { type: 'original', declare: true })).toBe(false)
    }
  })
  it('§2.3 kong draws actual tail, clears pass restrictions, counts as an actual draw, and cannot start on empty wall', () => {
    const s = table()
    s.players[0] = player('2222m 147s 258p 369s 5p', { drawn: 1, passedHu: 45, passedShape: 40 })
    expect(act(s, 0, { type: 'kong', tile: 1 })).toBe(true)
    expect(s.players[0]).toMatchObject({
      drawn: 23,
      draws: 3,
      passedHu: null,
      passedShape: null,
      afterKong: true,
    })
    expect(s.wall).toEqual([17, 20])
    s.wall = []
    expect(kongOptions(s, 0)).toEqual([])
  })
})

describe('v1.0 clause audit — pass and mandatory decisions', () => {
  it.each<WinKind>(['hot', 'rob'])(
    '§10.1 same 清一色 becomes H55 only from %s; this is not a larger shape',
    (kind) => {
      const p = player('234567789m 22m 345m', { passedHu: 35, passedShape: 30 })
      expect(huOpportunity(p, { kind, tile: 4 })).toMatchObject({ hu: true, restricted: true, h: 55 })
      expect(evaluateHand(p, { kind, tile: 4 }).every((v) => !passAllows(p, v.h, v))).toBe(true)
    },
  )
  it('§10.1 structural improvement at H45 is allowed, equal structure / equal H is not', () => {
    const p = player('222333444555m 66m', { passedHu: 35, passedShape: 30 })
    const v = evaluateHand(p, { kind: 'discard', tile: 5 })[0]
    expect(v.h).toBe(45)
    expect(shapePoints(v)).toBe(40)
    expect(passAllows(p, v.h, v)).toBe(true)
    expect(passAllows({ ...p, passedHu: 45 }, v.h, v)).toBe(false)
  })
  it('§10.2 blocked hot opportunity keeps 胡 button and no mandatory punishment for passing', () => {
    const s = table()
    s.players[0] = player('147m 258p 369s 2468s 5m', { afterKong: true, declaration: 'ready', drawn: 4 })
    s.players[1] = player('234567789m 22m 34m', { passedHu: 35, passedShape: 30 })
    act(s, 0, { type: 'discard', index: 13 })
    expect(s.pending?.options[1]).toMatchObject({ hu: true, restrictedHu: true, mandatory: false })
    expect(act(s, 1, { type: 'respond', action: 'pass' })).toBe(true)
    expect(s.result?.kind).not.toBe('penalty')
  })
  it('§10.1 passing stores the actual structural maximum, a peng does not reset it', () => {
    const s = table()
    s.players[0] = player('147m 258p 369s 2468s 6m')
    s.players[1] = player('234567789m 22m 66m')
    act(s, 0, { type: 'discard', index: 13 })
    expect(s.pending?.options[1]?.hu).toBe(true)
    act(s, 1, { type: 'respond', action: 'peng' })
    expect(s.players[1]).toMatchObject({ passedHu: 35, passedShape: 30, drawn: null })
  })
})

describe('v1.0 clause audit — explicit tariffs and payer matrices', () => {
  it('§4.3 chooses total proceeds instead of largest H: natural three Yaos outweigh soft 清一色', () => {
    const s = table()
    s.wall = []
    s.players[0] = player('123456789m 11m 111p', { drawn: YAO })
    expect(
      evaluateHand(s.players[0], { kind: 'self', tile: YAO }).some((v) => v.h === 25 && v.naturalYaos === 0),
    ).toBe(true)
    const r = settle(s, { kind: 'win', winners: [0], winKind: 'self', tile: YAO })
    expect(r.values[0]).toMatchObject({ h: 15, naturalYaos: 3, wildcards: 0 })
    expect(amount(r, 1, 0, '鸡分')).toBe(36)
  })
  it('§7.1 fixed chicken rush counters are per tile; first-peng is still shared', () => {
    const s = table()
    s.players[0] = player('147m 258p 369s 2468s 1s', { discards: 1 })
    s.players[1] = player('11s 147m 258p 369s 24s')
    act(s, 0, { type: 'discard', index: 13 })
    expect(s.players[0].river[0].chicken).toBe(4)
    act(s, 1, { type: 'respond', action: 'peng' })
    expect(s.players[1].melds[0].chicken).toBe(8)
    expect(s.players[0].river).toHaveLength(0)
    // Continue a later turn: first-peng remains consumed when a different fixed chicken is claimed.
    s.phase = 'discard'
    s.current = 0
    s.players[0] = player('147m 258p 369s 2468s 8p', { discards: 2 })
    s.players[2] = player('88p 147m 258p 369s 24s')
    act(s, 0, { type: 'discard', index: 13 })
    expect(s.players[0].river[0].chicken).toBe(4)
    act(s, 2, { type: 'respond', action: 'peng' })
    expect(s.players[2].melds[0].chicken).toBe(6)
  })
  it.each([
    ['open', false, 60, 20, 100, 60],
    ['open', true, 120, 30, 170, 120],
    ['turn', false, 60, 0, 80, 80],
    ['stored', false, 60, 0, 60, 60],
    ['added', false, 60, 20, 100, 80],
    ['added', true, 120, 30, 170, 140],
  ] as const)(
    '§8.2–8.3 %s pre=%s has correct chicken + responsibility + kong payer',
    (kind, pre, chicken, responsibility, responsible, other) => {
      const s = table()
      s.wall = []
      s.players[0] = player('234567m 66p 78s', {
        melds: [meld(YAO, { kind, pre, chicken, responsibility, from: 1 })],
      })
      const r = settle(s, { kind: 'win' })
      expect(amount(r, 1, 0) - amount(r, 1, 0, '见面礼')).toBe(responsible)
      expect(amount(r, 2, 0) - amount(r, 2, 0, '见面礼')).toBe(other)
      expect(amount(r, 1, 0, '见面礼')).toBe(100)
    },
  )
  it('§8.3 confirmed: actual pre-peng added in normal stage retains chicken120 + responsibility30 once', () => {
    const s = table()
    s.players.forEach((p) => {
      p.discards = 2
    })
    s.players[0] = player('147m 258p 369s 2s 1p', {
      drawn: YAO,
      discards: 2,
      melds: [meld(YAO, { pre: true, chicken: 90, responsibility: 30, from: 1 })],
    })
    expect(act(s, 0, { type: 'kong', tile: YAO })).toBe(true)
    expect(s.players[0].melds).toEqual([
      meld(YAO, { kind: 'added', pre: true, chicken: 120, responsibility: 30, from: 1 }),
    ])
  })
  it.each([false, true])(
    '§9.3 pre=%s: tripled chicken and responsibility; ordinary kong/gift are not tripled',
    (pre) => {
      const s = table()
      s.wall = [17]
      s.players[0] = player('234567m 66p 78s', {
        melds: [
          meld(YAO, { kind: 'open', pre, chicken: pre ? 120 : 60, responsibility: pre ? 30 : 20, from: 1 }),
        ],
      })
      const r = settle(s, { kind: 'win' })
      expect(amount(r, 1, 0, '鸡分')).toBe((pre ? 120 + 10 : 60 + 10) * 3)
      expect(amount(r, 1, 0, '幺筒责任分')).toBe((pre ? 30 : 20) * 3)
      expect(amount(r, 1, 0, '杠分')).toBe(20)
      expect(amount(r, 2, 0, '杠分')).toBe(0)
      expect(amount(r, 1, 0, '见面礼')).toBe(100)
    },
  )
  it('§6.2 unready pays exposed20 to ready with0,22 to ready with2 and0 to unready', () => {
    const s = table()
    s.wall = []
    s.players[0].river = [{ tile: YAO, chicken: 20, stage: 'first', id: 1 }]
    s.players[1] = ready()
    s.players[2] = { ...ready(), river: [{ tile: 0, chicken: 2, stage: 'normal', id: 2 }] }
    const r = settle(s, { kind: 'win' })
    expect([1, 2, 3].map((seat) => amount(r, 0, seat))).toEqual([20, 22, 0])
  })
  it('§5.2 third party discard never kills an unrelated reported player', () => {
    const s = table()
    s.wall = []
    s.players[1].declaration = 'original'
    s.players[2] = player('234567m 234s 66p 789s', { declaration: 'ready' })
    const r = settle(s, { kind: 'win', winners: [2], source: 0, winKind: 'discard', tile: 26 })
    expect(r.transfers.filter((t) => t.account === '杀报加分')).toEqual([])
    expect(amount(r, 0, 2, '胡牌分')).toBe(35)
  })
  it('§9.2 auditable chicken terms total255 and do not borrow a hidden fourth tile for exposed penalty', () => {
    const p = player('1p', {
      river: [30, 20, 15].map((chicken, id) => ({ tile: YAO, chicken, stage: 'normal', id })),
    })
    const terms = chickenBreakdown(p, 1, YAO)
    expect(terms.reduce((sum, t) => sum + t.amount, 0)).toBe(255)
    expect(terms.find((t) => t.label.includes('额外'))?.amount).toBe(30)
    expect(chickenBreakdown(p, 0, YAO, true).some((t) => t.label.includes('额外'))).toBe(false)
    expect(chickenValue(p, 0, YAO, true)).toBe(195)
  })
  it.each([0, 18, 16])('§7/9 each fixed chicken kong %s has36 flipped points, not30 or42', (tile) => {
    const p = player('', { melds: [meld(tile, { kind: 'turn', chicken: 10 })] })
    expect(chickenValue(p, 0, tile)).toBe(36)
  })
  it.each([
    ['234567m 234s 6p 78s 1p', 5],
    ['234567m 234s 66p 78s', 10],
    ['234567789m 2m 45m 1p', 20],
    ['234567789m 22m 45m', 30],
  ])('§11 ready price %s is %s without ordinary base5', (hand, price) =>
    expect(readyInfo(player(hand)).price).toBe(price),
  )
  it('§11 all-ready and all-unready draw contain no chicken / hu / kill / ready compensation', () => {
    for (const factory of [ready, unready]) {
      const s = table()
      s.wall = []
      s.players = Array.from({ length: 4 }, factory)
      s.players.forEach((p) => {
        p.river = [{ tile: 0, chicken: 4, stage: 'normal', id: 1 }]
      })
      expect(settle(s, { kind: 'draw' }).transfers).toEqual([])
    }
  })
  it('§9.4 all account amounts scale exactly once with equal dice, including all ending types', () => {
    for (const kind of ['win', 'penalty', 'draw'] as const) {
      const s = table()
      s.wall = []
      s.players[0] = { ...ready(), melds: [] }
      s.players[1].melds = [meld(YAO, { kind: 'turn', chicken: 60 })]
      const base = settle(structuredClone(s), { kind, offender: 3 })
      s.dice = [4, 4]
      const doubled = settle(s, { kind, offender: 3 })
      expect(doubled.deltas).toEqual(base.deltas.map((n) => n * 2))
      expect(doubled.transfers.every((t) => t.amount === t.base * 2)).toBe(true)
    }
  })
  it('§12 every draw ready-mask follows sole-unready dealer rule; lengths count dealer changes', () => {
    for (let mask = 0; mask < 16; mask++) {
      const s = table()
      s.dealer = 2
      const ready = [0, 1, 2, 3].map((seat) => Boolean(mask & (1 << seat)))
      const missing = ready.flatMap((r, seat) => (r ? [] : [seat]))
      expect(nextDealer(s, { kind: 'draw', winners: [], source: null, ready })).toBe(
        missing.length === 1 ? missing[0] : 2,
      )
    }
    for (const length of [4, 8, 16] as const) {
      const s = table()
      s.matchLength = length
      s.dealerRound = length
      s.result = settle(s, { kind: 'penalty', offender: 1 })
      expect(s.result.finished).toBe(false)
      expect(continueGame(s).dealerRound).toBe(length)
    }
  })
})
