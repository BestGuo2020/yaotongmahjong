import { expect, it } from 'vitest'
import { evaluateHand } from './hands'
import { countsOf, YAO } from './tiles'
import { player } from './auditFixtures'

// Independent oracle: replace each joker with each of 27 faces, then use a natural-tile solver.
// Unlike the production evaluator this does not allocate jokers during recursive decomposition.
function naturalWin(hand: number[]) {
  const counts = countsOf(hand)
  if (counts.every((n) => n % 2 === 0)) return true
  const melds = (): boolean => {
    const first = counts.findIndex((n) => n > 0)
    if (first < 0) return true
    if (counts[first] >= 3) {
      counts[first] -= 3
      const won = melds()
      counts[first] += 3
      if (won) return true
    }
    if (first % 9 <= 6 && counts[first + 1] && counts[first + 2]) {
      for (let i = 0; i < 3; i++) counts[first + i]--
      const won = melds()
      for (let i = 0; i < 3; i++) counts[first + i]++
      if (won) return true
    }
    return false
  }
  return counts.some((n, tile) => {
    if (n < 2) return false
    counts[tile] -= 2
    const won = melds()
    counts[tile] += 2
    return won
  })
}
function oracle(hand: number[]): boolean {
  const first = hand.indexOf(YAO)
  // Assign from a separate index list so an assigned natural 1p does not get replaced again.
  const indices = hand.flatMap((tile, index) => (tile === YAO ? [index] : []))
  if (first < 0) return naturalWin(hand)
  const assigned = [...hand]
  const enumerate = (depth: number): boolean => {
    if (depth === indices.length) return naturalWin(assigned)
    for (let tile = 0; tile < 27; tile++) {
      assigned[indices[depth]] = tile
      if (enumerate(depth + 1)) return true
    }
    return false
  }
  return enumerate(0)
}

it('§3–4 independent substitution oracle agrees for 360 physical hands with 0–2 jokers (winning, near-win and random)', () => {
  let seed = 20261019
  const random = (n: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed % n
  }
  let checked = 0,
    winning = 0,
    losing = 0
  while (checked < 360) {
    const hand: number[] = []
    if (checked % 3 === 2) for (let i = 0; i < 14; i++) hand.push(random(27))
    else {
      const pair = random(27)
      hand.push(pair, pair)
      for (let m = 0; m < 4; m++) {
        const first = random(3) * 9 + random(7)
        hand.push(...(random(2) ? [first, first, first] : [first, first + 1, first + 2]))
      }
      if (checked % 3 === 1) hand[random(14)] = random(27)
      for (let j = 0; j < checked % 3; j++) hand[random(14)] = YAO
    }
    const counts = countsOf(hand)
    if (counts.some((n) => n > 4) || counts[YAO] > 2) continue
    const expected = oracle(hand)
    expected ? winning++ : losing++
    expect(
      evaluateHand(player('', { hand }), { kind: 'ready', tile: hand[13] }).length > 0,
      JSON.stringify(hand),
    ).toBe(expected)
    checked++
  }
  expect(winning).toBeGreaterThan(100)
  expect(losing).toBeGreaterThan(100)
}, 30000)
