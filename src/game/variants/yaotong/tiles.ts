import type { Tile } from './types'

export const YAO = 9
export const FIXED = [0, 16, 18] as const
export const TILES = Array.from({ length: 27 }, (_, i) => i)
export const isFixed = (t: Tile) => (FIXED as readonly number[]).includes(t)
export const isChicken = (t: Tile) => t === YAO || isFixed(t)
export const tileName = (t: Tile) => '一二三四五六七八九'[t % 9] + ['万', '筒', '条'][Math.floor(t / 9)]
export const nextTile = (t: Tile) => Math.floor(t / 9) * 9 + ((t + 1) % 9)
export const tileFile = (t: Tile) => `${(t % 9) + 1}${['m', 'p', 's'][Math.floor(t / 9)]}.png`
export const sortHand = (hand: Tile[]) => hand.sort((a, b) => a - b)
export const countsOf = (hand: Tile[]) => {
  const counts = Array<number>(27).fill(0)
  for (const t of hand) counts[t]++
  return counts
}
export function shuffledWall(random = Math.random): Tile[] {
  const wall = TILES.flatMap((t) => [t, t, t, t])
  for (let i = wall.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[wall[i], wall[j]] = [wall[j], wall[i]]
  }
  return wall
}

/** 108 张排为 54 墩，四方依次 14、13、14、13 墩；保留列只改变起点。 */
export function breakWall(wall: Tile[], dice: [number, number], dealer: number) {
  const side = (dealer + ((dice[0] + dice[1] - 1) % 4)) % 4
  const reserved = Math.min(...dice)
  const offset = ([0, 28, 54, 82][side] + reserved * 2) % 108
  return { wall: [...wall.slice(offset), ...wall.slice(0, offset)], side, reserved }
}
