import { describe, expect, it } from 'vitest'
import { chickenBreakdown, chickenValue, settle } from './settlement'
import { meld, player, ready, table, unready } from './auditFixtures'
import { YAO } from './tiles'
import type { KongKind } from './types'

describe('第3点确认：未听反赔杠分，露出固定鸡和幺筒赔原档', () => {
  const cases = (['open', 'turn', 'added', 'stored'] as KongKind[]).flatMap(kind =>
    [false, true].flatMap(ownerReady => [false, true].flatMap(otherReady =>
      [4, YAO].map(tile => ({ kind, ownerReady, otherReady, tile })),
    )),
  )
  it.each(cases)('$kind tile=$tile 杠家已听=$ownerReady 对家已听=$otherReady：按对应关系收赔',
    ({ kind, ownerReady, otherReady, tile }) => {
      for (const ending of ['win', 'draw'] as const) {
        const s = table(); s.wall = []
        s.players[0] = player(ownerReady ? '234567s 66p 78m' : '147m 257p 369s 2s', {
          melds: [meld(tile, { kind, from: 1, chicken: tile === YAO ? 60 : 0 })],
        })
        s.players[1] = otherReady ? ready() : unready()
        s.players[3] = player('234567m 234s 66p 789s', { drawn: 26 })
        const r = settle(s, ending === 'win'
          ? { kind: 'win', winKind: 'self', winners: [3], tile: 26 } : { kind: 'draw' })
        expect(r.ready.slice(0, 2)).toEqual([ownerReady, otherReady])
        const pair = r.transfers.filter(t => t.account === '杠分' &&
          ((t.from === 0 && t.to === 1) || (t.from === 1 && t.to === 0)))
        if (kind === 'stored' || (!ownerReady && !otherReady)) expect(pair).toEqual([])
        else expect(pair).toEqual([expect.objectContaining({
          from: ownerReady ? 1 : 0, to: ownerReady ? 0 : 1, amount: tile === YAO ? 20 : 5,
          reason: `${ownerReady ? '' : '未听反赔：'}${tile === YAO ? '一筒' : '五万'}${({ open: '明杠', turn: '转弯杠', added: '补杠' } as const)[kind]}`,
        })])
        if (kind === 'open') expect(r.transfers.filter(t => t.account === '杠分')
          .every(t => (t.from === 0 && t.to === 1) || (t.from === 1 && t.to === 0))).toBe(true)
        expect(r.deltas.reduce((a, b) => a + b, 0)).toBe(0)
      }
    })

  it.each([4, 16, YAO])('翻鸡%s不增加未听赔鸡：保留牌河与碰杠原档，隐藏牌不赔', flipped => {
    const p = player('11p', {
      river: [
        { tile: YAO, chicken: 30, stage: 'pre', id: 1 },
        { tile: 0, chicken: 4, stage: 'normal', id: 2 },
        { tile: 4, chicken: 0, stage: 'normal', id: 3 },
      ],
      melds: [meld(16, { kind: 'turn', chicken: 10 }), meld(4)],
    })
    expect(chickenValue(p, 2, flipped, true)).toBe(44)
    const terms = chickenBreakdown(p, 2, flipped, true)
    expect(terms.map(t => t.unit)).toEqual([30, 4, 10])
    expect(terms.every(t => t.multiplier === 1 && !/翻鸡|额外|本牌/.test(t.label))).toBe(true)
    // A ready player's flipped income still includes all the original flip multipliers and fifth share.
    expect(chickenValue(p, 2, flipped)).toBe(flipped === 4 ? 69 : flipped === 16 ? 90 : 164)
  })

  it.each([0, 16, 18, YAO])('四张鸡%s不增加未听赔鸡的第五份，碰杠仍赔原档', tile => {
    const p = player('', { melds: [meld(tile, { kind: 'stored', chicken: tile === YAO ? 60 : 10 })] })
    expect(chickenValue(p, 0, tile, true)).toBe(tile === YAO ? 60 : 10)
    expect(chickenValue(p, 0, tile)).toBe(tile === YAO ? 210 : 36)
    p.melds = []; p.river = [0, 1, 2, 3].map(id => ({ tile, chicken: tile === YAO ? 15 : 4, stage: 'later', id }))
    expect(chickenValue(p, 0, tile, true)).toBe(tile === YAO ? 60 : 16)
  })

  it.each(['win', 'draw'] as const)('%s：实际分账含碰杠鸡原价与反赔杠分，只向已听者赔', ending => {
    const s = table()
    s.wall = ending === 'win' ? [3] : [] // Flip 五万, which has no pre-existing tariff.
    s.players[0] = player('147m 257p 369s 2s', {
      melds: [meld(16, { kind: 'turn', chicken: 10 })],
      river: [{ tile: YAO, chicken: 30, stage: 'pre', id: 1 }, { tile: 4, chicken: 0, stage: 'normal', id: 2 }],
    })
    s.players[1] = ready()
    s.players[3] = player('234567m 234s 66p 789s', { drawn: 26 })
    const r = settle(s, ending === 'win'
      ? { kind: 'win', winKind: 'self', winners: [3], tile: 26 } : { kind: 'draw' })
    expect(r.transfers.filter(t => t.from === 0 && t.to === 1 && t.account === '鸡分' && t.reason.startsWith('未听赔露出鸡')))
      .toEqual([expect.objectContaining({ base: 40, amount: 40 })])
    // This exemption covers our own compensation, not the ready recipient's normal flipped income.
    if (ending === 'win') expect(r.transfers).toContainEqual(expect.objectContaining({
      from: 0, to: 1, account: '鸡分', base: 1, reason: '五万·翻牌鸡 1分',
    }))
    expect(r.transfers.filter(t => t.from === 0 && t.to === 1 && t.account === '杠分'))
      .toEqual([expect.objectContaining({ base: 5, amount: 5, reason: '未听反赔：八筒转弯杠' })])
    expect(r.transfers.some(t => t.from === 0 && t.to === 2)).toBe(false)
    expect(r.deltas.reduce((a, b) => a + b, 0)).toBe(0)
  })

  it('骰子同点只翻倍一次；包牌仍不另结杠分与鸡分', () => {
    const s = table(); s.wall = []; s.players[1] = ready()
    s.players[0] = player('147m 257p 369s 2s', { melds: [meld(16, { kind: 'turn', chicken: 10 })] })
    const base = settle(structuredClone(s), { kind: 'draw' })
    s.dice = [4, 4]
    const doubled = settle(s, { kind: 'draw' })
    expect(doubled.deltas).toEqual(base.deltas.map(n => n * 2))
    expect(doubled.transfers.find(t => t.account === '杠分'))
      .toMatchObject({ from: 0, to: 1, base: 5, amount: 10, multiplier: 2 })
    expect(settle(s, { kind: 'penalty', offender: 0 }).transfers.every(t => t.account === '一般包牌赔付')).toBe(true)
  })
})
