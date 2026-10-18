import { countsOf, isChicken, TILES, YAO } from './tiles'
import type { HandValue, Pattern, Player, Tile, Wait, WinContext } from './types'

interface Shape {
  suits: number
  pungs: boolean
  dragons: number
  groups: Tile[][]
}
const suitBit = (tile: Tile) => 1 << Math.floor(tile / 9)
const oneSuit = (bits: number) => bits !== 0 && (bits & (bits - 1)) === 0
const shapeCache = new Map<string, Shape[]>()

function unique(shapes: Shape[]) {
  const map = new Map<string, Shape>()
  for (const s of shapes) map.set(`${s.suits}/${+s.pungs}/${s.dragons}`, s)
  return [...map.values()]
}

/** Enumerates coherent decompositions; a wildcard never borrows hard-Hu from another shape. */
function standard(counts: number[], wild: number, melds: number, pair: boolean): Shape[] {
  const key = `${counts.join('')}:${wild}:${melds}:${+pair}`
  const cached = shapeCache.get(key)
  if (cached) return cached
  const first = counts.findIndex((c) => c > 0)
  if (first < 0) {
    if (wild !== melds * 3 + (pair ? 2 : 0)) return []
    if (!wild) return [{ suits: 0, pungs: true, dragons: 0, groups: [] }]
    return [0, 9, 18].map((t) => ({
      suits: suitBit(t),
      pungs: true,
      dragons: 0,
      groups: [...Array.from({ length: melds }, () => [t, t, t]), ...(pair ? [[t, t]] : [])],
    }))
  }
  const result: Shape[] = []
  function append(group: number[], consumed: number[], spent: number, isPair: boolean, pung: boolean) {
    if (spent > wild) return
    const next = [...counts]
    consumed.forEach((t) => next[t]--)
    for (const tail of standard(next, wild - spent, melds - (isPair ? 0 : 1), pair && !isPair)) {
      result.push({
        suits: tail.suits | suitBit(first),
        pungs: tail.pungs && pung,
        dragons: 0,
        groups: [group, ...tail.groups],
      })
    }
  }
  if (pair) {
    for (let n = 1; n <= Math.min(2, counts[first]); n++)
      append([first, first], Array(n).fill(first), 2 - n, true, true)
  }
  if (melds > 0) {
    for (let n = 1; n <= Math.min(3, counts[first]); n++)
      append([first, first, first], Array(n).fill(first), 3 - n, false, true)
    const base = Math.floor(first / 9) * 9
    for (let start = Math.max(base, first - 2); start <= Math.min(first, base + 6); start++) {
      const group = [start, start + 1, start + 2]
      const others = group.filter((t) => t !== first)
      // Choosing a joker even when a natural tile exists is essential for some seven/sequence alternatives.
      for (let mask = 0; mask < 4; mask++) {
        const consumed = [first]
        let spent = 0,
          possible = true
        others.forEach((t, i) => {
          if (mask & (1 << i)) spent++
          else if (counts[t]) consumed.push(t)
          else possible = false
        })
        if (possible) append(group, consumed, spent, false, false)
      }
    }
  }
  const value = unique(result)
  if (shapeCache.size > 35_000) shapeCache.clear()
  shapeCache.set(key, value)
  return value
}

function pairs(counts: number[], wild: number): Shape[] {
  let needed = 0,
    suits = 0,
    dragons = 0
  const groups: Tile[][] = []
  for (const t of TILES) {
    if (!counts[t]) continue
    suits |= suitBit(t)
    needed += counts[t] % 2
    if (counts[t] >= 3) dragons++
    for (let n = 0; n < Math.ceil(counts[t] / 2); n++) groups.push([t, t])
  }
  if (needed > wild || (wild - needed) % 2) return []
  const extra = (wild - needed) / 2
  const singles = groups.filter((g) => counts[g[0]] < 3).map((g) => g[0])
  const upgrades = Math.min(extra, singles.length)
  const remaining = extra - upgrades
  const completed = [...groups, ...singles.slice(0, upgrades).map((t) => [t, t])]
  const base = { pungs: false, dragons: dragons + upgrades + Math.floor(remaining / 2) }
  return remaining === 0
    ? [{ ...base, suits, groups: completed }]
    : [0, 9, 18].map((t) => ({
        ...base,
        suits: suits | suitBit(t),
        groups: [...completed, ...Array.from({ length: remaining }, () => [t, t])],
      }))
}

