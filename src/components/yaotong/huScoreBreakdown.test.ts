import { describe, expect, it } from 'vitest'
import { player, table } from '../../game/variants/yaotong/auditFixtures'
import { settle } from '../../game/variants/yaotong/settlement'
import { huScoreBreakdown } from './huScoreBreakdown'

describe('本家胡分组成', () => {
  it('将报听软胡25分拆为基础5与报听20，排除鸡分等其他收付', () => {
    const state = table()
    state.players[0] = player('23456m 567s 122p 789p', { declaration: 'ready' })
    const result = settle(state, { kind: 'win', winKind: 'discard', winners: [0], source: 1, tile: 16 })
    expect(huScoreBreakdown(result)).toEqual([{ winner: 0, formula: '基础 5 + 报听 20', amount: 25 }])
  })

  it('自摸按实际三家付款汇总，同点仅翻倍一次', () => {
    const state = table()
    state.dice = [2, 2]
    state.players[0] = player('234567m 567s 22p 789p')
    const result = settle(state, { kind: 'win', winKind: 'self', winners: [0], tile: 16 })
    expect(huScoreBreakdown(result)).toEqual([{ winner: 0, formula: '（基础 5 + 硬胡 10） × 3家 × 2（同点）', amount: 90 }])
    expect(huScoreBreakdown(result, 1)).toEqual([{ winner: 0, formula: '（基础 5 + 硬胡 10） × 2（同点）', amount: -30 }])
  })

  it('一炮多响逐个赢家展示所选牌型，分项与胡分总支出一致', () => {
    const state = table()
    state.players[1] = player('23456m 567s 122p 789p', { declaration: 'ready' })
    state.players[2] = player('234567m 567s 22p 789p', { declaration: 'ready' })
    const result = settle(state, { kind: 'win', winKind: 'discard', winners: [1, 2], source: 0, tile: 16 })
    expect(huScoreBreakdown(result)).toEqual([
      { winner: 1, formula: '基础 5 + 报听 20', amount: -25 },
      { winner: 2, formula: '基础 5 + 硬胡 10 + 报听 20', amount: -35 },
    ])
    expect(huScoreBreakdown(result, 3)).toEqual([])
  })

  it('流局赔听不当作普通胡牌分拆分', () => {
    const result = settle(table(), { kind: 'draw' })
    expect(huScoreBreakdown(result)).toEqual([])
  })
})
