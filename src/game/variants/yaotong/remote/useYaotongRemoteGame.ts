// 幺筒 WS 服务端权威联机：房间生命周期 + yt_snapshot → useYaotongPort。
//
// 真人 + 服务端 AI 补位；回放按已收到的权威快照录制。房间 REST 与 wakudemo 登录
// 复用 src/game/online；对局协议走本目录的 protocol.ts。
import { computed, onScopeDispose, ref, watch } from 'vue'

import { API_BASE } from '../../../online/api/httpClient'
import {
  closeRoom as closeRoomApi,
  createRoom as createRoomApi,
  getRoom,
  joinRoom as joinRoomApi,
  leaveRoom as leaveRoomApi,
  readyRoom,
  reserveLlmSeat as reserveLlmSeatApi,
  startRoom,
  updateCharacter as updateCharacterApi,
  type LlmSeatRequest,
  type RoomSeatState,
  type ServerLlmStyle,
  type YaotongRoomMode,
} from '../../../online/api/roomApi'
import {
  createRemoteSessionStore,
  generateGuestId,
  type StoredSession,
} from '../../../online/session/remoteSessionStore'
import { decodeServerMessage } from '../../../online/protocol/decoder'
import { createRoomSocketTransport } from '../../../online/transport/roomSocket'
import type { YaotongEmoteId } from '../emotes'
import { useYaotongGame } from '../useYaotongGame'
import { useYaotongPort } from '../useYaotongPort'
import {
  convertSnapshot, hasCompleteSettlementHands, isYtSeat, readYtInteraction, toActionPayload, toLocalSeat,
  type YtInteraction, type YtSnapshot,
} from './protocol'

const remoteSessionStore = createRemoteSessionStore()
const WS_BASE = API_BASE.replace(/^http/, 'ws')

export type YaotongRemoteSessionStatus =
  | 'idle' | 'creating' | 'joining' | 'lobby' | 'playing' | 'finished' | 'error'

export interface YaotongRemoteGameOptions {
  playSound?: (file: string, volume?: number) => unknown
  playSoundAndWait?: (file: string, volume?: number) => Promise<void>
  playLlmAudio?: (url: string, seat: number, id: number, priority?: 'normal' | 'important', queueImportant?: boolean) => void | Promise<unknown>
  stopLlmAudio?: () => void
  getCharacterId?: () => string
  socketFactory?: Parameters<typeof createRoomSocketTransport>[0]['socketFactory']
  onInteraction?: (event: YtInteraction) => void
  /** App 用 hybrid source 时只取 inner，不再单独创建一份 port。 */
  createPort?: boolean
}

const ERROR_TEXT: Record<string, string> = {
  ROOM_LIMIT_REACHED: '房间已满',
  ROOM_FULL: '房间已满',
  ALREADY_IN_ROOM: '你已在房间中，请先离开当前房间',
  SEATS_RESERVED: '房主已把空位预留给大模型，请换一间房',
  INVALID_CAPACITY: '幺筒房间必须是四人桌',
  LLM_NOT_ENABLED: '本房间未启用大模型补位',
  INVALID_LLM_SEATS: '所选模型当前不可用',
  SEAT_OCCUPIED: '该座位已有玩家',
  ROOM_CLOSED: '房间已关闭',
  MATCH_FINISHING: '上一场仍在收尾，请稍后再试',
  NOT_CREATOR: '只有房主可以开始对局',
}

function readableError(error: unknown, fallback: string): string {
  if (error instanceof Error) return ERROR_TEXT[error.message] ?? error.message
  return fallback
}

