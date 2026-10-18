import type { Account, Declaration, GameEvent, GameState, HandValue, Settlement, Transfer } from './types'

export interface SeatStatus {
  declaration: Declaration
  burned: boolean
  winner: boolean
  gift: boolean
  winPattern?: string
  killed?: boolean
}
export interface ChickenCue {
  id: number
  seat: number
  label: string
  points: number
  strong: boolean
}
export interface YaotongTableView {
  seats: SeatStatus[]
  chickenCue: ChickenCue | null
}
export interface PaymentEdge {
  from: number
  to: number
  amount: number
  parts: Array<{ account: Account; amount: number }>
}

/** Announce the selected structural pattern before the shared hand-reveal stage. */
export function winningPattern(value?: HandValue): string | undefined {
  return value?.patterns
    .filter((pattern) =>
      [
        '碰碰胡',
        '清一色',
        '金钩钓',
        '七小对',
        '龙七对',
        '双龙七',
        '三龙七',
        '地龙',
        '双地龙',
        '三地龙',
        '素胡',
      ].includes(pattern.name),
    )
    .sort((a, b) => b.points - a.points)[0]?.name
}

/** Net opposing payments once per pair; retain category subtotals for inspection. */
export function paymentEdges(transfers: readonly Transfer[]): PaymentEdge[] {
  const pairs = new Map<string, { a: number; b: number; parts: Map<Account, number> }>()
  for (const entry of transfers) {
    if (entry.from === entry.to || entry.amount <= 0) continue
    const a = Math.min(entry.from, entry.to),
      b = Math.max(entry.from, entry.to),
      key = `${a}/${b}`
    if (!pairs.has(key)) pairs.set(key, { a, b, parts: new Map() })
    const pair = pairs.get(key)!
    pair.parts.set(
      entry.account,
      (pair.parts.get(entry.account) ?? 0) + (entry.from === a ? 1 : -1) * entry.amount,
    )
  }
  return [...pairs.values()].flatMap(({ a, b, parts }) => {
    const net = [...parts.values()].reduce((sum, amount) => sum + amount, 0)
    if (!net) return []
    return [
      {
        from: net > 0 ? a : b,
        to: net > 0 ? b : a,
        amount: Math.abs(net),
        parts: [...parts]
          .filter(([, amount]) => amount !== 0)
          .map(([account, amount]) => ({ account, amount: amount * Math.sign(net) })),
      },
    ]
  })
}

export function chickenCue(event: GameEvent, state: GameState): ChickenCue | null {
  if (state.result?.kind === 'penalty' || event.kind !== 'discard' || event.tile !== 9 || !event.chicken)
    return null
  const labels = { pre: '预冲', first: '首冲', later: '后冲', hot: '杠冲', normal: '幺筒' }
  return {
    id: event.id,
    seat: event.seat,
    label: labels[event.rush ?? 'normal'],
    points: event.chicken,
    strong: event.rush === 'hot',
  }
}

export function settlementTitle(result: Settlement | null): string | undefined {
  if (!result) return undefined
  if (result.kind === 'penalty') return '包牌'
  if (result.kind === 'draw') return '荒庄'
  if (result.winners.length > 1) return `一炮${result.winners.length}响`
  return result.winKind === 'self'
    ? '自摸'
    : result.winKind === 'rob'
      ? '抢杠胡'
      : result.winKind === 'hot'
        ? '热炮胡'
        : '胡牌'
}
