import { effectScope } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import cases from '../../../../tests/fixtures/yaotong-pace.json'
import { createGame, observeGameEvents } from './engine'
import { player, tiles } from './auditFixtures'
import { useYaotongGame } from './useYaotongGame'
import type { Command, Declaration, GameState } from './types'

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0) })
afterEach(() => vi.useRealTimers())

it.each(cases)('单机事件时间线与联机金标一致：$name', async scenario => {
  const scope = effectScope()
  const game = scope.run(() => useYaotongGame())!
  try {
    const state = createGame({ dealer: 0, dice: [2, 3] })
    state.phase = (scenario.phase ?? 'discard') as GameState['phase']
    state.current = scenario.actor
    state.wall = [2, 5, 8, 11, 14, 17, 21, 25, 26]
    state.players = Array.from({ length: 4 }, () => player('147m 258p 369s 2468s', { draws: 2, discards: 1 }))
    for (const [seat, input] of Object.entries(scenario.players)) {
      const p = state.players[Number(seat)]
      p.hand = tiles(input.hand)
      p.drawn = input.drawn ?? null
      if ('afterKong' in input) p.afterKong = Boolean(input.afterKong)
      if ('declaration' in input) p.declaration = input.declaration as Declaration
      if ('peng' in input) p.melds = [{ tile: input.peng as number, kind: 'peng', from: 3, pre: false, chicken: 0, responsibility: 0 }]
    }
    const events: unknown[][] = []
    observeGameEvents(state, (_, event) => events.push([Date.now(), event.kind, event.seat]))
    game.state.value = state
    if (scenario.command) expect(game.dispatch(scenario.command as Command, scenario.actor)).toBe(true)
    await vi.advanceTimersByTimeAsync(Number(scenario.events.at(-1)![0]))
    expect(events).toEqual(scenario.events)
  } finally { scope.stop() }
})
