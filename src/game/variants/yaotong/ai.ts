import { kongOptions, selfOptions } from './engine'
import { discardWaits, waits } from './hands'
import { countsOf, isChicken, YAO } from './tiles'
import type { Command, GameState, Seat } from './types'

/** Local opponents see their own hand and public information only. */
export function chooseAction(state: GameState, seat: Seat): Command | null {
  const p = state.players[seat]
  if (state.phase === 'original' && !state.originalDecisions[seat])
    return { type: 'original', declare: waits(p).length > 0 }
  if (state.phase === 'response') {
    const pending = state.pending!
    const options = pending.options[seat]
    if (!options || pending.choices[seat]) return null
    if (options.hu && !options.restrictedHu) return { type: 'respond', action: 'hu' }
    if (options.kong) return { type: 'respond', action: 'kong' }
    if (options.peng && !options.restrictedPeng && pending.tile !== YAO) {
      // Do not knowingly peng into an unavoidable chicken-discard penalty.
      const rest = [...p.hand]
      for (let n = 0; n < 2; n++) rest.splice(rest.indexOf(pending.tile), 1)
      if ((!p.chickenPeng && !isChicken(pending.tile)) || rest.some((t) => !isChicken(t)))
        return { type: 'respond', action: 'peng' }
    }
    return { type: 'respond', action: 'pass' }
  }
  if (state.phase !== 'discard' || state.current !== seat) return null
  const hu = selfOptions(state, seat)
  if (hu.hu && !hu.restrictedHu) return { type: 'hu' }
  const kongs = kongOptions(state, seat)
  if (kongs.length) return { type: 'kong', tile: kongs[0] }
  if (p.declaration !== 'none') return { type: 'discard', index: p.hand.length - 1 }
  const legal = p.hand
    .map((tile, index) => ({ tile, index }))
    .filter(({ tile }) => !p.chickenPeng || !isChicken(tile))
  const available = legal.length ? legal : p.hand.map((tile, index) => ({ tile, index }))
  const listening = discardWaits(p).filter((o) => available.some((c) => c.index === o.index))
  if (listening.length) {
    const publicCounts = countsOf([
      ...p.hand,
      ...state.players.flatMap((player) => [
        ...player.river.map((d) => d.tile),
        ...player.melds.flatMap((m) => Array(m.kind === 'peng' ? 3 : 4).fill(m.tile)),
      ]),
    ])
    listening.sort(
      (a, b) =>
        b.waits.reduce((n, w) => n + Math.max(0, 4 - publicCounts[w.tile]), 0) -
        a.waits.reduce((n, w) => n + Math.max(0, 4 - publicCounts[w.tile]), 0),
    )
    return { type: 'discard', index: listening[0].index, declare: p.draws === 1 && p.drawn !== null }
  }
  const counts = countsOf(p.hand)
  const keep = (tile: number) => {
    if (tile === YAO) return 100
    let score = counts[tile] * 8 + (isChicken(tile) ? 2 : 0)
    for (const step of [-2, -1, 1, 2]) {
      const neighbor = tile + step
      if (Math.floor(neighbor / 9) === Math.floor(tile / 9))
        score += (counts[neighbor] ?? 0) * (Math.abs(step) === 1 ? 4 : 2)
    }
    return score
  }
  available.sort((a, b) => keep(a.tile) - keep(b.tile))
  return { type: 'discard', index: available[0].index }
}
