import { describe, expect, it } from 'vitest'
import { act, selfOptions } from './engine'
import { evaluateHand, isUntouchedFirstDraw, shapePoints } from './hands'
import { player, table, meld } from './auditFixtures'
import { winningPattern, winPatternCue } from './presentation'
import { huChoiceKey, winChoices } from './winChoices'
import type { Player } from './types'

const untouched = () => player('234567m 234s 66p 789s', { draws: 1, drawn: 26 })

describe('天胡、地胡共用报听的首次摸牌动作限制', () => {
  it.each([0, 1, 2, 3])('座位%s按实际庄家区分命名，选择、结算和字效一致，均加40', seat => {
    const s = table()
    s.dealer = 2; s.current = seat; s.players[seat] = untouched(); s.wall = []
    const name = seat === 2 ? '天胡' : '地胡'
    expect(selfOptions(s, seat).h).toBe(55)
    const value = winChoices(s, seat).find(v => v.patterns.some(p => p.name === name))!
    expect(value.patterns).toContainEqual({ name, points: 40 })
    expect(shapePoints(value)).toBe(10) // Opening bonus is not a larger structural hand for 过手.
    expect(act(s, seat, { type: 'hu', huChoice: huChoiceKey(value) })).toBe(true)
    expect(s.result!.values[seat].h).toBe(55)
    expect(winningPattern(s.result!.values[seat])).toBe(name)
    expect(s.result!.transfers.filter(t => t.account === '胡牌分')).toEqual([
      expect.objectContaining({ to: seat, base: 55, reason: `硬胡＋${name}` }),
      expect.objectContaining({ to: seat, base: 55, reason: `硬胡＋${name}` }),
      expect.objectContaining({ to: seat, base: 55, reason: `硬胡＋${name}` }),
    ])
    expect(winPatternCue(s.result, { id: 1, duration: 1000, reducedMotion: false })?.winners)
      .toEqual([{ seat, label: name, tier: 2 }])
  })

  const scenarios: Array<[string, () => Player]> = [
    ['首次摸牌前碰过并出牌', () => player('234m 234s 66p 789s', {
      draws: 1, drawn: 26, discards: 1, melds: [meld(4)],
    })],
    ['两次碰牌后才第一次摸牌（截图情形）', () => player('234m 66p 789s', {
      draws: 1, drawn: 26, discards: 2, melds: [meld(4), meld(12)],
    })],
    ['首次摸牌是杠后补摸', () => player('234m 234s 66p 789s', {
      draws: 1, drawn: 26, afterKong: true, melds: [meld(4, { kind: 'open', from: 1 })],
    })],
    ['已有出牌记录', () => ({ ...untouched(), discards: 1 })],
    ['第二次摸牌', () => ({ ...untouched(), draws: 2 })],
  ]
  it.each(scenarios)('%s不能获得天胡、地胡，也不能报听', (_name, make) => {
    const s = table(); s.players[0] = make(); s.wall = []
    expect(isUntouchedFirstDraw(s.players[0])).toBe(false)
    expect(selfOptions(s, 0).hu).toBe(true)
    expect(selfOptions(s, 0).h).toBeLessThan(45)
    expect(winChoices(s, 0).every(v => !v.patterns.some(p => /天胡|地胡/.test(p.name)))).toBe(true)
    expect(act(s, 0, { type: 'discard', index: s.players[0].hand.length - 1, declare: true })).toBe(false)
    expect(act(s, 0, { type: 'hu' })).toBe(true)
    expect(s.result!.values[0].patterns.every(p => !/天胡|地胡/.test(p.name))).toBe(true)
  })

  it('别人的碰杠不取消本人资格；缺少庄闲信息时不猜天胡或地胡', () => {
    const s = table(); s.players[0] = untouched()
    s.players[1].melds = [meld(0, { kind: 'turn' })]
    expect(selfOptions(s, 0).h).toBe(55)
    expect(evaluateHand(untouched(), { kind: 'self', tile: 26 })
      .every(v => !v.patterns.some(p => /天胡|地胡/.test(p.name)))).toBe(true)
  })
})
