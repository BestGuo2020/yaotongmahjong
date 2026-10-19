import type { GameEvent, GameState } from './types'
import { isFixed, YAO } from './tiles'

/** A presentation runs alongside the original turn timers; it never delays an action. */
export const CHICKEN_PERFORMANCE_MS = 1800
export interface ChickenPerformance {
  id: number
  kind: 'rush' | 'responsibility'
  actorSeat: number
  markSeat: number
  tile: number
  label: string
  points: number
}

export function isRush(tile: number, chicken: number) {
  return (tile === YAO && chicken > 0) || (isFixed(tile) && chicken === 4)
}

export function chickenPerformance(event: GameEvent, state: GameState): ChickenPerformance | null {
  if (state.result || event.tile == null) return null
  if (event.kind === 'discard' && isRush(event.tile, event.chicken ?? 0)) {
    return {
      id: event.id,
      kind: 'rush',
      actorSeat: event.seat,
      markSeat: event.seat,
      tile: event.tile,
      points: event.chicken!,
      label:
        event.tile === YAO
          ? { pre: '预冲', first: '首冲', later: '后冲', hot: '杠冲', normal: '幺筒' }[event.rush ?? 'normal']
          : '冲锋鸡',
    }
  }
  // Only a successful exposed claim creates a new responsibility. An added kong inherits it.
  if (event.tile !== YAO || (event.kind !== 'peng' && !(event.kind === 'kong' && event.text === '明杠')))
    return null
  const meld = state.players[event.seat].melds.find(
    (m) =>
      m.tile === YAO &&
      m.from != null &&
      m.from !== event.seat &&
      m.responsibility > 0 &&
      m.kind === (event.kind === 'peng' ? 'peng' : 'open'),
  )
  return meld
    ? {
        id: event.id,
        kind: 'responsibility',
        actorSeat: event.seat,
        markSeat: meld.from!,
        tile: YAO,
        label: '责任鸡',
        points: meld.responsibility,
      }
    : null
}

/** These are public ownership records, not promises of a payout or a peek at concealed tiles. */
export function chickenMarks(state: GameState, seat: number) {
  return {
    rushCount: state.players[seat].river.filter((d) => isRush(d.tile, d.chicken)).length,
    responsibilityCount: state.players.reduce(
      (total, p) =>
        total + p.melds.filter((m) => m.tile === YAO && m.from === seat && m.responsibility > 0).length,
      0,
    ),
  }
}
