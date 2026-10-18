import { createGame, makePlayer } from './engine'
import type { Meld, Player, Tile } from './types'
export const tiles = (text: string): Tile[] =>
  text
    .trim()
    .split(/\s+/)
    .flatMap((part) => [...part.slice(0, -1)].map((n) => 'mps'.indexOf(part.at(-1)!) * 9 + Number(n) - 1))
export const player = (text: string, extra: Partial<Player> = {}): Player => ({
  ...makePlayer(),
  draws: 2,
  hand: tiles(text),
  ...extra,
})
export const meld = (tile: Tile, extra: Partial<Meld> = {}): Meld => ({
  tile,
  kind: 'peng',
  pre: false,
  chicken: 0,
  responsibility: 0,
  ...extra,
})
export const ready = () => player('234567m 234s 66p 78s')
export const unready = () => player('147m 258p 369s 2468s')
export function table() {
  const s = createGame({ dealer: 0, dice: [2, 3] })
  s.players = Array.from({ length: 4 }, unready)
  s.wall = [17, 20, 23]
  s.phase = 'discard'
  return s
}
