import { effectScope } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useYaotongRemoteGame } from './useYaotongRemoteGame'
import type { YtSnapshot } from './protocol'
import { createRemoteSessionStore } from '../../../online/session/remoteSessionStore'

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
    yaotongMode: 'easy', capacity: 4, status: 'lobby',
    creatorSeat: 0, seats: [null, null, null, null],
  })
  api.joinRoom.mockResolvedValue({
    roomId: 'ABC123', seat: 0, nickname: '甲', rejoinCode: 'CODE',
    playerId: 'wakudemo-a', rejoin: false,
  })
  api.getRoom.mockResolvedValue({
    roomId: 'ABC123', rulesetId: 'yaotong', matchLength: 8,
    yaotongMode: 'easy', capacity: 4, status: 'lobby', creatorSeat: 0,
    seats: [{
      seat: 0, nickname: '甲', ready: true, connected: true,
    }, null, null, null],
  })
  api.leaveRoom.mockResolvedValue({ roomId: 'ABC123', seat: 0, left: true })
  api.readyRoom.mockResolvedValue({ roomId: 'ABC123', seat: 0, ready: true })
  api.startRoom.mockResolvedValue({ roomId: 'ABC123', status: 'playing' })
})
afterEach(() => vi.unstubAllGlobals())

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
      'east', 4, expect.any(String), 'yaotong', false, 8, 'easy')
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
    expect(game.pendingOpeningRound.value).toBe(1)
    game.ackOpening(1)
    expect(game.pendingOpeningRound.value).toBeNull()
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
    expect(game.waitingNextRound.value).toBe(false)
    game.inner.next()
    expect(game.waitingNextRound.value).toBe(true)
    expect(socket.sent).toContainEqual({ kind: 'continue', round: 1 })
    game.inner.next()
    expect(socket.sent.filter(message => message.kind === 'continue')).toHaveLength(1)

    await game.leaveRoom()
    expect(api.leaveRoom).toHaveBeenCalled()
    expect(game.sessionStatus.value).toBe('idle')
    expect(game.roomId.value).toBe('')
    scope.stop()
  })

  it('loads the saved room for the lobby resume button without connecting', () => {
    const data = new Map<string, string>()
    vi.stubGlobal('window', { localStorage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
      removeItem: (key: string) => data.delete(key),
    } })
    createRemoteSessionStore().saveSession({ roomId: 'ABC123', rejoinCode: 'CODE',
      nickname: '甲', playerId: 'p0', mode: 'east', rulesetId: 'yaotong', yaotongMode: 'hard' })
    const scope = effectScope(), factory = vi.fn()
    const game = scope.run(() => useYaotongRemoteGame({ createPort: false, socketFactory: factory }))!
    expect(game.storedSession.value?.roomId).toBe('ABC123')
    expect(game.roomId.value).toBe('')
    expect(factory).not.toHaveBeenCalled()
    scope.stop()
  })

  it('uses authoritative continue confirmations and clears them in the next round', async () => {
    const scope = effectScope()
    const game = scope.run(() => useYaotongRemoteGame({ createPort: false,
      socketFactory: () => (socket = new FakeSocket()),
    }))!
    try {
      await game.createRoom(8, '甲')
      socket.open()
      const end = snapshot({ roundResult: {
        kind: 'draw', winners: [], source: null, winKind: null, tile: null, offender: null,
        reason: '荒庄', indicator: null, chicken: null, ready: [false, false, false, false],
        deltas: [0, 0, 0, 0], nextDealer: 0, finished: false, transfers: [], values: {},
      }, continuation: { requiredSeats: [0, 1], readySeats: [1] } })
      socket.server(end)
      expect(game.waitingNextRound.value).toBe(false)
      socket.readyState = 3
      game.inner.next()
      expect(game.waitingNextRound.value).toBe(false)
      socket.open()
      game.inner.next()
      expect(game.waitingNextRound.value).toBe(true)
      socket.server({ ...end, continuation: { requiredSeats: [0, 1], readySeats: [0] } })
      expect(game.waitingNextRound.value).toBe(true)
      socket.server(snapshot({ round: 2 }))
      expect(game.waitingNextRound.value).toBe(false)
    } finally { scope.stop() }
  })

  it('resends a completed opening acknowledgement after reconnect without replaying it', async () => {
    const scope = effectScope()
    const game = scope.run(() => useYaotongRemoteGame({ createPort: false,
      socketFactory: () => (socket = new FakeSocket()),
    }))!
    try {
      await game.createRoom(8, '甲')
      socket.open()
      const opening = snapshot({ opening: { dice: [1, 2], wallSide: 0, reservedStacks: 0 } })
      socket.server(opening)
      socket.readyState = 3
      game.ackOpening(1)
      expect(game.pendingOpeningRound.value).toBe(1)
      expect(socket.sent).not.toContainEqual({ kind: 'opening_done', round: 1 })
      socket.open()
      socket.server(opening)
      expect(game.pendingOpeningRound.value).toBeNull()
      expect(socket.sent).toContainEqual({ kind: 'opening_done', round: 1 })
      socket.server({ ...opening, matchId: 'new-match' })
      expect(game.pendingOpeningRound.value).toBe(1)
    } finally { scope.stop() }
  })

  it('waits for terminal faces and freezes the terminal table until continue', async () => {
    const scope = effectScope()
    const game = scope.run(() => useYaotongRemoteGame({ createPort: false,
      socketFactory: () => (socket = new FakeSocket()),
    }))!
    try {
      await game.createRoom(8, '甲')
      socket.open()
      socket.server(snapshot())
      const live = game.inner.state.value
      const terminal = snapshot({ roundResult: {
        kind: 'draw', winners: [], source: null, winKind: null, tile: null, offender: null,
        reason: '荒庄', indicator: null, chicken: null, ready: [false, false, false, false],
        deltas: [0, 0, 0, 0], nextDealer: 0, finished: false, transfers: [], values: {},
      } })
      terminal.view.phase = 'settled'
      const incomplete = structuredClone(terminal)
      incomplete.view.players.slice(1).forEach(player => { player.hand = [] })
      socket.server(incomplete)
      expect(game.inner.state.value).toBe(live)
      expect(game.inner.paused.value).toBe(true)
      expect(game.sessionError.value).toContain('手牌')
      socket.server(terminal)
      expect(game.sessionError.value).toBe('')
      expect(game.inner.state.value!.players.map(player => player.hand.length)).toEqual([3, 3, 3, 3])
      game.inner.showingSettlement.value = true
      const settled = game.inner.state.value
      socket.server(incomplete)
      expect(game.inner.state.value).toBe(settled)
      const next = snapshot({ round: 2, opening: { dice: [1, 2], wallSide: 0, reservedStacks: 0 } })
      next.view.handNumber = 2
      socket.server(next)
      expect(game.inner.state.value).toBe(settled)
      expect(game.pendingOpeningRound.value).toBeNull()
      game.inner.next()
      expect(game.inner.state.value!.handNumber).toBe(2)
      expect(game.pendingOpeningRound.value).toBe(2)
      expect(socket.sent.filter(message => message.kind === 'continue')).toHaveLength(0)
    } finally { scope.stop() }
  })
})
