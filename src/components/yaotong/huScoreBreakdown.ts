import type { HandValue, Seat, Settlement, Transfer } from '../../game/variants/yaotong/types'

/** Use the selected winning decomposition, including special cases such as 素胡. */
export function handScoreFormula(value: HandValue): string {
  const base = value.h - value.patterns.reduce((sum, pattern) => sum + pattern.points, 0)
  return [{ name: '基础', points: base }, ...value.patterns]
    .map(part => `${part.name} ${part.points}`).join(' + ')
}

/** Keep different winners separate when the local player pays for multiple wins. */
export function huScoreBreakdown(result: Settlement, seat: Seat = 0) {
  const groups = new Map<Seat, Transfer[]>()
  for (const entry of result.transfers) {
    if (entry.account !== '胡牌分' || (entry.from !== seat && entry.to !== seat)) continue
    const group = groups.get(entry.to) ?? []
    group.push(entry)
    groups.set(entry.to, group)
  }
  return [...groups].flatMap(([winner, entries]) => {
    const value = result.values[winner]
    if (!value) return []
    const payerCount = entries.length
    const multiplier = entries[0]!.multiplier
    const parts = handScoreFormula(value)
    const factors = [payerCount > 1 ? ` × ${payerCount}家` : '', multiplier > 1 ? ` × ${multiplier}（同点）` : ''].join('')
    return [{
      winner,
      formula: factors ? `（${parts}）${factors}` : parts,
      amount: entries.reduce((sum, entry) => sum + (entry.to === seat ? entry.amount : -entry.amount), 0),
    }]
  })
}
