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
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('useYaotongRemoteGame', () => {
  it('大模型房的多个空位独立保存模型，开局前等待选择写入服务端', async () => {
    const scope = effectScope()
    const roomInfo = {
      roomId: 'ABC123', status: 'lobby', creatorSeat: 0, seats: [null, null, null, null],
      llmEnabled: true, llmAvailable: true, effectiveLlmEnabled: true,
    }
    const first = { seat: 1, providerId: 'deepseek', style: '稳健' }
    const second = { seat: 3, providerId: 'kimi', style: '高冷' }
    api.getRoom
      .mockResolvedValueOnce({ ...roomInfo, reservedSeats: [] })
      .mockResolvedValueOnce({ ...roomInfo, reservedSeats: [first, second] })
    api.reserveLlmSeat
      .mockResolvedValueOnce({ reservedSeats: [first] })
      .mockResolvedValueOnce({ reservedSeats: [first, second] })
    try {
      const game = scope.run(() => useYaotongRemoteGame({
        createPort: false,
        socketFactory: () => { socket = new FakeSocket(); return socket },
      }))!
      await game.createRoom(8, '甲', undefined, 'hard', true)
      expect(api.createRoom).toHaveBeenCalledWith(
        'east', 4, expect.any(String), 'yaotong', true, 8, 'hard',
      )
      expect(game.effectiveLlmEnabled.value).toBe(true)
      expect(game.reservedSeats.value).toEqual([])
      api.startRoom.mockImplementationOnce(async () => {
        expect(game.reservedSeats.value).toEqual([first, second])
        return { roomId: 'ABC123', status: 'playing' }
      })
      await Promise.all([
        game.reserveLlmSeat(1, 'deepseek', '稳健'),
        game.reserveLlmSeat(3, 'kimi', '高冷'),
        game.startMatch(),
      ])
      expect(api.reserveLlmSeat.mock.calls).toEqual([
        ['ABC123', 0, 'CODE', 1, 'deepseek', '稳健'],
        ['ABC123', 0, 'CODE', 3, 'kimi', '高冷'],
      ])
      expect(api.startRoom).toHaveBeenCalledOnce()
      expect(game.reservedSeats.value).toEqual([first, second])
      await game.leaveRoom()
      expect(game.reservedSeats.value).toEqual([])
      expect(game.effectiveLlmEnabled.value).toBe(false)
    } finally { scope.stop() }
  })

  it('普通玩家的本家形象按选择顺序同步，准备前等待最后一次更新', async () => {
    const scope = effectScope()
    api.joinRoom.mockResolvedValueOnce({
      roomId: 'ABC123', seat: 1, nickname: '乙', rejoinCode: 'GUEST',
      playerId: 'wakudemo-b', rejoin: false, characterId: 'qwen',
    })
    let finishFirst!: () => void
    const first = new Promise<void>(resolve => { finishFirst = resolve })
    api.updateCharacter
      .mockImplementationOnce(() => first)
      .mockResolvedValueOnce({ roomId: 'ABC123', seat: 1, characterId: 'doubao' })
    try {
      const game = scope.run(() => useYaotongRemoteGame({
        createPort: false,
        socketFactory: () => { socket = new FakeSocket(); return socket },
      }))!
      await game.joinRoom('ABC123', '乙', 'qwen')
      const setFirst = game.updateCharacter('gpt')
      const setLast = game.updateCharacter('doubao')
      const ready = game.ready()
      await Promise.resolve()
      expect(game.isCreator.value).toBe(false)
      expect(api.updateCharacter).toHaveBeenCalledExactlyOnceWith('ABC123', 1, 'GUEST', 'gpt')
      expect(api.readyRoom).not.toHaveBeenCalled()
      finishFirst()
      await Promise.all([setFirst, setLast, ready])
      expect(api.updateCharacter).toHaveBeenNthCalledWith(2, 'ABC123', 1, 'GUEST', 'doubao')
      expect(api.readyRoom).toHaveBeenCalledExactlyOnceWith('ABC123', 1, 'GUEST')
    } finally { scope.stop() }
  })

  it('模型台词按座位旋转显示，音频只播放当前小局的对应台词', async () => {
    vi.useFakeTimers()
    const scope = effectScope()
    const playLlmAudio = vi.fn()
    const stopLlmAudio = vi.fn()
    try {
      const game = scope.run(() => useYaotongRemoteGame({
        createPort: false, playLlmAudio, stopLlmAudio,
        socketFactory: () => { socket = new FakeSocket(); return socket },
      }))!
      await game.createRoom(8, '甲')
      socket.open()
      const active = snapshot({ seat: 2 })
      active.view.players[3].playerKind = 'llm'
      socket.server(active)
      const speech = { matchId: 'M1', round: 1, seat: 3 }
      const bubble = { kind: 'llm_message', ...speech, id: 1, text: '先走一步。' }
      const audioUrl = '/api/tts/audio/' + 'a'.repeat(64) + '.mp3'
      const audio = { kind: 'llm_audio', ...speech, messageId: 1, audioUrl, cached: true }
      socket.server({ ...bubble, round: 0 })
      socket.server({ ...bubble, seat: 0 })
      expect(game.llmBubbles.value).toEqual({})
      socket.server(bubble)
      expect(game.llmBubbles.value[1]).toEqual({ text: '先走一步。', id: 1 })
      socket.server({ ...audio, messageId: 2 })
      socket.server(audio)
      socket.server(audio)
      expect(playLlmAudio).toHaveBeenCalledExactlyOnceWith(expect.stringContaining(audioUrl), 1, 1, undefined, false)
      await vi.advanceTimersByTimeAsync(4000)
      expect(game.llmBubbles.value).toEqual({})

      socket.server({ ...bubble, id: 2 })
      stopLlmAudio.mockClear()
      socket.server({ ...active, round: 2, view: { ...active.view, handNumber: 2 } })
      expect(stopLlmAudio).toHaveBeenCalled()
      expect(game.llmBubbles.value).toEqual({})
      socket.server({ ...audio, messageId: 2 })
      expect(playLlmAudio).toHaveBeenCalledOnce()
    } finally { scope.stop() }
  })

  it('LLM 思考语音只在当前提示有效时播放，结束消息只清除自己的气泡', async () => {
    const scope = effectScope()
    const playLlmAudio = vi.fn()
    try {
      const game = scope.run(() => useYaotongRemoteGame({
        createPort: false, playLlmAudio,
        socketFactory: () => { socket = new FakeSocket(); return socket },
      }))!
      await game.createRoom(8, '甲')
      socket.open()
      const active = snapshot({ seat: 2 })
      active.view.players[3].playerKind = 'llm'
      socket.server(active)
      const speech = { matchId: 'M1', round: 1, seat: 3, messageId: 1 }
      const status = { kind: 'llm_status', ...speech, active: true, text: '让我想想怎么打。' }
      const audioUrl = '/api/tts/audio/' + 'a'.repeat(64) + '.mp3'
      const audio = { kind: 'llm_audio', ...speech, audioUrl, cached: true, priority: 'normal' }
      socket.server({ ...status, round: 0 })
      expect(game.llmBubbles.value).toEqual({})
      socket.server(status)
      expect(game.llmBubbles.value[1]).toEqual({ id: 1, text: status.text })
      socket.server(audio)
      socket.server({ ...status, active: false })
      expect(game.llmBubbles.value).toEqual({})
      socket.server({ ...status, messageId: 2 })
      socket.server({ ...status, messageId: 2, active: false })
      socket.server({ ...audio, messageId: 2 })
      expect(playLlmAudio).toHaveBeenCalledExactlyOnceWith(expect.stringContaining(audioUrl), 1, 1, 'normal', false)
      socket.server({ kind: 'llm_message', ...speech, id: 3, text: '这张先走。' })
      socket.server({ ...status, active: false })
      expect(game.llmBubbles.value[1]).toEqual({ id: 3, text: '这张先走。' })
    } finally { scope.stop() }
  })

  it('终局快照之后仍收当前赢家的 LLM 胡牌语音，旧小局和非赢家被过滤', async () => {
    const scope = effectScope()
    const playLlmAudio = vi.fn()
    try {
      const game = scope.run(() => useYaotongRemoteGame({
        createPort: false, playLlmAudio,
        socketFactory: () => { socket = new FakeSocket(); return socket },
      }))!
      await game.createRoom(8, '甲')
      socket.open()
      const finished = snapshot({
        matchFinished: true,
        roundResult: {
          kind: 'win', winners: [3], source: null, winKind: 'self', tile: 'm3',
          offender: null, reason: '自摸', indicator: null, chicken: null,
          ready: [false, false, false, false], deltas: [-5, -5, -5, 15], nextDealer: 3,
          finished: true, transfers: [], values: {},
        },
      })
      finished.view.phase = 'settled'
      finished.view.players[2].playerKind = 'llm'
      finished.view.players[3].playerKind = 'llm'
      socket.server(finished)
      expect(game.sessionStatus.value).toBe('finished')
      const speech = { matchId: 'M1', round: 1, seat: 3, purpose: 'action', actionKind: 'win', priority: 'important' }
      const audioUrl = '/api/tts/audio/' + 'a'.repeat(64) + '.mp3'
      socket.server({ kind: 'llm_message', ...speech, id: 1, text: '自摸！', seat: 2 })
      socket.server({ kind: 'llm_message', ...speech, id: 2, text: '自摸！', round: 0 })
      expect(game.llmBubbles.value).toEqual({})
      socket.server({ kind: 'llm_message', ...speech, id: 3, text: '自摸！' })
      const audio = { kind: 'llm_audio', ...speech, messageId: 3, audioUrl, cached: true }
      socket.server(audio)
      socket.server(audio)
      expect(game.llmBubbles.value[3]?.text).toBe('自摸！')
      expect(playLlmAudio).toHaveBeenCalledExactlyOnceWith(expect.stringContaining(audioUrl), 3, 3, 'important', true)
    } finally { scope.stop() }
  })

  it('LLM 小局感言只在对应小局结算后入队，败方的语音也能播放', async () => {
    const scope = effectScope()
    const playLlmAudio = vi.fn()
    try {
      const game = scope.run(() => useYaotongRemoteGame({
        createPort: false, playLlmAudio,
        socketFactory: () => { socket = new FakeSocket(); return socket },
      }))!
      await game.createRoom(8, '甲')
      socket.open()
      const active = snapshot()
      active.view.players[3].playerKind = 'llm'
      const speech = { matchId: 'M1', round: 1, seat: 3, purpose: 'round-reaction', priority: 'important' }
      const reaction = { kind: 'llm_message', ...speech, id: 1, text: '下局再来。', hasAudio: true }
      const audioUrl = '/api/tts/audio/' + 'a'.repeat(64) + '.mp3'
      const audio = { kind: 'llm_audio', ...speech, messageId: 1, audioUrl, cached: true }
      socket.server(active)
      socket.server(reaction)
      socket.server(audio)
      expect(game.llmBubbles.value).toEqual({})
      expect(playLlmAudio).not.toHaveBeenCalled()

      socket.server({
        ...active,
        view: { ...active.view, phase: 'settled' },
        roundResult: {
          kind: 'win', winners: [0], source: null, winKind: 'self', tile: 'm3',
          offender: null, reason: '自摸', indicator: null, chicken: null,
          ready: [false, false, false, false], deltas: [15, -5, -5, -5], nextDealer: 0,
          finished: false, transfers: [], values: {},
        },
      })
      socket.server({ ...reaction, round: 0 })
      socket.server(audio)
      expect(game.llmBubbles.value).toEqual({})
      expect(playLlmAudio).not.toHaveBeenCalled()
      socket.server(reaction)
      socket.server(audio)
      socket.server(audio)
      expect(game.llmBubbles.value[3]?.text).toBe(reaction.text)
      expect(playLlmAudio).toHaveBeenCalledExactlyOnceWith(expect.stringContaining(audioUrl), 3, 1, 'important', true)
    } finally { scope.stop() }
  })

  it.each(['peng', 'gang', 'concealed-kong', 'added-kong', 'ready', 'original-ready'])('LLM 动作 %s 合成失败时只保留角色气泡', async (actionKind) => {
    const scope = effectScope()
    const playLlmAudio = vi.fn().mockResolvedValue(true), playSound = vi.fn()
    try {
      const game = scope.run(() => useYaotongRemoteGame({
        createPort: false, playLlmAudio, playSound,
        socketFactory: () => { socket = new FakeSocket(); return socket },
      }))!
      await game.createRoom(8, '甲')
      socket.open()
      const active = snapshot()
      active.view.players[1].isLlm = true
      socket.server(active)
      const speech = { matchId: 'M1', round: 1, seat: 1, purpose: 'action', actionKind, priority: 'important' }
      const message = { kind: 'llm_message', ...speech, id: 1, text: '动作台词' }
      const audioUrl = '/api/tts/audio/' + 'a'.repeat(64) + '.mp3'
      const audio = { kind: 'llm_audio', ...speech, messageId: 1, audioUrl, cached: true }
      socket.server(message)
      socket.server(audio)
      await Promise.resolve()
      expect(playLlmAudio).toHaveBeenCalledExactlyOnceWith(expect.stringContaining(audioUrl), 1, 1, 'important', true)
      expect(playSound).not.toHaveBeenCalled()

      const failed = { ...message, id: 2, hasAudio: false }
      socket.server({ ...message, id: 2 })
      socket.server(failed)
      socket.server(failed)
      socket.server({ ...audio, messageId: 2 })
      expect(playSound).not.toHaveBeenCalled()
      expect(game.llmBubbles.value[1]).toEqual({ id: 2, text: message.text })
      expect(playLlmAudio).toHaveBeenCalledOnce()
    } finally { scope.stop() }
  })

  it.each(['self', 'discard', 'rob'] as const)('LLM 胡牌语音播放失败时只保留角色气泡（%s）', async (winKind) => {
    const scope = effectScope()
    const playLlmAudio = vi.fn().mockRejectedValue(new Error('media unavailable')), playSound = vi.fn()
    try {
      const game = scope.run(() => useYaotongRemoteGame({
        createPort: false, playLlmAudio, playSound,
        socketFactory: () => { socket = new FakeSocket(); return socket },
      }))!
      await game.createRoom(8, '甲')
      socket.open()
      const finished = snapshot({
        matchFinished: true,
        roundResult: {
          kind: 'win', winners: [3], source: winKind === 'self' ? null : 0, winKind, tile: 'm3',
          offender: null, reason: '', indicator: null, chicken: null,
          ready: [false, false, false, false], deltas: [-5, -5, -5, 15], nextDealer: 3,
          finished: true, transfers: [], values: {},
        },
      })
      finished.view.phase = 'settled'
      finished.view.players[3].playerKind = 'llm'
      socket.server(finished)
      const speech = { matchId: 'M1', round: 1, seat: 3, purpose: 'action', actionKind: 'win', priority: 'important' }
      const audioUrl = '/api/tts/audio/' + 'a'.repeat(64) + '.mp3'
      socket.server({ kind: 'llm_message', ...speech, id: 1, text: '胡了！' })
      socket.server({ kind: 'llm_audio', ...speech, messageId: 1, audioUrl, cached: true })
      await Promise.resolve()
      expect(playLlmAudio).toHaveBeenCalledOnce()
      expect(playSound).not.toHaveBeenCalled()
      expect(game.llmBubbles.value[3]?.text).toBe('胡了！')
    } finally { scope.stop() }
  })

  it('换局后丢弃迟到的 LLM 动作语音失败回调', async () => {
    const scope = effectScope()
    const playSound = vi.fn()
    let finishPlayback!: (played: boolean) => void
    const playback = new Promise<boolean>(resolve => { finishPlayback = resolve })
    try {
      const game = scope.run(() => useYaotongRemoteGame({
        createPort: false, playSound, playLlmAudio: () => playback,
        socketFactory: () => { socket = new FakeSocket(); return socket },
      }))!
      await game.createRoom(8, '甲')
      socket.open()
      const active = snapshot()
      active.view.players[1].playerKind = 'llm'
      socket.server(active)
      const speech = { matchId: 'M1', round: 1, seat: 1, purpose: 'action', actionKind: 'peng', priority: 'important' }
      socket.server({ kind: 'llm_message', ...speech, id: 1, text: '碰！' })
      socket.server({ kind: 'llm_audio', ...speech, messageId: 1, audioUrl: '/api/tts/audio/' + 'a'.repeat(64) + '.mp3', cached: true })
      socket.server({ ...active, round: 2, view: { ...active.view, handNumber: 2 } })
      finishPlayback(false)
      await playback
      expect(playSound).not.toHaveBeenCalled()
    } finally { scope.stop() }
  })

  it('联机互动只收当前小局的预设消息，并按本家视角换算发送和接收座位', async () => {
    const scope = effectScope()
    const onInteraction = vi.fn()
    try {
      const game = scope.run(() => useYaotongRemoteGame({
        createPort: false, onInteraction,
        socketFactory: () => { socket = new FakeSocket(); return socket },
      }))!
      await game.createRoom(8, '甲')
      socket.open()
      expect(game.sendQuickChat('hello')).toBe(false)
      const active = snapshot({ seat: 2 })
      socket.server(active)
      const hand = { matchId: active.matchId, round: active.round }
      expect(game.sendQuickChat('hello')).toBe(true)
      expect(game.sendEmote('tomato', 3)).toBe(true)
      expect(game.sendEmote('tomato', 0)).toBe(false)
      expect(socket.sent).toEqual([
        { ...hand, kind: 'quick_chat', phraseId: 'hello' },
        { ...hand, kind: 'emote', emote: 'tomato', targetSeat: 1 },
      ])

      const phrase = { ...hand, kind: 'quick_chat', phraseId: 'hello', fromSeat: 1 }
      const emote = { ...hand, kind: 'emote', emote: 'tomato', fromSeat: 1, targetSeat: 2 }
      socket.server({ ...phrase, round: 2 })
      socket.server({ ...phrase, phraseId: 'unknown' })
      socket.server({ ...emote, targetSeat: 4 })
      socket.server(phrase)
      socket.server(emote)
      expect(onInteraction.mock.calls.map(([event]) => event)).toEqual([
        { kind: 'quick_chat', fromSeat: 3, phrase: expect.objectContaining({ id: 'hello' }) },
        { kind: 'emote', fromSeat: 3, targetSeat: 0, emote: expect.objectContaining({ id: 'tomato' }) },
      ])

      socket.close()
      expect(game.sendEmote('tomato', 3)).toBe(false)
    } finally { scope.stop() }
  })

  it('按服务端本人剩余时间显示操作读秒，等期间冻结，续计与换局清理正确', async () => {
    vi.useFakeTimers()
    const scope = effectScope()
    try {
      const game = scope.run(() => useYaotongRemoteGame({
        createPort: false,
        socketFactory: () => { socket = new FakeSocket(); return socket },
      }))!
      await game.createRoom(8, '甲')
      socket.open()
      // 故意令服务端墙钟相差一天；显示应使用权威剩余时长。
      const active = snapshot({ decisionRemainingMs: 20000, decisionDeadlineAt: Date.now() + 86400000 })
      socket.server(active)
      expect(game.inner.decisionSeconds.value).toBe(20)
      await vi.advanceTimersByTimeAsync(7000)
      expect(game.inner.decisionSeconds.value).toBe(13)
      socket.server({ ...active, decisionRemainingMs: 13000, decisionPaused: true, holdSeats: [1] })
      await vi.advanceTimersByTimeAsync(5000)
      expect(game.inner.decisionSeconds.value).toBe(13)
      socket.server({ ...active, decisionRemainingMs: 13000, decisionPaused: false, holdSeats: [] })
      await vi.advanceTimersByTimeAsync(2000)
      expect(game.inner.decisionSeconds.value).toBe(11)
      socket.server({ ...active, decisionRemainingMs: 11000 })
      await vi.advanceTimersByTimeAsync(11000)
      expect(game.inner.decisionSeconds.value).toBe(0)
      // 读秒本身不能在客户端代打，服务端才有推进权。
      expect(socket.sent.some(message => message.kind === 'action')).toBe(false)
      socket.server(snapshot({ round: 2, decisionRemainingMs: 0 }))
      expect(game.inner.decisionSeconds.value).toBe(0)
    } finally { scope.stop() }
  })

  it('服务端等状态按本人座位同步，重复快照不延长，解除等待立即生效', async () => {
    vi.useFakeTimers()
    api.getRoom.mockResolvedValue({
      roomId: 'ABC123', status: 'playing', creatorSeat: 2,
      seats: [], yaotongMode: 'hard', matchLength: 8,
    })
    const scope = effectScope()
    try {
      const game = scope.run(() => useYaotongRemoteGame({
        createPort: false,
        socketFactory: () => { socket = new FakeSocket(); return socket },
      }))!
      await game.createRoom(8, '甲')
      socket.open()
      const held = snapshot({ seat: 2, yaotongMode: 'hard', holdSeats: [2] })
      held.view.waitRemainingMs[2] = 9000
      socket.server(held)
      expect(game.inner.holding.value).toBe(true)
      expect(game.inner.waitRemainingMs.value).toBe(9000)
      await vi.advanceTimersByTimeAsync(4000)
      held.view.waitRemainingMs[2] = 5000
      socket.server(held)
      await vi.advanceTimersByTimeAsync(5000)
      expect(game.inner.holding.value).toBe(false)
      expect(game.inner.waitRemainingMs.value).toBe(0)
      expect(socket.sent).toContainEqual({ kind: 'hold', holding: false })

      // 断线/托管释放后，剩余额度非零也必须退出本地等状态。
      held.view.waitRemainingMs[2] = 3000
      socket.server(held)
      expect(game.inner.holding.value).toBe(true)
      socket.server({ ...held, holdSeats: [1] })
      expect(game.inner.holding.value).toBe(false)
      expect(game.inner.waitRemainingMs.value).toBe(3000)
    } finally { scope.stop() }
  })

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

  it.each([false, true])('终局返回原房间，保留座位并可再开一场（新场快照已到: %s）', async (queued) => {
    const scope = effectScope()
    try {
      const game = scope.run(() => useYaotongRemoteGame({
        socketFactory: () => (socket = new FakeSocket()),
      }))!
      await game.createRoom(8, '甲')
      socket.open()
      const finished = snapshot({ matchFinished: true, roundResult: {
        kind: 'draw', winners: [], source: null, winKind: null, tile: null, offender: null,
        reason: '荒庄', indicator: null, chicken: null, ready: [false, false, false, false],
        deltas: [0, 0, 0, 0], nextDealer: 0, finished: true, transfers: [], values: {},
      } })
      finished.view.phase = 'settled'
      socket.server(finished)
      game.inner.autoplay.value = true

      const next = snapshot({ matchId: 'M2', opening: { dice: [1, 2], wallSide: 0, reservedStacks: 0 } })
      if (queued) {
        game.inner.showingSettlement.value = true
        socket.server(next)
        expect(game.inner.state.value?.remoteMatchId).toBe('M1')
      }

      game.port!.returnToLobby()
      expect(api.leaveRoom).not.toHaveBeenCalled()
      expect(game.roomId.value).toBe('ABC123')
      expect(game.mySeat.value).toBe(0)
      expect(game.storedSession.value?.rejoinCode).toBe('CODE')
      expect(game.inner.autoplay.value).toBe(true)
      expect(socket.readyState).toBe(FakeSocket.OPEN)

      // 重连或迟到的终局消息不能把用户从房间面板拉回排名。
      socket.server(finished)
      socket.server({ kind: 'match_finished' })
      expect(game.inner.state.value).toBeNull()
      expect(game.sessionStatus.value).toBe('lobby')

      if (!queued) {
        await game.startMatch()
        expect(api.startRoom).toHaveBeenCalledWith('ABC123', undefined, 'wakudemo-a')
        socket.server(next)
      }
      await Promise.resolve()
      expect(game.inner.state.value?.remoteMatchId).toBe('M2')
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
