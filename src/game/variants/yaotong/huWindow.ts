import type { GameState, Seat } from './types'

/** Expert silence is provisional until the next discard, even after a draw or peng. */
const windows = new WeakMap<GameState, { seat: Seat; snapshot: GameState }>()
export function retainHuWindow(state: GameState, seat: Seat) {
  const snapshot: GameState = JSON.parse(JSON.stringify(state))
  snapshot.phase = 'response'
  delete snapshot.pending!.choices[seat]
  windows.set(state, { seat, snapshot })
}
export function huWindow(state: GameState, seat: Seat) {
  const entry = windows.get(state)
  return entry?.seat === seat && state.phase !== 'settled' ? entry.snapshot : null
}
export function takeHuWindow(state: GameState) {
  const entry = windows.get(state)
  windows.delete(state)
  return entry
}