function structuralValues(player: Player, ctx: WinContext): HandValue[] {
  const hand = player.hand
  if (
    hand.length !== 14 - player.melds.length * 3 ||
    hand.some((t) => !Number.isInteger(t) || t < 0 || t > 26)
  )
    return []
  const raw = countsOf(hand)
  const physical = countsOf([
    ...hand,
    ...player.melds.flatMap((m) => Array(m.kind === 'peng' ? 3 : 4).fill(m.tile)),
  ])
  if (physical.some((n) => n > 4)) return []
  const yaoCount = raw[YAO]
  const exposedSuits = player.melds.reduce((bits, m) => bits | suitBit(m.tile), 0)
  const result: HandValue[] = []

  function add(
    shape: Shape,
    natural: number,
    wildcards: number,
    structure: HandValue['structure'],
    forcedWinningNatural?: boolean,
  ) {
    const patterns: Pattern[] = []
    if (structure === 'pairs') {
      const d = Math.min(shape.dragons, 3)
      patterns.push({ name: ['七小对', '龙七对', '双龙七', '三龙七'][d], points: [20, 40, 80, 120][d] })
    } else if (structure === 'earth') {
      const d = Math.min(shape.dragons, 2)
      patterns.push({ name: ['地龙', '双地龙', '三地龙'][d], points: [40, 80, 120][d] })
    } else {
      if (shape.pungs) patterns.push({ name: '碰碰胡', points: 10 })
      if (player.melds.length === 4) patterns.push({ name: '金钩钓', points: 20 })
    }
    if (oneSuit(shape.suits | exposedSuits)) patterns.push({ name: '清一色', points: 20 })
    const big = patterns.length > 0
    if (wildcards === 0) patterns.push({ name: '硬胡', points: 10 })
    if (player.declaration !== 'none')
      patterns.push({
        name: player.declaration === 'original' ? '原报' : '报听',
        points: player.declaration === 'original' ? 40 : 20,
      })
    if (ctx.kind === 'rob' || ctx.kind === 'hot')
      patterns.push({ name: ctx.kind === 'rob' ? '抢杠' : '热炮', points: 20 })
    if (ctx.kind === 'self' && player.draws === 1) patterns.push({ name: '天胡／地胡', points: 40 })
    const hasKong = player.melds.some((m) => m.kind !== 'peng')
    if (ctx.kind === 'discard' && !big && !hasKong && player.declaration === 'none') return
    const patternPoints = patterns.reduce((sum, p) => sum + p.points, 0)
    const uses =
      ctx.tile !== YAO
        ? [false]
        : forcedWinningNatural !== undefined
          ? [forcedWinningNatural]
          : [...(natural > 0 ? [true] : []), ...(wildcards > 0 ? [false] : [])]
    for (const winningYaoNatural of uses) {
      const value: HandValue = {
        h: 5 + patternPoints,
        patternPoints,
        patterns,
        naturalYaos: natural,
        wildcards,
        winningYaoNatural,
        big,
        structure,
        groups: shape.groups,
      }
      result.push(value)
      const used = [...hand, ...player.melds.flatMap((m) => Array(3).fill(m.tile))]
      if (
        ctx.kind === 'self' &&
        !hasKong &&
        !ctx.killsReport &&
        !used.some((t) => isChicken(t) || t === ctx.chicken)
      ) {
        result.push({ ...value, h: 25, patternPoints: 20, patterns: [{ name: '素胡', points: 20 }] })
      }
    }
  }

  for (let natural = 0; natural <= yaoCount; natural++) {
    const counts = [...raw]
    counts[YAO] = natural
    const wild = yaoCount - natural
    for (const shape of standard(counts, wild, 4 - player.melds.length, true))
      add(shape, natural, wild, 'standard')
    if (!player.melds.length) for (const shape of pairs(counts, wild)) add(shape, natural, wild, 'pairs')
  }
  // 地龙：仅一副碰；胡入张接到该碰上，剩余十张拆作五对。
  if (
    player.melds.length === 1 &&
    player.melds[0].kind === 'peng' &&
    (ctx.tile === player.melds[0].tile || ctx.tile === YAO)
  ) {
    const remaining = [...raw]
    if (remaining[ctx.tile] > 0) {
      remaining[ctx.tile]--
      const winningWild = ctx.tile === YAO && player.melds[0].tile !== YAO
      for (let natural = 0; natural <= remaining[YAO]; natural++) {
        const counts = [...remaining]
        counts[YAO] = natural
        const wild = remaining[YAO] - natural
        for (const shape of pairs(counts, wild))
          add(
            shape,
            natural + +(ctx.tile === YAO && !winningWild),
            wild + +winningWild,
            'earth',
            ctx.tile === YAO && !winningWild,
          )
      }
    }
  }
  const dedup = new Map<string, HandValue>()
  for (const v of result)
    dedup.set(`${v.h}/${v.naturalYaos}/${+v.winningYaoNatural}/${v.patterns.map((p) => p.name)}`, v)
  return [...dedup.values()].sort((a, b) => b.h - a.h || b.naturalYaos - a.naturalYaos)
}

export const evaluateHand = structuralValues

const waitCache = new Map<string, Wait[]>()
export function waits(player: Player): Wait[] {
  if (player.hand.length !== 13 - player.melds.length * 3) return []
  const key = `${[...player.hand].sort((a, b) => a - b)}|${player.melds.map((m) => `${m.tile}:${m.kind}`)}|${player.declaration}`
  const existing = waitCache.get(key)
  if (existing) return existing
  const physical = countsOf([
    ...player.hand,
    ...player.melds.flatMap((m) => Array(m.kind === 'peng' ? 3 : 4).fill(m.tile)),
  ])
  const found: Wait[] = []
  for (const tile of TILES) {
    if (physical[tile] >= 4) continue
    const values = evaluateHand({ ...player, hand: [...player.hand, tile] }, { kind: 'ready', tile })
    if (values.length) found.push({ tile, values })
  }
  if (waitCache.size > 5_000) waitCache.clear()
  waitCache.set(key, found)
  return found
}

export function discardWaits(player: Player): Array<{ index: number; waits: Wait[] }> {
  if (player.hand.length !== 14 - player.melds.length * 3) return []
  return player.hand
    .map((_, index) => ({
      index,
      waits: waits({ ...player, hand: player.hand.filter((_, i) => i !== index) }),
    }))
    .filter((entry) => entry.waits.length)
}

export const passAllows = (player: Player, h: number) =>
  player.passedHu === null || (h >= 45 && h > player.passedHu)
