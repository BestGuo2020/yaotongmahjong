import { describe, expect, it } from 'vitest'
import { act, selfOptions } from './engine'
import { evaluateHand, shapePoints } from './hands'
import { readyInfo } from './settlement'
import { player, table, meld } from './auditFixtures'
import { winningPattern, winPatternCue } from './presentation'
import { handScoreFormula } from '../../../components/yaotong/huScoreBreakdown'
import type { GameState, KongKind, WinKind } from './types'

function passResponses(s: GameState) {
  while (s.phase === 'response' && s.pending) {
    const seat = Object.keys(s.pending.options).map(Number).find(i => !s.pending!.choices[i])!
    expect(act(s, seat, { type: 'respond', action: 'pass' })).toBe(true)
  }
}

function kongDraw(kind: KongKind, double = false) {
  const s = table()
  s.dice = double ? [3, 3] : [2, 3]
  s.wall = [8, 26]
  const wait = '234m 234s 66p 78s'
  if (kind === 'open') {
    s.players[0] = player(`555m ${wait}`)
    s.current = 1
    s.players[1].hand.push(4)
    act(s, 1, { type: 'discard', index: 13 })
    expect(act(s, 0, { type: 'respond', action: 'kong' })).toBe(true)
  } else {
    s.players[0] = kind === 'added'
      ? player(`5m ${wait}`, { drawn: 4, melds: [meld(4, { from: 1 })] })
      : player(`5555m ${wait}`, { drawn: kind === 'turn' ? 4 : 25 })
    expect(act(s, 0, { type: 'kong', tile: 4 })).toBe(true)
  }
  passResponses(s)
  expect(s.players[0].melds[0].kind).toBe(kind)
  expect(s.players[0].drawn).toBe(26)
  return s
}

describe('杠上开花牌型加20分，基础5另计', () => {
  it.each(['open', 'turn', 'stored', 'added'] as const)('%s杠补摸自摸计杠上开花，杠分独立保留', kind => {
    const s = kongDraw(kind)
    expect(selfOptions(s, 0).h).toBe(35)
    expect(act(s, 0, { type: 'hu' })).toBe(true)
    const value = s.result!.values[0]
    expect(value.patterns).toContainEqual({ name: '杠上开花', points: 20 })
    expect(handScoreFormula(value)).toBe('基础 5 + 硬胡 10 + 杠上开花 20')
    expect(s.result!.transfers.filter(t => t.account === '胡牌分').map(t => t.amount)).toEqual([35, 35, 35])
    expect(s.result!.transfers.filter(t => t.account === '杠分').map(t => t.amount))
      .toEqual(kind === 'stored' ? [] : kind === 'open' ? [5] : [5, 5, 5])
    expect(s.result!.deltas.reduce((a, b) => a + b)).toBe(0)
    expect(winningPattern(value)).toBe('杠上开花')
    expect(winPatternCue(s.result, { id: 1, duration: 1000, reducedMotion: false })?.winners)
      .toEqual([{ seat: 0, label: '杠上开花', tier: 1 }])
    expect(shapePoints(value)).toBe(10)
  })

  it('杠上开花叠加清一色、硬胡，骰子双倍对最终付款只乘一次', () => {
    const s = kongDraw('turn', true)
    s.players[0].hand = player('234678m 99m 123m').hand
    s.players[0].drawn = 2
    expect(act(s, 0, { type: 'hu' })).toBe(true)
    expect(s.result!.values[0].h).toBe(55)
    expect(s.result!.transfers.filter(t => t.account === '胡牌分').map(t => t.amount)).toEqual([110, 110, 110])
    expect(s.result!.transfers.filter(t => t.account === '杠分').map(t => t.amount)).toEqual([10, 10, 10])
  })

  it('使用赖子的杠上开花是基础5＋牌型20，不误计硬胡', () => {
    const s = kongDraw('turn')
    s.players[0].hand = player('234m 234s 66p 78s 1p').hand
    s.players[0].drawn = 9
    expect(act(s, 0, { type: 'hu' })).toBe(true)
    expect(s.result!.values[0].h).toBe(25)
    expect(s.result!.values[0].patterns).toEqual([{ name: '杠上开花', points: 20 }])
  })

  it.each(['discard', 'rob', 'hot', 'ready'] as WinKind[])('%s场景不套用补摸自摸加分', kind => {
    const s = kongDraw('turn')
    const values = evaluateHand(s.players[0], { kind, tile: 26 })
    expect(values.length).toBeGreaterThan(0)
    expect(values.every(v => v.patterns.every(p => p.name !== '杠上开花'))).toBe(true)
    expect(readyInfo(s.players[0]).price).toBe(10)
  })

  it('补摸后出牌就结束杠上开花时点，后来普通自摸不加20', () => {
    const s = kongDraw('turn')
    const p = s.players[0]
    act(s, 0, { type: 'discard', index: p.hand.indexOf(26) })
    expect(p.afterKong).toBe(false)
    p.hand.push(26); p.drawn = 26; p.passedHu = null
    s.current = 0; s.phase = 'discard'; s.pending = null
    expect(selfOptions(s, 0).h).toBe(15)
  })

  it('多副杠后的补摸自摸仍只记一次杠上开花', () => {
    const p = player('234m 66p 789s', { drawn: 26, afterKong: true,
      melds: [meld(4, { kind: 'turn' }), meld(12, { kind: 'added' })] })
    const value = evaluateHand(p, { kind: 'self', tile: 26 })[0]
    expect(value.h).toBe(35)
    expect(value.patterns.filter(p => p.name === '杠上开花')).toEqual([{ name: '杠上开花', points: 20 }])
  })
})
