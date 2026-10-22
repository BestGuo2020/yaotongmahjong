import { describe, expect, it } from 'vitest'
import { act, continueGame } from './engine'
import { offeredHuPlans, huPlanKey } from './settlement'
import { player, table, meld } from './auditFixtures'
import { yaotongReplayFrame } from './replay'
import { YAO } from './tiles'

function bigHand() {
  const s = table()
  s.wall = [8]
  s.players[0] = player('2222m 33p 44s 55s 66p 11p', { declaration: 'ready', drawn: YAO })
  return s
}

describe('翻鸡前确认，仅有实际风险取舍的大牌提供多个胡法', () => {
  it('胡法不读取未知指示牌；普通胡和无法翻鸡的末张不提供多选', () => {
    const s = bigHand()
    const plans = offeredHuPlans(s, 0)
    expect(plans.map(p => p.label)).toEqual(['双龙七', '龙七对＋硬胡'])
    s.wall = [17]
    expect(offeredHuPlans(s, 0).map(p => p.key)).toEqual(plans.map(p => p.key))
    s.wall = []
    expect(offeredHuPlans(s, 0)).toEqual([])
    s.wall = [17]; s.players[0] = player('234567m 234s 66p 789s', { drawn: 26 })
    expect(offeredHuPlans(s, 0)).toEqual([])
    s.players[0] = player('234567m 456s 123p 11p', { drawn: YAO })
    expect(offeredHuPlans(s, 0)).toEqual([]) // Ordinary joker hands with no real tradeoff stay one-click.
  })

  it.each([false, true])('翻前选择硬龙七：翻九筒=%s也不改回软双龙七', flipped => {
    const s = bigHand()
    const hard = offeredHuPlans(s, 0).find(p => p.value.wildcards === 0)!
    s.wall = [flipped ? 17 : 8]
    expect(act(s, 0, { type: 'hu', plan: hard.key })).toBe(true)
    expect(s.result!.values[0].wildcards).toBe(0)
    expect(s.result!.deltas[0]).toBe(flipped ? 405 : 285)
  })

  it('翻前选择软双龙七，翻中九筒也不会事后换成硬龙七', () => {
    const s = bigHand(); s.wall = [17]
    const soft = offeredHuPlans(s, 0).find(p => p.value.wildcards === 2)!
    act(s, 0, { type: 'hu', plan: soft.key })
    expect(s.result!.values[0].wildcards).toBe(2)
    expect(s.result!.deltas[0]).toBe(315)
    expect(huPlanKey(s.result!.values[0])).toBe(soft.key)
  })

  it('接炮仅硬胡占优时直接确认；伪造胡法不消耗指示牌', () => {
    const s = bigHand(); s.players[0].hand.pop(); s.current = 1
    s.players[1].hand.push(YAO)
    act(s, 1, { type: 'discard', index: 13 })
    const before = structuredClone(s)
    expect(act(s, 0, { type: 'respond', action: 'hu', plan: 'bad-plan' })).toBe(false)
    expect(s).toEqual(before)
    expect(offeredHuPlans(s, 0)).toEqual([])
    act(s, 0, { type: 'respond', action: 'hu' })
    expect(s.result!.values[0].wildcards).toBe(0)
  })
})

describe('每种鸡的首张与本家首张跟冲横放；首张标记不递补；碰牌不指来源', () => {
  it.each([0, 16, 18, YAO])('鸡牌%s只有全场第一张和本家首张跟冲横放', tile => {
    const s = table()
    for (let n = 0; n < 2; n++) {
      s.phase = 'discard'; s.current = 0; s.pending = null
      s.players[0].hand = [tile]; s.players[0].discards = n
      act(s, 0, { type: 'discard', index: 0 })
    }
    expect(s.players[0].river.map(d => d.firstChicken)).toEqual([true, false])
    expect(s.players[0].river.map(d => d.followChicken)).toEqual([false, false])
    expect(yaotongReplayFrame(s).yaotongSidewaysDiscards![0]).toEqual([0])
  })

  it('首张被碰走后首张标记不递补；另一家的首张跟冲仍单独横放', () => {
    const s = table()
    s.players[0] = player('147m 258p 369s 2468s 1s')
    s.players[1] = player('11s 147m 258p 369s 24s')
    act(s, 0, { type: 'discard', index: 13 })
    expect(s.players[0].river[0].firstChicken).toBe(true)
    act(s, 1, { type: 'respond', action: 'peng' })
    expect(s.players[0].river).toEqual([])
    s.phase = 'discard'; s.current = 2; s.pending = null
    s.players[2].hand.push(18)
    act(s, 2, { type: 'discard', index: 13 })
    expect(s.players[2].river[0]).toMatchObject({ firstChicken: false, followChicken: true, chicken: 4 })
    expect(yaotongReplayFrame(s).yaotongSidewaysDiscards![2]).toEqual([0])
    s.phase = 'discard'; s.current = 0; s.players[0] = player('234567m 234s 66p 789s', { drawn: 26 })
    act(s, 0, { type: 'hu' })
    const next = continueGame(s)
    expect(next.seenChickenDiscards).toEqual([])
  })

  it('同一家之后打出的2分档固定鸡不再横放', () => {
    const s = table()
    s.players[0] = player('147m 258p 369s 2468s 1s')
    act(s, 0, { type: 'discard', index: 13 })
    s.phase = 'discard'; s.current = 0; s.pending = null
    s.players[0].hand = player('147m 258p 369s 2468s 1s').hand
    s.players[0].discards = 1
    act(s, 0, { type: 'discard', index: 13 })
    expect(s.players[0].river[1]).toMatchObject({ firstChicken: false, followChicken: false, chicken: 2 })
    expect(yaotongReplayFrame(s).yaotongSidewaysDiscards![0]).toEqual([0])
  })
})
