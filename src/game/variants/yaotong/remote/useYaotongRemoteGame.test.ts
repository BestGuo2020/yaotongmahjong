import { effectScope } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useYaotongRemoteGame } from './useYaotongRemoteGame'
import type { YtSnapshot } from './protocol'

const api = vi.hoisted(() => ({
  createRoom: vi.fn(),
  getRoom: vi.fn(),
  joinRoom: vi.fn(),
  leaveRoom: vi.fn(),
  readyRoom: vi.fn(),
  startRoom: vi.fn(),
  updateCharacter: vi.fn(),
  reserveLlmSeat: vi.fn(),
}))

vi.mock('../../../online/api/roomApi', () => api)

class FakeSocket {
  static OPEN = 1
  readyState = 0
  onopen: ((event?: unknown) => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: ((event?: unknown) => void) | null = null
  onerror: ((event?: unknown) => void) | null = null
  sent: Array<Record<string, unknown>> = []

  send(data: string) {
    const message = JSON.parse(data) as Record<string, unknown>
    if (message.type !== 'ping') this.sent.push(message)
  }

  close() {
    this.readyState = 3
    this.onclose?.({})
  }

  open() {
    this.readyState = FakeSocket.OPEN
    this.onopen?.({})
  }

  server(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) })
  }
}

let socket: FakeSocket

function player(seat: number) {
  return {
    seat, name: `P${seat}`, avatar: '', characterId: 'deepseek',
    playerKind: 'human' as const, isLlm: false, score: 0,
    hand: ['m1', 'm2', 'm3'], concealedTileCount: 3,
    melds: [], river: [], declaration: 'none' as const,
    draws: 0, discards: 0, drawn: null, afterKong: false, burned: false,
    passedHu: null, chickenPeng: [], chickenDiscard: [],
  }
}

function snapshot(overrides: Partial<YtSnapshot> = {}): YtSnapshot {
  return {
    kind: 'yt_snapshot', roomId: 'ABC123', matchId: 'M1',
    rulesetId: 'yaotong', seat: 0, round: 1, dealer: 0,
    matchLength: 8, matchFinished: false, opening: null,
    roundResult: null,
    view: {
      seat: 0, phase: 'original', dealer: 0, current: 0, serial: 1,
      wallCount: 56, dice: [1, 2], wallSide: 0, reservedStacks: 0,
      matchLength: 8, dealerRound: 1, handNumber: 1, repeats: 0,
      players: [player(0), player(1), player(2), player(3)],
      originalDecisions: [false, false, false, false],
      ownOriginalPending: true,
      pending: null,
      ownOptions: null,
      events: [],
      firstFixedDiscard: [], firstFixedPeng: false,
      firstYaoDiscard: false, seenChickenDiscards: [],
      waitRemainingMs: [15000, 15000, 15000, 15000],
    },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  api.createRoom.mockResolvedValue({
    roomId: 'ABC123', rulesetId: 'yaotong', matchLength: 8,
    capacity: 4, status: 'lobby', creatorSeat: 0, seats: [null, null, null, null],
  })
  api.joinRoom.mockResolvedValue({
    roomId: 'ABC123', seat: 0, nickname: '甲', rejoinCode: 'CODE',
    playerId: 'wakudemo-a', rejoin: false,
  })
  api.getRoom.mockResolvedValue({
    roomId: 'ABC123', rulesetId: 'yaotong', matchLength: 8,
    capacity: 4, status: 'lobby', creatorSeat: 0,
    seats: [{
      seat: 0, nickname: '甲', ready: true, connected: true,
    }, null, null, null],
  })
  api.leaveRoom.mockResolvedValue({ roomId: 'ABC123', seat: 0, left: true })
  api.readyRoom.mockResolvedValue({ roomId: 'ABC123', seat: 0, ready: true })
  api.startRoom.mockResolvedValue({ roomId: 'ABC123', status: 'playing' })
})

describe('useYaotongRemoteGame', () => {
  it('creates/joins a room, receives snapshots and sends actions', async () => {
    const scope = effectScope()
    const game = scope.run(() => useYaotongRemoteGame({
      createPort: false,
      socketFactory: () => {
        socket = new FakeSocket()
        return socket
      },
    }))!

    await game.createRoom(8, '甲')
    expect(api.createRoom).toHaveBeenCalledWith(
      'east', 4, expect.any(String), 'yaotong', false, 8)
    expect(game.roomId.value).toBe('ABC123')
    expect(game.mySeat.value).toBe(0)
    expect(game.rejoinCode.value).toBe('CODE')

    socket.open()
    socket.server({
      kind: 'rejoin_ok', seat: 0, nickname: '甲',
      rulesetId: 'yaotong', matchLength: 8,
    })
    expect(game.sessionStatus.value).toBe('lobby')

    socket.server(snapshot({
      opening: { dice: [1, 2], wallSide: 0, reservedStacks: 0 },
    }))
    expect(game.inner.state.value?.players[0].hand).toEqual([0, 1, 2])
    expect(game.sessionStatus.value).toBe('playing')
    expect(socket.sent).toContainEqual({ kind: 'opening_done', round: 1 })

    game.inner.dispatch({ type: 'original', declare: false })
    expect(socket.sent).toContainEqual({
      kind: 'action', action: { type: 'original', declare: false },
    })

    socket.server(snapshot({
      matchFinished: false,
      roundResult: {
        kind: 'win', winners: [0], source: 1, winKind: 'discard',
        tile: 'm1', offender: null, reason: '胡牌', indicator: 'm2',
        chicken: 'm3', ready: [true, false, false, false],
        deltas: [10, -10, 0, 0], nextDealer: 0, finished: false,
        transfers: [], values: {},
      },
    }))
    expect(game.waitingNextRound.value).toBe(true)
    game.inner.next()
    expect(socket.sent).toContainEqual({ kind: 'continue', round: 1 })

    await game.leaveRoom()
    expect(api.leaveRoom).toHaveBeenCalled()
    expect(game.sessionStatus.value).toBe('idle')
    expect(game.roomId.value).toBe('')
    scope.stop()
  })
})
