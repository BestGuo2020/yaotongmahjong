import type { TileType } from '../../core/contracts/types'

/** 引擎内部 0..26 ↔ 共享 TileType（m1/p1/s1）。 */
export const toSharedTile = (tile: number): TileType =>
  `${['m', 'p', 's'][Math.floor(tile / 9)]}${(tile % 9) + 1}` as TileType

export const fromSharedTile = (tile: TileType) =>
  'mps'.indexOf(tile[0]) * 9 + Number(tile[1]) - 1
