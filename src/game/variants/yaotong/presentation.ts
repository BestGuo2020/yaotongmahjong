import type { Account, Declaration, GameEvent, GameState, HandValue, Settlement, Transfer } from './types'
import type { TableDeclarationEvent } from '../../core/presentation/tableActionCue'
import type { ChickenPerformance } from './chickenPresentation'

/** One wind per four dealer rounds; repeat hands keep the same label. */
export function yaotongRoundLabel(dealerRound: number): string {
  return `${['东', '南', '西', '北'][Math.floor((dealerRound - 1) / 4)]}${((dealerRound - 1) % 4) + 1}局`
}

export interface SeatStatus {
  declaration: Declaration
  burned: boolean
  winner: boolean
  gift: boolean
  giftAmount?: number
  winPattern?: string
  killed?: boolean
  killedAmount?: number
  rushCount?: number
  responsibilityCount?: number
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
  declarationCues: TableDeclarationEvent[]
  settlementCue: SettlementCue | null
  chickenPerformances?: ChickenPerformance[]
}
export interface PaymentEdge {
  from: number
  to: number
  amount: number
  parts: Array<{ account: Account; amount: number }>
}

export interface GiftAward {
  seat: number
  amount: number
}
export interface SettlementCue {
  id: number
  burned: number[]
  gifts: GiftAward[]
  payments: PaymentEdge[]
  kills: PaymentEdge[]
  responsibilities?: PaymentEdge[]
}

/** Account transfers retain their direction and final dice-adjusted amount; no net/H duplication. */
export function accountPayments(transfers: readonly Transfer[], account: Account): PaymentEdge[] {
  const grouped = new Map<string, PaymentEdge>()
  for (const t of transfers) {
    if (t.account !== account || t.amount <= 0 || t.from === t.to) continue
    const key = `${t.from}/${t.to}`
    const amount = (grouped.get(key)?.amount ?? 0) + t.amount
    grouped.set(key, { from: t.from, to: t.to, amount, parts: [{ account, amount }] })
  }
  return [...grouped.values()]
}

export const giftPayments = (transfers: readonly Transfer[]) => accountPayments(transfers, '见面礼')
export const killPayments = (transfers: readonly Transfer[]) => accountPayments(transfers, '杀报加分')
export const responsibilityPayments = (transfers: readonly Transfer[]) =>
  accountPayments(transfers, '幺筒责任分')

export function killFocusSeat(transfers: readonly Transfer[]): number {
  const payments = killPayments(transfers)
  return (new Set(payments.map((payment) => payment.to)).size > 1 ? payments[0]?.from : payments[0]?.to) ?? 0
}

export function reportKillTotals(transfers: readonly Transfer[]) {
  const totals = new Map<number, { seat: number; paid: number; received: number }>()
  for (const payment of killPayments(transfers)) {
    for (const seat of [payment.from, payment.to])
      if (!totals.has(seat)) totals.set(seat, { seat, paid: 0, received: 0 })
    totals.get(payment.from)!.paid += payment.amount
    totals.get(payment.to)!.received += payment.amount
  }
  return [...totals.values()]
}

export const SETTLEMENT_FLIGHT_MS = 720
export interface SettlementFlight extends PaymentEdge {
  kind: 'gift' | 'kill' | 'responsibility'
  delayMs: number
}
export function settlementFlights(cue: SettlementCue): SettlementFlight[] {
  const entries = [
    ...(cue.kills ?? []).map((payment) => ({ ...payment, kind: 'kill' as const })),
    ...(cue.responsibilities ?? []).map((payment) => ({ ...payment, kind: 'responsibility' as const })),
    ...cue.payments.map((payment) => ({ ...payment, kind: 'gift' as const })),
  ]
  // All account flights must arrive and show their totals inside the existing 1500ms reveal.
  const gap = Math.min(120, 300 / Math.max(1, entries.length - 1))
  return entries.map((payment, index) => ({ ...payment, delayMs: index * gap }))
}

export function giftAwards(transfers: readonly Transfer[]): GiftAward[] {
  const totals = new Map<number, number>()
  for (const t of giftPayments(transfers)) totals.set(t.to, (totals.get(t.to) ?? 0) + t.amount)
  return [...totals].map(([seat, amount]) => ({ seat, amount }))
}

export function settlementCue(state: GameState | null, id: number): SettlementCue | null {
  const result = state?.result
  if (!state || !result || result.kind === 'penalty') return null
  const burned = result.kind === 'win' ? state.players.flatMap((p, seat) => (p.burned ? [seat] : [])) : []
  const gifts = giftAwards(result.transfers)
  const kills = result.kind === 'win' ? killPayments(result.transfers) : []
  const responsibilities = responsibilityPayments(result.transfers)
  return burned.length || gifts.length || kills.length || responsibilities.length
    ? { id, burned, gifts, payments: giftPayments(result.transfers), kills, responsibilities }
    : null
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
