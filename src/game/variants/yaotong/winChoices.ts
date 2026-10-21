import { evaluateHand, passAllows, huChoiceKey } from './hands'
import { chickenValue, huGain } from './settlement'
import type { GameState, HandValue } from './types'
export { huChoiceKey } from './hands'

/** Pre-flip choices must never inspect the future indicator or another player's hand. */
export function winChoices(state: GameState, seat: number): HandValue[] {
  const self = state.phase === 'discard' && state.current === seat
  const pending = state.phase === 'response' ? state.pending : null
  if (!self && (!pending?.options[seat]?.hu || pending.choices[seat])) return []
  const tile = self ? state.players[seat].drawn : pending!.tile
  if (tile == null) return []
  const player = self ? state.players[seat] : { ...state.players[seat], hand: [...state.players[seat].hand, tile] }
  const candidates = evaluateHand(player, {
    kind: self ? 'self' : pending!.kind, tile,
    killsReport: self ? state.players.some((p, i) => i !== seat && p.declaration !== 'none')
      : state.players[pending!.from].declaration !== 'none',
  }).filter(v => passAllows(player, v.h, v))
  const gain = (v: HandValue) => huGain(player, v, self ? 3 : 1, null)
  candidates.sort((a, b) => gain(b) - gain(a) || b.h - a.h)
  const unique = new Map<string, HandValue>()
  for (const value of candidates) if (!unique.has(huChoiceKey(value))) unique.set(huChoiceKey(value), value)
  // Keep real tradeoffs (e.g. hard dragon vs soft double dragon), omit strictly inferior choices.
  return [...unique.values()].filter(a => ![...unique.values()].some(b => b !== a &&
    b.h >= a.h && b.naturalYaos >= a.naturalYaos &&
    chickenValue(player, b.naturalYaos, null, false, b) >= chickenValue(player, a.naturalYaos, null, false, a) &&
    (b.h > a.h || b.naturalYaos > a.naturalYaos)))
}
