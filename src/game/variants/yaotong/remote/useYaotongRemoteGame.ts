// 幺筒 WS 服务端权威联机：房间生命周期 + yt_snapshot → useYaotongPort。
//
// MVP：真人 + 服务端 AI 补位；无 LLM 座位/回放。房间 REST 与 wakudemo 登录
// 复用 src/game/online；对局协议走本目录的 protocol.ts。
import { ref } from 'vue'

import { API_BASE } from '../../../online/api/httpClient'
import {
  closeRoom as closeRoomApi,
  createRoom as createRoomApi,
  getRoom,
  joinRoom as joinRoomApi,
  leaveRoom as leaveRoomApi,
  readyRoom,
  startRoom,
  type RoomSeatState,
  type YaotongRoomMode,
} from '../../../online/api/roomApi'
import {
  createRemoteSessionStore,
  generateGuestId,
  type StoredSession,
} from '../../../online/session/remoteSessionStore'
import { createRoomSocketTransport } from '../../../online/transport/roomSocket'
import { useYaotongGame } from '../useYaotongGame'
import { useYaotongPort } from '../useYaotongPort'
import { convertSnapshot, toActionPayload, type YtSnapshot } from './protocol'

const remoteSessionStore = createRemoteSessionStore()
const WS_BASE = API_BASE.replace(/^http/, 'ws')

export type YaotongRemoteSessionStatus =
  | 'idle' | 'creating' | 'joining' | 'lobby' | 'playing' | 'finished' | 'error'

export interface YaotongRemoteGameOptions {
  playSound?: (file: string, volume?: number) => unknown
  playSoundAndWait?: (file: string, volume?: number) => Promise<void>
  getCharacterId?: () => string
  socketFactory?: Parameters<typeof createRoomSocketTransport>[0]['socketFactory']
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
  ROOM_CLOSED: '房间已关闭',
  MATCH_FINISHING: '上一场仍在收尾，请稍后再试',
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
  const roomStatus = ref<'lobby' | 'playing' | 'finished' | 'error' | 'closed'>('lobby')
  const matchLength = ref<4 | 8 | 16>(4)
  const yaotongMode = ref<YaotongRoomMode>('easy')
  const storedSession = ref<StoredSession | null>(null)
  const waitingNextRound = ref(false)
  const currentRound = ref(0)
  let lastOpeningRound = 0
  let pollTimer: ReturnType<typeof setInterval> | null = null

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
      void refreshRoom()
      if (inner.autoplay.value) socket.send({ kind: 'auto', enabled: true })
      return
    }
    if (kind === 'yt_snapshot') {
      const snapshot = message as YtSnapshot
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
          inner.acceptRemoteState(convertSnapshot(snapshot))
        } catch (error) {
          sessionError.value = error instanceof Error
            ? error.message : '联机快照解析失败'
          sessionStatus.value = 'error'
          return
        }
        sessionStatus.value = snapshot.matchFinished ? 'finished' : 'playing'
        roomStatus.value = snapshot.matchFinished ? 'finished' : 'playing'
        waitingNextRound.value = Boolean(
          snapshot.roundResult && !snapshot.matchFinished)
      } else {
        sessionStatus.value = 'lobby'
      }
      if (snapshot.opening && lastOpeningRound !== snapshot.round) {
        lastOpeningRound = snapshot.round
        // MVP 暂不等待开局演出；收到首份开局快照即回执，服务端随后开原报窗。
        socket.send({ kind: 'opening_done', round: snapshot.round })
      }
      return
    }
    if (kind === 'match_finished') {
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
        if (!waitingNextRound.value) return
        socket.send({ kind: 'continue', round: currentRound.value })
      },
      leave: () => { void leaveRoom() },
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
    const info = await getRoom(roomId.value)
    roomSeats.value = info.seats
    roomStatus.value = info.status
    creatorSeat.value = info.creatorSeat
    isCreator.value = info.creatorSeat === mySeat.value
    if (info.matchLength) matchLength.value = info.matchLength
    if (info.yaotongMode) {
      yaotongMode.value = info.yaotongMode
      inner.mode.value = info.yaotongMode
    }
    if (info.status === 'playing') sessionStatus.value = 'playing'
    else if (info.status === 'finished') sessionStatus.value = 'finished'
    else if (info.status === 'lobby') sessionStatus.value = 'lobby'
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
    roomStatus.value = 'lobby'
    storedSession.value = null
    waitingNextRound.value = false
    currentRound.value = 0
    lastOpeningRound = 0
    inner.state.value = null
    sessionStatus.value = 'idle'
    remoteSessionStore.clearSession()
  }

  async function createRoom(
    length: 4 | 8 | 16,
    nicknameValue: string,
    characterId?: string,
    mode: YaotongRoomMode = 'easy',
  ) {
    sessionStatus.value = 'creating'
    sessionError.value = ''
    try {
      yaotongMode.value = mode
      inner.mode.value = mode
      const info = await createRoomApi(
        'east', 4, playerId.value, 'yaotong', false, length, mode)
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

  async function ready() {
    if (!roomId.value || mySeat.value < 0 || !rejoinCode.value) return
    try {
      await readyRoom(roomId.value, mySeat.value, rejoinCode.value)
      await refreshRoom()
    } catch (error) {
      sessionError.value = readableError(error, '准备失败')
    }
  }

  async function startMatch() {
    if (!roomId.value) return
    try {
      await startRoom(roomId.value)
      sessionStatus.value = 'playing'
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
    roomStatus,
    matchLength,
    yaotongMode,
    storedSession,
    waitingNextRound,
    signalQuality: socket.signalQuality,
    autoPlay: inner.autoplay,
    createRoom,
    joinRoom,
    restoreSession,
    ready,
    startMatch,
    leaveRoom,
    closeRoom,
    refreshRoom,
  }
}