export function useYaotongRemoteGame(options: YaotongRemoteGameOptions = {}) {
  const sessionStatus = ref<YaotongRemoteSessionStatus>('idle')
  const sessionError = ref('')
  const roomId = ref('')
  const mySeat = ref(-1)
  const nickname = ref('')
  const playerId = ref(remoteSessionStore.loadGuestId() || generateGuestId())
  remoteSessionStore.saveGuestId(playerId.value)
  const rejoinCode = ref('')
  const isCreator = ref(false)
  const creatorSeat = ref<number | null>(null)
  const roomSeats = ref<Array<RoomSeatState | null>>([])
  const reservedSeats = ref<Array<LlmSeatRequest>>([])
  const llmEnabled = ref(false)
  const llmAvailable = ref(false)
  const effectiveLlmEnabled = ref(false)
  const roomStatus = ref<'lobby' | 'playing' | 'finished' | 'error' | 'closed'>('lobby')
  const matchLength = ref<4 | 8 | 16>(4)
  const yaotongMode = ref<YaotongRoomMode>('easy')
  const savedSession = remoteSessionStore.loadSession()
  const storedSession = ref<StoredSession | null>(savedSession?.rulesetId === 'yaotong' ? savedSession : null)
  const waitingNextRound = ref(false)
  const pendingOpeningRound = ref<number | null>(null)
  const currentRound = ref(0)
  const llmBubbles = ref<Record<number, { id: number; text: string }>>({})
  const llmBubbleTimers = new Map<number, ReturnType<typeof setTimeout>>()
  const pendingOrderedSpeech = new Map<number, { seat: number; expiresAt: number }>()
  const playedLlmAudio = new Set<number>()
  let lastOpeningKey = ''
  let completedOpeningKey = ''
  let pendingSnapshot: YtSnapshot | null = null
  let returnedMatchId: string | undefined
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let seatWrites = Promise.resolve()
  let seatRevision = 0

  function saveSession() {
    storedSession.value = {
      roomId: roomId.value,
      rejoinCode: rejoinCode.value,
      nickname: nickname.value,
      playerId: playerId.value,
      mode: 'east',
      rulesetId: 'yaotong',
      matchLength: matchLength.value,
      yaotongMode: yaotongMode.value,
    }
    remoteSessionStore.saveSession(storedSession.value)
  }

  function clearLlmSpeech() {
    for (const timer of llmBubbleTimers.values()) clearTimeout(timer)
    llmBubbleTimers.clear()
    llmBubbles.value = {}
    pendingOrderedSpeech.clear()
    playedLlmAudio.clear()
    options.stopLlmAudio?.()
  }

  function clearLlmBubble(seat: number, id: number) {
    if (llmBubbles.value[seat]?.id !== id) return
    clearTimeout(llmBubbleTimers.get(seat))
    llmBubbleTimers.delete(seat)
    const next = { ...llmBubbles.value }
    delete next[seat]
    llmBubbles.value = next
  }

  function showLlmBubble(seat: number, id: number, text: string) {
    clearTimeout(llmBubbleTimers.get(seat))
    llmBubbles.value = { ...llmBubbles.value, [seat]: { id, text } }
    llmBubbleTimers.set(seat, setTimeout(() => clearLlmBubble(seat, id), 4000))
  }

  function handleLlmSpeech(message: unknown) {
    const state = inner.state.value
    const scope = message as { matchId?: unknown; round?: unknown; messageId?: unknown }
    if (!state || socket.status.value !== 'connected' || scope.matchId !== state.remoteMatchId
        || scope.round !== state.handNumber) return
    const speech = decodeServerMessage(message)
    if (speech?.kind !== 'llm_message' && speech?.kind !== 'llm_audio' && speech?.kind !== 'llm_status') return
    const seat = toLocalSeat(speech.seat, mySeat.value)
    if (state.players[seat]?.playerKind !== 'llm') return
    if (speech.kind === 'llm_status') {
      const id = scope.messageId
      if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) return
      if (speech.active && speech.text && interactionsAvailable.value) showLlmBubble(seat, id, speech.text)
      if (!speech.active) clearLlmBubble(seat, id)
      return
    }
    const isAction = speech.purpose === 'action'
    const isRoundReaction = speech.purpose === 'round-reaction'
    const ordered = isAction || isRoundReaction
    // 胡牌消息在结算快照之后到达，本局赢家仍可完成动作语音。
    const isWinSpeech = isAction && speech.actionKind === 'win'
    if (isRoundReaction) {
      if (!state.result) return
    } else if (isWinSpeech ? !state.result?.winners.includes(seat) : !interactionsAvailable.value) return
    if (speech.kind === 'llm_message') {
      if (isAction && speech.hasAudio === false) {
        // 合成失败是对已发气泡的补充通知。保留台词，收掉该条语音的等待。
        if (pendingOrderedSpeech.get(speech.id)?.seat === seat) pendingOrderedSpeech.delete(speech.id)
        return
      }
      showLlmBubble(seat, speech.id, speech.text)
      if (ordered && speech.hasAudio !== false) pendingOrderedSpeech.set(speech.id, { seat, expiresAt: Date.now() + 6_000 })
      return
    }
    const { messageId } = speech
    const pending = pendingOrderedSpeech.get(messageId)
    const matches = ordered
      ? pending?.seat === seat && pending.expiresAt > Date.now()
      : llmBubbles.value[seat]?.id === messageId
    if (!matches || playedLlmAudio.has(messageId)) return
    pendingOrderedSpeech.delete(messageId)
    playedLlmAudio.add(messageId)
    const playback = options.playLlmAudio?.(API_BASE + speech.audioUrl, seat, messageId, speech.priority, ordered)
    if (playback) void playback.catch(() => { /* 气泡继续展示 */ })
  }

  function handleMessage(message: unknown) {
    const kind = (message as { kind?: unknown })?.kind
    if (kind === 'rejoin_ok') {
      const payload = message as {
        seat?: number; nickname?: string; matchLength?: 4 | 8 | 16
        yaotongMode?: YaotongRoomMode
      }
      if (typeof payload.seat === 'number') mySeat.value = payload.seat
      if (typeof payload.nickname === 'string') nickname.value = payload.nickname
      if (payload.matchLength) matchLength.value = payload.matchLength
      if (payload.yaotongMode) {
        yaotongMode.value = payload.yaotongMode
        inner.mode.value = payload.yaotongMode
      }
      socket.confirmSession()
      sessionError.value = ''
      sessionStatus.value = roomStatus.value === 'playing' ? 'playing' : 'lobby'
      void refreshRoom().catch(() => { /* WS 快照仍可恢复对局 */ })
      if (inner.autoplay.value) socket.send({ kind: 'auto', enabled: true })
      return
    }
    if (kind === 'yt_snapshot') {
      const snapshot = message as YtSnapshot
      if (snapshot.matchFinished && returnedMatchId === (snapshot.matchId ?? snapshot.roomId)) return
      if (!hasCompleteSettlementHands(snapshot)) {
        // 旧服务或不完整终局包不能让三家的牌背消失，也不能冲掉已收到的终局牌面。
        if (!inner.showingSettlement.value) inner.paused.value = true
        sessionError.value = '结算手牌尚未完整同步'
        return
      }
      sessionError.value = ''
      const current = inner.state.value
      const sameHand = current?.remoteMatchId === (snapshot.matchId ?? snapshot.roomId)
        && current.handNumber === snapshot.round
      if (inner.showingSettlement.value && !sameHand && !waitingNextRound.value) {
        // 对齐经典 WS：结算演出/阅览期间的下一局，只暂存，不替换牌桌。
        pendingSnapshot = snapshot
        return
      }
      if (typeof snapshot.seat === 'number') mySeat.value = snapshot.seat
      if (snapshot.matchLength) matchLength.value = snapshot.matchLength
      if (snapshot.yaotongMode) {
        yaotongMode.value = snapshot.yaotongMode
        inner.mode.value = snapshot.yaotongMode
      }
      currentRound.value = snapshot.round
      if (snapshot.view?.players?.length === 4
          && snapshot.view.phase !== 'lobby') {
        try {
          if (!sameHand || !inner.showingSettlement.value) {
            inner.acceptRemoteState(convertSnapshot(snapshot), snapshot.holdSeats?.includes(snapshot.seat))
          }
        } catch (error) {
          sessionError.value = error instanceof Error
            ? error.message : '联机快照解析失败'
          sessionStatus.value = 'error'
          return
        }
        sessionStatus.value = snapshot.matchFinished ? 'finished' : 'playing'
        roomStatus.value = snapshot.matchFinished ? 'finished' : 'playing'
        waitingNextRound.value = Boolean(
          snapshot.roundResult && !snapshot.matchFinished
          && snapshot.continuation?.readySeats.includes(snapshot.seat))
      } else {
        sessionStatus.value = 'lobby'
      }
      const openingKey = `${snapshot.matchId ?? snapshot.roomId}:${snapshot.round}`
      if (snapshot.opening && lastOpeningKey !== openingKey) {
        lastOpeningKey = openingKey
        // 等本家把单机同款开局演出播完，再由 App 回执，服务端才开原报窗。
        pendingOpeningRound.value = snapshot.round
      } else if (snapshot.opening && completedOpeningKey === openingKey) {
        // 演出已结束但回执遇到断线：按重连快照补发，不重播掷骰发牌。
        if (socket.send({ kind: 'opening_done', round: snapshot.round })) pendingOpeningRound.value = null
      }
      return
    }
    if (kind === 'llm_message' || kind === 'llm_audio' || kind === 'llm_status') {
      handleLlmSpeech(message)
      return
    }
    if (kind === 'quick_chat' || kind === 'emote') {
      const state = inner.state.value
      if (state?.remoteMatchId && interactionsAvailable.value) {
        const event = readYtInteraction(message, mySeat.value, state.remoteMatchId, state.handNumber)
        if (event) options.onInteraction?.(event)
      }
      return
    }
    if (kind === 'match_finished') {
      if (returnedMatchId !== undefined && !inner.state.value) return
      sessionStatus.value = 'finished'
      roomStatus.value = 'finished'
      waitingNextRound.value = false
      return
    }
    if (kind === 'room_closed') {
      resetSession()
      return
    }
    if (kind === 'rejoin_err') {
      const code = String((message as { code?: unknown })?.code ?? '')
      if (code === 'ROOM_NOT_FOUND' || code === 'REJOIN_CODE_INVALID') {
        resetSession()
      } else {
        sessionError.value = ERROR_TEXT[code] ?? code
      }
      return
    }
    if (kind === 'error') {
      const code = String((message as { code?: unknown })?.code ?? 'UNKNOWN')
      if (code === 'AUTH_REQUIRED') {
        window.dispatchEvent(new Event('wakudemo-auth-required'))
        return
      }
      if (code === 'STALE_INTERACTION' || code === 'INTERACTION_RATE_LIMITED') return
      if (code === 'INVALID_ACTION' || code === 'STALE_ACTION'
          || code === 'PROTECTED_ACTION' || code === 'TABLE_HELD'
          || code === 'HOLD_ACTION_NOT_ALLOWED'
          || code === 'NO_HOLD_BUDGET') {
        // 服务端窗口已推进/已自动跳过原报/新手模式已拦截输入时，迟到提交是预期竞态。
        console.warn(`[yaotong] 动作被服务端拒绝（预期竞态）：${code}`)
        return
      }
      sessionError.value = ERROR_TEXT[code] ?? code
    }
  }

  const socket = createRoomSocketTransport({
    getUrl: () => roomId.value && rejoinCode.value
      ? `${WS_BASE}/ws/room/${encodeURIComponent(roomId.value)}`
        + `?rejoin_code=${encodeURIComponent(rejoinCode.value)}`
      : null,
    onMessage: handleMessage,
    socketFactory: options.socketFactory,
  })

  const inner = useYaotongGame({
    externalAuthority: {
      send: (command) => {
        socket.send({ kind: 'action', action: toActionPayload(command) })
      },
      nextRound: () => {
        if (waitingNextRound.value || !inner.state.value?.result || inner.state.value.result.finished) return
        if (pendingSnapshot) {
          const snapshot = pendingSnapshot
          pendingSnapshot = null
          waitingNextRound.value = true
          handleMessage(snapshot)
          return
        }
        // 仅发送成功才禁用按钮；重连快照会恢复服务端的实际确认状态。
        if (socket.send({ kind: 'continue', round: currentRound.value })) waitingNextRound.value = true
      },
      leave: (finishedMatchId) => {
        if (finishedMatchId === undefined) {
          void leaveRoom()
          return
        }
        returnedMatchId = finishedMatchId
        sessionStatus.value = 'lobby'
        waitingNextRound.value = false
        pendingOpeningRound.value = null

        const nextSnapshot = pendingSnapshot
        pendingSnapshot = null
        if (nextSnapshot) {
          // 房主可能已经开了下一场，等结算页完成复位后再处理新开局。
          queueMicrotask(() => {
            if (roomId.value === nextSnapshot.roomId && !inner.state.value) handleMessage(nextSnapshot)
          })
        }
      },
      openingDone: (round) => {
        socket.send({ kind: 'opening_done', round })
      },
      auto: (enabled) => {
        socket.send({ kind: 'auto', enabled })
      },
      hold: (holding) => {
        socket.send({ kind: 'hold', holding })
      },
    },
  })

  watch([
    () => inner.state.value?.remoteMatchId,
    () => inner.state.value?.handNumber,
    () => inner.state.value?.phase === 'settled',
    socket.status,
  ], clearLlmSpeech, { flush: 'sync' })

  const interactionsAvailable = computed(() => {
    const state = inner.state.value
    return socket.status.value === 'connected' && sessionStatus.value === 'playing'
      && isYtSeat(mySeat.value) && Boolean(state?.remoteMatchId && state.phase !== 'settled')
  })

  function sendInteraction(message:
    | { kind: 'quick_chat'; phraseId: string }
    | { kind: 'emote'; emote: YaotongEmoteId; targetSeat: number }): boolean {
    const state = inner.state.value
    return Boolean(interactionsAvailable.value && state && socket.send({
      ...message, matchId: state.remoteMatchId, round: state.handNumber,
    }))
  }

  function sendQuickChat(phraseId: string): boolean {
    return sendInteraction({ kind: 'quick_chat', phraseId })
  }

  function sendEmote(emote: YaotongEmoteId, targetSeat: number): boolean {
    if (!isYtSeat(targetSeat) || targetSeat === 0) return false
    return sendInteraction({ kind: 'emote', emote, targetSeat: (mySeat.value + targetSeat) % 4 })
  }

  const port = options.createPort === false ? null : useYaotongPort({
    playSound: options.playSound,
    playSoundAndWait: options.playSoundAndWait,
    getCharacterId: options.getCharacterId,
  }, inner)

  function startPolling() {
    stopPolling()
    pollTimer = setInterval(() => {
      if (!roomId.value) return
      void refreshRoom().catch(() => { /* 下一轮再试 */ })
    }, 1500)
  }

  function stopPolling() {
    if (pollTimer !== null) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  async function refreshRoom() {
    if (!roomId.value) return
    const requestedRoom = roomId.value
    const revision = seatRevision
    const info = await getRoom(requestedRoom)
    if (roomId.value !== requestedRoom) return
    roomSeats.value = info.seats
    if (seatRevision === revision) reservedSeats.value = info.reservedSeats ?? []
    llmEnabled.value = info.llmEnabled === true
    llmAvailable.value = info.llmAvailable === true
    effectiveLlmEnabled.value = info.effectiveLlmEnabled === true
    roomStatus.value = info.status
    creatorSeat.value = info.creatorSeat
    isCreator.value = info.creatorSeat === mySeat.value
    if (info.matchLength) matchLength.value = info.matchLength
    if (info.yaotongMode) {
      yaotongMode.value = info.yaotongMode
      inner.mode.value = info.yaotongMode
    }
    // 入桌与小局状态由 WS 快照决定，不能被先发后到的大厅轮询覆盖。
    if (!inner.state.value && info.status === 'lobby') sessionStatus.value = 'lobby'
  }

  function ackOpening(round: number) {
    if (pendingOpeningRound.value !== round) return
    completedOpeningKey = lastOpeningKey
    if (socket.send({ kind: 'opening_done', round })) pendingOpeningRound.value = null
  }

  function resetSession() {
    stopPolling()
    socket.close()
    roomId.value = ''
    mySeat.value = -1
    rejoinCode.value = ''
    isCreator.value = false
    creatorSeat.value = null
    roomSeats.value = []
    reservedSeats.value = []
    llmEnabled.value = false
    llmAvailable.value = false
    effectiveLlmEnabled.value = false
    seatRevision += 1
    seatWrites = Promise.resolve()
    roomStatus.value = 'lobby'
    storedSession.value = null
    waitingNextRound.value = false
    pendingOpeningRound.value = null
    currentRound.value = 0
    lastOpeningKey = ''
    completedOpeningKey = ''
    pendingSnapshot = null
    returnedMatchId = undefined
    inner.state.value = null
    inner.showingSettlement.value = false
    inner.autoplay.value = false
    inner.selected.value = -1
    inner.paused.value = false
    sessionStatus.value = 'idle'
    remoteSessionStore.clearSession()
  }

  async function createRoom(
    length: 4 | 8 | 16,
    nicknameValue: string,
    characterId?: string,
    mode: YaotongRoomMode = 'easy',
    enableLlm = false,
  ) {
    sessionStatus.value = 'creating'
    sessionError.value = ''
    try {
      yaotongMode.value = mode
      inner.mode.value = mode
      const info = await createRoomApi(
        'east', 4, playerId.value, 'yaotong', enableLlm, length, mode)
      roomId.value = info.roomId
      matchLength.value = info.matchLength ?? length
      if (info.yaotongMode) yaotongMode.value = info.yaotongMode
      const joined = await joinRoomApi(
        info.roomId, nicknameValue || '玩家', playerId.value, characterId)
      mySeat.value = joined.seat
      nickname.value = joined.nickname
      rejoinCode.value = joined.rejoinCode
      playerId.value = joined.playerId ?? playerId.value
      if (joined.yaotongMode) yaotongMode.value = joined.yaotongMode
      roomStatus.value = 'lobby'
      saveSession()
      socket.open()
      startPolling()
      await refreshRoom()
    } catch (error) {
      sessionStatus.value = 'error'
      sessionError.value = readableError(error, '创建幺筒房间失败')
    }
  }

  async function joinRoom(
    roomIdValue: string,
    nicknameValue: string,
    characterId?: string,
  ) {
    sessionStatus.value = 'joining'
    sessionError.value = ''
    try {
      const joined = await joinRoomApi(
        roomIdValue, nicknameValue || '玩家', playerId.value, characterId)
      roomId.value = roomIdValue
      mySeat.value = joined.seat
      nickname.value = joined.nickname
      rejoinCode.value = joined.rejoinCode
      playerId.value = joined.playerId ?? playerId.value
      if (joined.yaotongMode) {
        yaotongMode.value = joined.yaotongMode
        inner.mode.value = joined.yaotongMode
      }
      saveSession()
      socket.open()
      startPolling()
      await refreshRoom()
    } catch (error) {
      sessionStatus.value = 'error'
      sessionError.value = readableError(error, '加入幺筒房间失败')
    }
  }

  async function restoreSession(): Promise<boolean> {
    const session = remoteSessionStore.loadSession()
    if (!session || session.rulesetId !== 'yaotong') return false
    roomId.value = session.roomId
    rejoinCode.value = session.rejoinCode
    nickname.value = session.nickname
    playerId.value = session.playerId || playerId.value
    matchLength.value = session.matchLength ?? 4
    yaotongMode.value = session.yaotongMode ?? 'easy'
    inner.mode.value = yaotongMode.value
    storedSession.value = session
    sessionStatus.value = 'lobby'
    socket.open()
    startPolling()
    try {
      await refreshRoom()
    } catch {
      // 房间可能已回收；保持重连尝试，由 rejoin_err 清理。
    }
    return true
  }

  function updateCharacter(characterId: string) {
    const requestedRoom = roomId.value
    const seat = mySeat.value
    const code = rejoinCode.value
    if (!requestedRoom || seat < 0 || !code) return
    const sameSession = () => roomId.value === requestedRoom && rejoinCode.value === code
    seatWrites = seatWrites.then(async () => {
      if (!sameSession()) return
      sessionError.value = ''
      try {
        await updateCharacterApi(requestedRoom, seat, code, characterId)
        if (sameSession()) await refreshRoom().catch(() => {})
      } catch (error) {
        if (sameSession()) sessionError.value = readableError(error, '更新本家形象失败')
      }
    })
    return seatWrites
  }

  async function ready() {
    const requestedRoom = roomId.value
    const seat = mySeat.value
    const code = rejoinCode.value
    if (!requestedRoom || seat < 0 || !code) return
    await seatWrites
    if (roomId.value !== requestedRoom || rejoinCode.value !== code) return
    try {
      await readyRoom(requestedRoom, seat, code)
      await refreshRoom()
    } catch (error) {
      sessionError.value = readableError(error, '准备失败')
    }
  }

  function reserveLlmSeat(seat: number, providerId: string | null, style: ServerLlmStyle | null) {
    const requestedRoom = roomId.value
    const owner = mySeat.value
    const code = rejoinCode.value
    if (!requestedRoom || owner < 0 || !code) return
    const sameSession = () => roomId.value === requestedRoom && rejoinCode.value === code
    seatRevision += 1
    seatWrites = seatWrites.then(async () => {
      if (!sameSession()) return
      sessionError.value = ''
      try {
        const result = await reserveLlmSeatApi(requestedRoom, owner, code, seat, providerId, style)
        if (!sameSession()) return
        seatRevision += 1
        reservedSeats.value = result.reservedSeats ?? []
      } catch (error) {
        if (!sameSession()) return
        sessionError.value = readableError(error, '设置空位模型失败')
        await refreshRoom().catch(() => {
          if (sameSession()) reservedSeats.value = [...reservedSeats.value]
        })
      }
    })
    return seatWrites
  }

  async function startMatch() {
    const requestedRoom = roomId.value
    if (!requestedRoom) return
    // 先保存房主的选项，开局由服务端读取房间里的配置。
    await seatWrites
    if (roomId.value !== requestedRoom) return
    try {
      await startRoom(requestedRoom, undefined, playerId.value)
      await refreshRoom()
    } catch (error) {
      sessionError.value = readableError(error, '开局失败')
    }
  }

  async function leaveRoom() {
    if (roomId.value && mySeat.value >= 0 && rejoinCode.value) {
      try {
        await leaveRoomApi(roomId.value, mySeat.value, rejoinCode.value)
      } catch {
        // 房间可能已被回收；本地清理仍然进行。
      }
    }
    resetSession()
  }

  async function closeRoom() {
    if (!roomId.value || mySeat.value < 0 || !rejoinCode.value) return
    try {
      await closeRoomApi(roomId.value, mySeat.value, rejoinCode.value)
      resetSession()
    } catch (error) {
      sessionError.value = readableError(error, '关闭房间失败')
    }
  }

  onScopeDispose(() => {
    stopPolling()
    socket.close()
    clearLlmSpeech()
  })

  return {
    port,
    inner,
    sessionStatus,
    sessionError,
    roomId,
    mySeat,
    nickname,
    playerId,
    rejoinCode,
    isCreator,
    creatorSeat,
    roomSeats,
    reservedSeats,
    llmEnabled,
    llmAvailable,
    effectiveLlmEnabled,
    reserveLlmSeat,
    roomStatus,
    matchLength,
    yaotongMode,
    storedSession,
    waitingNextRound,
    pendingOpeningRound,
    interactionsAvailable,
    llmBubbles,
    sendQuickChat,
    sendEmote,
    ackOpening,
    signalQuality: socket.signalQuality,
    autoPlay: inner.autoplay,
    createRoom,
    joinRoom,
    restoreSession,
    updateCharacter,
    ready,
    startMatch,
    leaveRoom,
    closeRoom,
    refreshRoom,
  }
}
