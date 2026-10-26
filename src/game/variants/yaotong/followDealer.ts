import { isFixed, YAO } from './tiles'
import type { GameState, Tile } from './types'

export const followDealerBase = (tile: Tile) => tile === YAO ? 170 : isFixed(tile) ? 15 : 5

/** Called after the fourth discard's responses: a claimed/winning tile cannot complete the follow. */
export function completeFollowDealer(state: GameState): Tile | null {
  if (state.players[state.dealer].followDealer) return null
  const order = Array.from({ length: 4 }, (_, i) => state.players[(state.dealer + i) % 4])
  if (order.some(p => p.discards !== 1 || p.river.length !== 1 || p.melds.length > 0)) return null
  const tile = order[0].river[0].tile
  if (order.some((p, i) => p.river[0].tile !== tile || (i > 0 && p.river[0].id <= order[i - 1].river[0].id))) return null
  for (const p of order) {
    p.river[0].followedDealer = true
    p.river[0].chicken = 0
  }
  state.players[state.dealer].followDealer = true
  return tile
}
