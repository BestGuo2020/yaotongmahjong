import { describe, expect, it } from 'vitest'
import { act } from './engine'
import { evaluateHand } from './hands'
import { settle } from './settlement'
import { player, table, ready, meld } from './auditFixtures'
import { YAO } from './tiles'

describe('朋友实玩规则勘误', () => {
  it('首次摸牌前已经碰过，或已经出过牌，都不能报听', () => {
    for (const extra of [{ melds: [meld(4)] }, { discards: 1 }]) {
      const s = table()
      s.players[0] = extra.melds
        ? player('234567m 66p 78s 9m', { draws: 1, drawn: 8, ...extra })
        : player('234567m 234s 66p 78s 9m', { draws: 1, drawn: 8, ...extra })
      expect(act(s, 0, { type: 'discard', index: s.players[0].hand.length - 1, declare: true })).toBe(false)
      expect(s.players[0].declaration).toBe('none')
    }
  })
  it('三种固定鸡各有全场首冲，本人第一张同种跟冲，后续降为底鸡', () => {
    const s = table()
    for (const [seat, tile, discarded, expected] of [[0, 0, 2, 4], [1, 16, 1, 4], [2, 18, 2, 4],
      [3, 16, 0, 4], [0, 16, 3, 2]]) {
      s.phase = 'discard'; s.current = seat; s.pending = null
      s.players[seat].hand = [tile]; s.players[seat].discards = discarded
      act(s, seat, { type: 'discard', index: 0 })
      expect(s.players[seat].river.at(-1)?.chicken).toBe(expected)
    }
  })
  it('过手只拦截同种鸡：碰八筒可打一万，打八筒可碰幺鸡', () => {
    const s = table()
    s.players[0] = player('147m 258p 369s 2468s 1m', { chickenPeng: [16] })
    expect(act(s, 0, { type: 'discard', index: 13 })).toBe(true)
    expect(s.result?.kind).not.toBe('penalty')
    const q = table()
    q.players[0] = player('147m 258p 369s 2468s 1s')
    q.players[1] = player('11s 147m 258p 369s 24s', { chickenDiscard: [16] })
    act(q, 0, { type: 'discard', index: 13 })
    expect(q.pending?.options[1]).toMatchObject({ peng: true, restrictedPeng: false })
  })
  it('素胡只能门清自摸，无鸡、赖子、翻鸡和杠，且独立计25', () => {
    const p = player('234567m 234s 66p 789s')
    const pure = evaluateHand(p, { kind: 'self', tile: 26 }).find(v => v.patterns[0].name === '素胡')!
    expect(pure.h).toBe(25); expect(pure.patterns).toHaveLength(1)
    expect(evaluateHand(p, { kind: 'self', tile: 26, chicken: 1 }).some(v => v.patterns[0].name === '素胡')).toBe(false)
    const open = player('234m 234s 66p 789s', { melds: [meld(4)] })
    expect(evaluateHand(open, { kind: 'self', tile: 26 }).some(v => v.patterns[0].name === '素胡')).toBe(false)
  })
  it('胡三条时幺筒择八筒替代，计八筒底鸡', () => {
    const s = table()
    // The joker completes 6/7筒 as either 5筒 or 8筒; both win with 三条.
    s.players[0] = player('234m 67p 1p 33p 345s 123s', { drawn: 20 })
    s.wall = []
    const r = settle(s, { kind: 'win', winKind: 'self', winners: [0], tile: 20 })
    expect(r.values[0].resolvedHand).toContain(16)
    expect(r.values[0].naturalYaos).toBe(0)
    expect(r.transfers.find(t => t.account === '鸡分' && t.to === 0)?.reason).toContain('八筒')
  })
  it.each([
    ['self', false, '双龙七', 2, 315],
    ['discard', false, '龙七对', 0, 135],
    ['self', true, '龙七对', 0, 405],
    ['discard', true, '龙七对', 0, 255],
  ] as const)('%s 翻九筒=%s：自动按最终收益采用%s', (kind, flipped, pattern, wildcards, income) => {
    const s = table()
    s.players[0] = player('2222m 33p 44s 55s 66p 11p', { declaration: 'ready', drawn: YAO })
    s.wall = flipped ? [17] : []
    if (kind === 'self') expect(act(s, 0, { type: 'hu' })).toBe(true)
    else {
      s.players[0].hand.pop()
      s.players[1].hand.push(YAO)
      s.current = 1
      act(s, 1, { type: 'discard', index: 13 })
      expect(act(s, 0, { type: 'respond', action: 'hu' })).toBe(true)
    }
    const r = s.result!
    expect(r.values[0].patterns).toContainEqual({ name: pattern, points: pattern === '双龙七' ? 80 : 40 })
    expect(r.values[0].wildcards).toBe(wildcards)
    // Isolate the variable Hu/chicken receipts; winning-tile responsibility is accounted separately.
    expect(r.transfers.filter(t => t.to === 0 && ['胡牌分', '鸡分'].includes(t.account))
      .reduce((sum, t) => sum + t.amount, 0)).toBe(income)
    expect(r.chicken).toBe(flipped ? YAO : null)
    expect(r.deltas.reduce((a, b) => a + b, 0)).toBe(0)
  })
})
