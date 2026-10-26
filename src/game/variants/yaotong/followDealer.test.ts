import { describe, expect, it } from 'vitest'
import { act, continueGame } from './engine'
import { completeFollowDealer } from './followDealer'
import { chickenValue, settle } from './settlement'
import { huOpportunity } from './hands'
import { player, table, tiles } from './auditFixtures'

function firstCircle(tile: number, dealer = 0) {
  const s = table()
  s.dealer = dealer
  s.current = (dealer + 3) % 4
  s.players.forEach((p, seat) => {
    const offset = (seat - dealer + 4) % 4
    p.discards = offset < 3 ? 1 : 0
    p.river = offset < 3 ? [{ tile, chicken: tile === 9 ? 30 : 4, stage: 'pre', id: offset + 1 }] : []
    p.hand = tiles('147m 258p 369s 2468s').filter(t => t !== tile)
  })
  s.players[s.current].hand.push(tile)
  s.serial = 3
  s.wall = []
  return s
}

describe('首圈跟庄', () => {
  it.each([[13, 5], [18, 15], [0, 15], [16, 15], [9, 170]])('四家跟打 %s，庄家各赔 %s', (tile, base) => {
    const s = firstCircle(tile, 2)
    const p = s.players[s.current]
    expect(act(s, s.current, { type: 'discard', index: p.hand.lastIndexOf(tile) })).toBe(true)
    while (s.pending) {
      const seat = Object.keys(s.pending.options).map(Number).find(i => !s.pending!.choices[i])!
      expect(act(s, seat, { type: 'respond', action: 'pass' })).toBe(true)
    }
    expect(s.players[2].followDealer).toBe(true)
    expect(s.players.every(p => p.river[0].followedDealer && p.river[0].chicken === 0)).toBe(true)
    expect(s.result!.transfers.filter(t => t.account === '跟庄赔付')).toEqual(
      [0, 1, 3].map(to => expect.objectContaining({ from: 2, to, base, amount: base })))
    expect(s.result!.deltas.reduce((a, b) => a + b)).toBe(0)
    expect(completeFollowDealer(s)).toBeNull()
    const next = continueGame(s)
    expect(next.players.every(p => !p.followDealer && p.river.length === 0)).toBe(true)
  })

  it.each(['different', 'second', 'meld', 'claimed', 'order'])('不将 %s 误判为跟庄', reason => {
    const s = firstCircle(13)
    s.players[3].discards = 1
    s.players[3].river = [{ tile: 13, chicken: 0, stage: 'normal', id: 4 }]
    if (reason === 'different') s.players[1].river[0].tile = 14
    if (reason === 'second') s.players[1].discards = 2
    if (reason === 'meld') s.players[1].melds = [{ tile: 2, kind: 'turn', pre: true, chicken: 0, responsibility: 0 }]
    if (reason === 'claimed') s.players[1].river = []
    if (reason === 'order') s.players[1].river[0].id = 5
    expect(completeFollowDealer(s)).toBeNull()
  })

  it('胡牌通行证只放开普通炮资格，不增加牌型分且仍检查过手', () => {
    const p = player('234567m 234s 66p 789s')
    const context = { kind: 'discard' as const, tile: 26 }
    expect(huOpportunity(p, context).hu).toBe(false)
    p.followDealer = true
    const option = huOpportunity(p, context)
    expect(option.hu).toBe(true)
    expect(option.h).toBe(15)
    p.passedHu = option.h
    p.passedShape = option.shapePoints
    expect(huOpportunity(p, context).restricted).toBe(true)
  })

  it.each([false, true])('第四张被胡走不跟庄（延长胡口=%s）', deferred => {
    const s = firstCircle(13)
    s.wall = [7, 11]
    s.players[1].hand = tiles('234567m 234s 66p 34p')
    s.players[1].declaration = 'ready'
    expect(act(s, 3, { type: 'discard', index: s.players[3].hand.lastIndexOf(13) })).toBe(true)
    expect(s.pending!.options[1].hu).toBe(true)
    expect(act(s, 1, { type: 'respond', action: deferred ? 'pass' : 'hu', deferHu: deferred })).toBe(true)
    while (s.pending && s.phase === 'response') {
      const seat = Object.keys(s.pending.options).map(Number).find(i => !s.pending!.choices[i])!
      act(s, seat, { type: 'respond', action: 'pass' })
    }
    if (deferred) {
      expect(s.players[0].followDealer).toBe(true)
      expect(act(s, 1, { type: 'declareHu' })).toBe(true)
    }
    expect(s.result?.kind).toBe('win')
    expect(s.players[0].followDealer).not.toBe(true)
    expect(s.result?.transfers.some(t => t.account === '跟庄赔付')).toBe(false)
  })

  it('正常胡牌终局只收一次跟庄，翻中跟牌也不重新计分', () => {
    const s = firstCircle(13)
    s.players[3].discards = 1
    s.players[3].river = [{ tile: 13, chicken: 0, stage: 'normal', id: 4 }]
    completeFollowDealer(s)
    s.players.forEach(p => { p.hand = [] })
    s.players[0].hand = tiles('234567m 234s 66p 789s')
    s.players[0].draws = 2
    s.wall = [12]
    const result = settle(s, { kind: 'win', winners: [0], source: 1, winKind: 'discard', tile: 26 })
    expect(result.chicken).toBe(13)
    expect(result.transfers.filter(t => t.account === '跟庄赔付')).toHaveLength(3)
    expect(result.transfers.some(t => t.account === '鸡分')).toBe(false)
    expect(result.deltas.reduce((a, b) => a + b)).toBe(0)
  })

  it.each([13, 18, 9])('跟牌 %s 不再收赔鸡分或翻鸡分，独立赔付保留并乘骰子倍率', tile => {
    const s = firstCircle(tile)
    s.players[3].discards = 1
    s.players[3].river = [{ tile, chicken: 30, stage: 'pre', id: 4 }]
    expect(completeFollowDealer(s)).toBe(tile)
    for (const p of s.players) {
      p.hand = []
      expect(chickenValue(p, 0, tile)).toBe(0)
      expect(chickenValue(p, 0, tile, true)).toBe(0)
    }
    s.dice = [3, 3]
    const result = settle(s, { kind: 'penalty', offender: 1 })
    expect(result.transfers.filter(t => t.account === '跟庄赔付').map(t => t.amount))
      .toEqual(Array(3).fill((tile === 9 ? 170 : tile === 18 ? 15 : 5) * 2))
    expect(result.transfers.some(t => t.account === '鸡分')).toBe(false)
  })
})
