import { describe, expect, it } from 'vitest'

import { convertSnapshot, toActionPayload, type YtSnapshot } from './protocol'

function player(seat: number, hand: string[] = [], extra: Record<string, unknown> = {}) {
  return {
    seat,
    name: `P${seat}`,
    avatar: '',
    characterId: 'deepseek',
    playerKind: 'human' as const,
    isLlm: false,
    score: 0,
    hand,
    concealedTileCount: hand.length,
    melds: [],
    river: [],
    declaration: 'none' as const,
    draws: 0,
    discards: 0,
    drawn: null,
    afterKong: false,
    burned: false,
    passedHu: null,
    chickenPeng: [],
    chickenDiscard: [],
    ...extra,
  }
}

function snapshot(overrides: Partial<YtSnapshot> = {}): YtSnapshot {
  return {
    kind: 'yt_snapshot',
    roomId: 'R1',
    matchId: 'M1',
    rulesetId: 'yaotong',
    seat: 1,
    round: 1,
    dealer: 2,
    matchLength: 8,
    matchFinished: false,
    opening: null,
    roundResult: null,
    view: {
      seat: 1,
      phase: 'discard',
      dealer: 2,
      current: 3,
      serial: 7,
      wallCount: 40,
      dice: [1, 2],
      wallSide: 2,
      reservedStacks: 1,
      matchLength: 8,
      dealerRound: 1,
      handNumber: 1,
      repeats: 0,
      players: [
        player(0, ['m1', 'm2']),
        player(1, ['p1', 'p2', 'p3'], { drawn: 'p3', concealedTileCount: 3 }),
        player(2, ['s1']),
        player(3, ['m9']),
      ],
      originalDecisions: [true, true, false, true],
      ownOriginalPending: false,
      pending: {
        kind: 'discard',
        tile: 'p5',
        from: 3,
        discard: {
          tile: 'p5', chicken: 0, stage: 'normal', id: 7,
          firstChicken: false, followChicken: false, pre: false,
        },
        choices: { '2': 'pass' },
        waitingSeats: [0, 1],
      },
      ownOptions: {
        hu: true, peng: false, kong: false,
        restrictedHu: false, restrictedPeng: false,
        mandatory: false, h: 5, shapePoints: 0,
      },
      events: [{
        id: 7, seat: 3, kind: 'discard', text: '打出五筒',
        afterKong: false, tile: 'p5', chicken: 0, rush: 'normal',
      }],
      firstFixedDiscard: ['m1'],
      firstFixedPeng: false,
      firstYaoDiscard: false,
      seenChickenDiscards: ['p1'],
      waitRemainingMs: [15000, 9000, 15000, 15000],
    },
    ...overrides,
  }
}

describe('yaotong remote protocol', () => {
  it('rotates the local player to seat 0 and hides other hands', () => {
    const state = convertSnapshot(snapshot())
    expect(state.players).toHaveLength(4)
    expect(state.players[0].name).toBe('P1')
    expect(state.players[0].hand).toEqual([9, 10, 11])
    expect(state.players[0].drawn).toBe(11)
    expect(state.players[1].name).toBe('P2')
    expect(state.players[1].hand).toEqual([])
    expect(state.players[1].concealedTileCount).toBe(1)
    expect(state.dealer).toBe(1)
    expect(state.current).toBe(2)
    expect(state.originalDecisions).toEqual([true, false, true, true])
    expect(state.serial).toBe(7)
  })

  it('rotates pending seats, choices and own options', () => {
    const state = convertSnapshot(snapshot())
    expect(state.pending?.from).toBe(2)
    expect(state.pending?.tile).toBe(13)
    expect(state.pending?.choices).toEqual({ 1: 'pass' })
    expect(state.pending?.options[0]).toMatchObject({ hu: true, h: 5 })
    expect(state.events[0].seat).toBe(2)
    expect(state.events[0].tile).toBe(13)
    expect(state.waitRemainingMs).toEqual([9000, 15000, 15000, 15000])
  })

  it('rotates settlement and values', () => {
    const base = snapshot()
    const state = convertSnapshot({
      ...base,
      matchFinished: true,
      roundResult: {
        kind: 'win',
        winners: [0, 2],
        source: 3,
        winKind: 'discard',
        tile: 'p5',
        offender: null,
        reason: '点炮',
        indicator: 'm2',
        chicken: 'm3',
        ready: [true, false, true, false],
        deltas: [10, -20, 5, 5],
        nextDealer: 2,
        finished: true,
        transfers: [{
          from: 3, to: 0, account: '胡牌分', base: 10, multiplier: 1,
          amount: 10, reason: '胡牌',
        }],
        values: {
          '0': {
            h: 10, patternPoints: 5, patterns: [{ name: '硬胡', points: 10 }],
            naturalYaos: 0, winningYaoNatural: false, wildcards: 0,
            big: false, structure: 'standard', groups: [['m1', 'm2', 'm3']],
            resolvedHand: ['m1', 'm2', 'm3'],
          },
        },
      },
    })
    expect(state.result?.winners).toEqual([3, 1])
    expect(state.result?.source).toBe(2)
    expect(state.result?.nextDealer).toBe(1)
    expect(state.result?.deltas).toEqual([-20, 5, 5, 10])
    expect(state.result?.ready).toEqual([false, true, false, true])
    expect(state.result?.transfers[0]).toMatchObject({ from: 2, to: 3 })
    expect(state.result?.values[3].h).toBe(10)
    expect(state.result?.indicator).toBe(1)
    expect(state.result?.chicken).toBe(2)
  })

  it('serializes commands for the server', () => {
    expect(toActionPayload({ type: 'discard', index: 3, declare: true })).toEqual({
      type: 'discard', index: 3, declare: true,
    })
    expect(toActionPayload({ type: 'respond', action: 'pass' })).toEqual({
      type: 'respond', action: 'pass',
    })
    expect(toActionPayload({ type: 'kong', tile: 9 })).toEqual({
      type: 'kong', tile: 9,
    })
  })
})
