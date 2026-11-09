<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import GameShellHeader from './components/shell/GameShellHeader.vue'
import OrientationGate from './components/shell/OrientationGate.vue'
import GameTableHud from './components/table/GameTableHud.vue'
import LobbyView from './components/lobby/LobbyView.vue'
// 常用入口随大厅就绪，避免异步面板资源失败后按钮只更新状态却没有可见反馈。
import RulesPanel from './components/RulesPanel.vue'
import ReplayListView from './components/replay/ReplayListView.vue'
import SettlementOverlay from './components/settlement/SettlementOverlay.vue'
import YaotongControls from './components/yaotong/YaotongControls.vue'
import { useYaotongQuickChat } from './components/yaotong/useYaotongQuickChat'
import { useYaotongEmotes } from './components/yaotong/useYaotongEmotes'
import YaotongLedger from './components/yaotong/YaotongLedger.vue'
import YaotongRoundOverview from './components/yaotong/YaotongRoundOverview.vue'
import StatsOverlay from './components/account/StatsOverlay.vue'
import { useYaotongPort } from './game/variants/yaotong/useYaotongPort'
import { useYaotongGame } from './game/variants/yaotong/useYaotongGame'
import { useYaotongRemoteGame } from './game/variants/yaotong/remote/useYaotongRemoteGame'
import type { YaotongEmoteId } from './game/variants/yaotong/emotes'
import type { QuickChatPhrase } from './game/variants/yaotong/quickChat'
import { DEFAULT_BGM_FILE, useAudio } from './game/core/presentation/useAudio'
import { READY_BGM_ASSET } from './game/core/presentation/audioAssets'
import { preloadTileImages } from './game/core/presentation/tileAssets'
import { cancelLocalLlmAudioPlayback } from './game/core/presentation/llmAudioBus'
import type { GameMode } from './game/core/contracts/activeGamePort'
import type { TileType } from './game/core/contracts/types'
import { useWakuDemoAuth } from './game/online/session/useWakuDemoAuth'
import { useRoomAvailability } from './game/online/session/useRoomAvailability'
import { useRemoteContinueCountdown } from './game/online/presentation/useRemoteContinueCountdown'
import type { TableThemeName } from './components/table/three/tableTheme'
import {
  readTableThemePreference, resolveInitialTableTheme, shouldAutoUseLlmTheme,
} from './components/table/three/tableThemePreference'
import { themePresentationByName, themePresentationCssVariables } from './theme/themePresentation'
import { readAnimeCharacterPreference, saveAnimeCharacterPreference } from './game/llm/animeCharacterPreference'
import type { CharacterId } from './game/llm/animeCharacters'
import { preloadAnimeCharacterAssets } from './game/core/presentation/llmAnimeAssets'
import { useReplayRecorder } from './game/replay/useReplayRecorder'
import type { ReplayMatch, ReplayRound } from './game/replay/types'

const ReplayViewer = defineAsyncComponent(() => import('./components/replay/ReplayViewer.vue'))
const replayOpen = ref(false)
const replayView = shallowRef<{ match: ReplayMatch; rounds: ReplayRound[] } | null>(null)
const replayNotice = ref('')
const rulesOpen = ref(false)
const resultVisible = ref(true)
const gameTableReady = ref(false)
let tableReadyPromise: Promise<void> | null = null
let tableReadyResolve: (() => void) | null = null

function waitForTableReady() {
  if (gameTableReady.value) return Promise.resolve()
  if (!tableReadyPromise) {
    tableReadyPromise = new Promise<void>((resolve) => { tableReadyResolve = resolve })
  }
  return tableReadyPromise
}

function handleTableReady() {
  gameTableReady.value = true
  tableReadyResolve?.()
  tableReadyResolve = null
  tableReadyPromise = null
}

function resetTableReady() {
  gameTableReady.value = false
  // 解除已取消开局留下的等待，避免旧时间线永久挂起。
  tableReadyResolve?.()
  tableReadyResolve = null
  tableReadyPromise = null
}

const initialThemeCandidate = new URLSearchParams(window.location.search).get('theme')
const initialTableTheme = resolveInitialTableTheme(initialThemeCandidate, readTableThemePreference())
const selectedTableTheme = ref<TableThemeName>(initialTableTheme.theme)
const explicitTableThemeSelected = ref(initialTableTheme.explicit)
if (initialThemeCandidate !== null && initialThemeCandidate !== initialTableTheme.theme) {
  const canonicalUrl = new URL(window.location.href)
  canonicalUrl.searchParams.set('theme', initialTableTheme.theme)
  window.history.replaceState(window.history.state, '', canonicalUrl)
}

const { playEffect, playEffectAndWait, effectsReady, playLlmAudio, startBgm, preloadBgmTrack,
  soundOn, bgmOn, effectsOn } = useAudio()
const tableBgmReady = Promise.all([preloadBgmTrack(DEFAULT_BGM_FILE), preloadBgmTrack(READY_BGM_ASSET)])
function waitForTableAudio() {
  if (!soundOn.value) return Promise.resolve()
  return Promise.all([
    effectsOn.value ? effectsReady : undefined,
    bgmOn.value ? tableBgmReady : undefined,
  ]).then(() => {})
}
// 快捷语：纯手动发送；静音时只显示气泡、不朗读。气泡复用 GameTableHud 的现有 bubble。
const quickChat = useYaotongQuickChat({
  enabled: () => soundOn.value && effectsOn.value,
  playAudio: (file) => playEffect(file, 0.95),
})
const chatBubbles = quickChat.bubbles
const emotes = useYaotongEmotes({
  playSound: (file, volume) => playEffect(file, volume ?? 0.85),
})
const animeCharacterId = ref<CharacterId>(readAnimeCharacterPreference())
const localSource = useYaotongGame()
const gameMode = ref<GameMode>('local')
const online = useYaotongRemoteGame({
  playSound: playEffect,
  playSoundAndWait: playEffectAndWait,
  playLlmAudio(url, seat, id, priority, queueImportant) {
    if (gameMode.value === 'remote' && !replayOpen.value && !replayView.value) {
      playLlmAudio(url, seat, id, priority, queueImportant)
    }
  },
  stopLlmAudio: cancelLocalLlmAudioPlayback,
  getCharacterId: () => animeCharacterId.value,
  createPort: false,
  onInteraction(event) {
    if (gameMode.value !== 'remote' || replayView.value) return
    if (event.kind === 'quick_chat') {
      const { text, speech, audio } = event.phrase
      quickChat.show(event.fromSeat, text, speech, audio)
    } else {
      emotes.show(event.emote, event.fromSeat, event.targetSeat)
    }
  },
})
watch([gameMode, replayOpen, replayView], ([mode, replayList, replayMatch]) => {
  if (mode !== 'remote' || replayList || replayMatch) cancelLocalLlmAudioPlayback()
})
const tableThemeName = computed<TableThemeName>(() => {
  const llmRoom = gameMode.value === 'remote' && (
    online.effectiveLlmEnabled.value
    || online.inner.state.value?.players.some(player => player.playerKind === 'llm') === true
  )
  return shouldAutoUseLlmTheme(llmRoom, explicitTableThemeSelected.value)
    ? 'llmAnime'
    : selectedTableTheme.value
})
const themePresentation = computed(() => themePresentationByName(tableThemeName.value))
const themePresentationStyle = computed(() => themePresentationCssVariables(themePresentation.value))
watch(tableThemeName, (theme) => {
  gameTableReady.value = false
  void preloadTileImages(theme).catch(() => { /* 牌桌挂载后走现有重试流程 */ })
  if (theme === 'llmAnime') void preloadAnimeCharacterAssets()
}, { immediate: true, flush: 'sync' })
watch(replayView, (view) => { if (view) gameTableReady.value = false })
const replay = useReplayRecorder({ meta: () => ({
  rulesetId: 'yaotong', rulesetName: '幺筒麻将', themeName: tableThemeName.value,
  humanSeat: 0, yaotongMode: yaotongGame.local.mode.value,
}) })
const { roomMeta } = useRoomAvailability(gameMode, online.roomId, 'yaotong')
const wakuAuth = useWakuDemoAuth()
const pendingRemoteLogin = ref(false)
const nicknameInput = ref('')
const joinCode = ref('')
const copied = ref(false)
const leaving = ref(false)
const closing = ref(false)
const matchStarting = ref(false)
const statsOpen = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | null = null
// 单机/联机共用同一套演出层：按 gameMode 切换底层 GameState 源。
const gameSource = new Proxy({} as ReturnType<typeof useYaotongGame>, {
  get(_target, key) {
    const source = gameMode.value === 'remote' ? online.inner : localSource
    return (source as any)[key]
  },
})
const yaotongGame = useYaotongPort({
  recorder: replay.hooks,
  playSound: playEffect,
  playSoundAndWait: playEffectAndWait,
  waitForTableReady,
  getCharacterId: () => animeCharacterId.value,
}, gameSource)
const {
  phase, wall, wallHeadDrawn, wallCount, currentPlayer, selectedIndex, turnSeconds, lastDiscard,
  actionPrompt, announcement, tableActionEvent, scoreFlowEvent, result, winEffect, winPresentation, revealHands, winningPlayerIndex,
  dealer, user, isUserTurn, userCanHu,
  matchName, matchFinished, honba, roundLabel, standings,
  userKongs, userCurrentWaits, userTingOptions, userDiscardWaits, dealAnimation, openingStage, diceValues, diceThrowerIndex, startGame, selectTile, clearUserSelection, userDiscard, userPass, userPeng, userGangFromDiscard,
  userGang, userHu, nextRound, returnToLobby,
} = yaotongGame
const continueCountdown = useRemoteContinueCountdown({
  gameMode, phase, result, matchFinished,
  waitingNextRound: online.waitingNextRound,
  continueRound: () => { nextRound() },
})
// GamePort.players 是 getter；开局时才生成座位，必须保持响应式读取。
const players = computed(() => yaotongGame.players)
const allOccupiedReady = computed(() => {
  const seats = online.roomSeats.value
  return seats.some(Boolean) && seats.every((seat) => !seat || seat.ready)
})
const showLobby = computed(() => gameMode.value === 'local'
  ? phase.value === 'lobby'
  : !online.roomId.value || !online.inner.state.value)
const interactionHand = computed(() => {
  const state = gameSource.state.value
  if (!state || state.phase === 'settled' || replayView.value) return undefined
  return `${gameMode.value}:${state.remoteMatchId ?? ''}:${state.handNumber}`
})
const interactionsEnabled = computed(() => interactionHand.value !== undefined && gameTableReady.value
  && (gameMode.value === 'local' || online.interactionsAvailable.value))

function sendQuickChat(phrase: QuickChatPhrase): boolean {
  if (!interactionsEnabled.value) return false
  const relay = gameMode.value === 'remote' ? () => online.sendQuickChat(phrase.id) : undefined
  return quickChat.send(phrase.text, phrase.speech, phrase.audio, relay)
}

function sendEmote(emote: YaotongEmoteId) {
  if (!interactionsEnabled.value) return
  emotes.throwEmote(emote, gameMode.value === 'remote' ? online.sendEmote : undefined)
}

function openEmote(seat: number) {
  if (interactionsEnabled.value) emotes.open(seat)
}

const jokerTiles: TileType[] = ['p1']
const wallBreakIndex = computed(() => {
  const state = yaotongGame.local.state.value
  return state ? ([0, 82, 54, 28][state.wallSide] + state.reservedStacks * 2) % 108 : undefined
})
watch([rulesOpen, () => yaotongGame.openingActive.value], ([open, opening]) => {
  if (!opening) yaotongGame.local.paused.value = open
})
watch(result, (value) => { resultVisible.value = Boolean(value) })
// 连庄的局名相同，小局编号仍会前进。
watch(interactionHand, () => { quickChat.clear(); emotes.clear() }, { flush: 'sync' })
watch(interactionsEnabled, (enabled) => { if (!enabled) emotes.cancel() })
watch(showLobby, (lobby) => { if (lobby) { resetTableReady(); replay.finishAuto() } })
watch(matchFinished, (finished) => { if (finished) replay.finishAuto() })
watch(() => wakuAuth.account.value?.displayName, (name) => {
  if (name && !nicknameInput.value) nicknameInput.value = name
}, { immediate: true })
watch(() => online.storedSession.value?.nickname, (name) => {
  if (name && !nicknameInput.value) nicknameInput.value = name
}, { immediate: true })
const onlineRoomId = computed(() => gameMode.value === 'remote' ? online.roomId.value : '')
const onlineSignal = computed(() => gameMode.value === 'remote' ? online.signalQuality.value : 3)
let openingHandInFlight = ''
async function playRemoteOpening(round: number) {
  const matchId = online.inner.state.value?.remoteMatchId
  const hand = `${matchId}:${round}`
  if (openingHandInFlight === hand) return
  openingHandInFlight = hand
  try {
    await startGame('east')
    if (gameMode.value === 'remote' && online.inner.state.value?.remoteMatchId === matchId) {
      online.ackOpening(round)
    }
  } finally {
    if (openingHandInFlight === hand) openingHandInFlight = ''
  }
}
watch(() => online.pendingOpeningRound.value, (round) => {
  if (gameMode.value === 'remote' && round != null) void playRemoteOpening(round)
})
watch(() => online.sessionStatus.value, (status) => {
  if (status === 'playing') {
    gameMode.value = 'remote'
    void startBgm()
    const round = online.pendingOpeningRound.value
    if (round != null) void playRemoteOpening(round)
  }
})

function handleAuthRequired() {
  wakuAuth.error.value = '登录已过期，请重新登录 WakuDemo 账号'
}
if (typeof window !== 'undefined') {
  window.addEventListener('wakudemo-auth-required', handleAuthRequired)
}
onBeforeUnmount(() => window.removeEventListener('wakudemo-auth-required', handleAuthRequired))
onBeforeUnmount(() => replay.finishAuto())
onBeforeUnmount(resetTableReady)
onBeforeUnmount(() => quickChat.dispose())
onBeforeUnmount(() => emotes.dispose())

function showReplayList() {
  replayNotice.value = ''
  replayOpen.value = true
}
async function openReplay(id: string) {
  const [match, rounds] = await Promise.all([replay.storage.loadMatch(id), replay.storage.loadRounds(id)])
  if (!match || !rounds.length) { replayNotice.value = '这场回放暂无可读取的牌局，请重新打开列表。'; return }
  replayOpen.value = false
  replayView.value = { match, rounds }
}

function onGameModeChange(mode: GameMode) {
  if (mode === 'remote' && !wakuAuth.authenticated.value) {
    pendingRemoteLogin.value = true
    wakuAuth.error.value = '联机对战需要先登录 WakuDemo 账号'
    return
  }
  pendingRemoteLogin.value = false
  gameMode.value = mode
}

// 登录状态检查完成后，继续玩家此前选择的联机入口。
watch(() => wakuAuth.authenticated.value, (authenticated) => {
  if (authenticated && pendingRemoteLogin.value) {
    pendingRemoteLogin.value = false
    wakuAuth.error.value = ''
    gameMode.value = 'remote'
  }
})

function selectAnimeCharacter(characterId: CharacterId) {
  animeCharacterId.value = saveAnimeCharacterPreference(characterId)
  if (gameMode.value === 'remote') void online.updateCharacter(animeCharacterId.value)
}

async function createRemoteRoom(llmEnabled: boolean) {
  await online.createRoom(
    yaotongGame.length.value,
    nicknameInput.value.trim() || '玩家',
    animeCharacterId.value,
    yaotongGame.local.mode.value,
    llmEnabled,
  )
}

async function joinRemoteRoom() {
  const code = joinCode.value.trim().toUpperCase()
  if (code.length !== 6) return
  await online.joinRoom(
    code, nicknameInput.value.trim() || '玩家', animeCharacterId.value)
}

async function resumeRemoteSession() {
  gameMode.value = 'remote'
  await online.restoreSession()
}

async function toggleReady() {
  await online.ready()
}

async function startRemoteMatch() {
  if (matchStarting.value) return
  matchStarting.value = true
  try {
    await online.startMatch()
  } finally {
    matchStarting.value = false
  }
}

async function leaveRemoteRoom() {
  if (leaving.value) return
  leaving.value = true
  try {
    await online.leaveRoom()
  } finally {
    leaving.value = false
  }
}

async function closeRemoteRoom() {
  if (closing.value) return
  closing.value = true
  try {
    await online.closeRoom()
  } finally {
    closing.value = false
  }
}

function leaveRemoteMatch() {
  gameMode.value = 'local'
}

function copyRoomId() {
  const text = online.roomId.value
  if (!text) return
  void navigator.clipboard?.writeText(text)
  copied.value = true
  if (copiedTimer !== null) clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => { copied.value = false }, 1500)
}

function startGameWithAudio() {
  if (gameMode.value !== 'local') return
  resetTableReady()
  void startBgm()
  void startGame('east')
}
function toggleAutoPlay() {
  yaotongGame.local.autoplay.value = !yaotongGame.local.autoplay.value
}
function quitMatch() {
  if (gameMode.value === 'remote') {
    if (!window.confirm('退出将离开当前联机房间，确定返回大厅？')) return
    void leaveRemoteRoom()
    leaveRemoteMatch()
    return
  }
  if (window.confirm('退出将结束当前本地对局，确定返回大厅？')) returnToLobby()
}
function changeTableTheme(theme: TableThemeName) {
  selectedTableTheme.value = theme
  explicitTableThemeSelected.value = true
  const url = new URL(window.location.href)
  url.searchParams.set('theme', theme)
  window.history.replaceState(window.history.state, '', url)
}
</script>

<template>
  <OrientationGate v-if="!replayOpen && !replayView" :theme-name="tableThemeName" />
  <main class="game-app"
    :class="[{ 'is-lobby': showLobby }, themePresentation.typography.headingClass]"
    :data-table-theme="tableThemeName"
    :data-theme-player-frame="themePresentation.hud.playerFrame"
    :data-theme-particle="themePresentation.shell.particle"
    :data-theme-loading="themePresentation.presentation.loading"
    :style="themePresentationStyle"
  >
    <div v-if="!replayView" :class="{ 'has-three-scene': players.length }">
      <GameShellHeader :game-mode="gameMode" :phase="phase"
        :has-players="Boolean(players.length)"
        :match-name="matchName" :round-label="roundLabel" :honba="honba" :base-score="5"
        :room-id="onlineRoomId" :signal-quality="onlineSignal" :theme-name="tableThemeName"
        @quit="quitMatch" @open-rules="rulesOpen = true" @change-theme="changeTableTheme"
      />
      <GameTableHud
        v-if="players.length && user"
        :players="players"
        :user="user"
        :phase="phase"
        :wall="wall"
        :wall-head-drawn="wallHeadDrawn"
        :wall-count="wallCount"
        :current-player="currentPlayer"
        :selected-index="selectedIndex"
        :turn-seconds="turnSeconds"
        :last-discard="lastDiscard"
        :action-prompt="actionPrompt"
        :announcement="announcement"
        :table-action-event="tableActionEvent"
        :score-flow-event="scoreFlowEvent"
        :result="result"
        :win-effect="winEffect"
        :win-presentation="winPresentation"
        :reveal-hands="revealHands"
        :match-finished="matchFinished"
        :winning-player-index="winningPlayerIndex"
        :dealer="dealer"
        :is-user-turn="gameTableReady && isUserTurn"
        :user-can-hu="userCanHu"
        :match-name="matchName"
        :round-label="roundLabel"
        :deal-animation="dealAnimation"
        :opening-stage="openingStage"
        :dice-values="diceValues"
        :dice-thrower-index="diceThrowerIndex"
        :user-current-waits="userCurrentWaits"
        :user-ting-options="userTingOptions"
        :user-discard-waits="userDiscardWaits"
        :user-kongs="userKongs"
        :user-has-wind-kong="false"
        :auto-play-enabled="true"
        :auto-play="yaotongGame.local.autoplay.value"
        :wall-total="108"
        :extra-actions="!result && !yaotongGame.openingStage.value"
        :locked-hand="yaotongGame.local.user.value?.declaration !== 'none'"
        :blocked-discard-indices="yaotongGame.local.protection.value.discards"
        :can-pass="!yaotongGame.local.protection.value.pass"
        :yaotong-view="yaotongGame.tableView.value"
        :chat-bubbles="chatBubbles"
        :llm-bubbles="gameMode === 'remote' ? online.llmBubbles.value : undefined"
        :emote-cues="emotes.cues.value"
        :emotes-enabled="interactionsEnabled"
        :joker-tiles="jokerTiles"
        :theme-name="tableThemeName"
        :wait-for-audio="waitForTableAudio"
        ruleset-id="yaotong"
        :wall-break-index="wallBreakIndex"
        @select-tile="selectTile"
        @clear-selection="clearUserSelection"
        @discard="userDiscard"
        @pass="userPass"
        @peng="userPeng"
        @gang-from-discard="userGangFromDiscard"
        @gang="userGang"
        @hu="userHu"
        @toggle-auto-play="toggleAutoPlay"
        @ready="handleTableReady"
        @next-round="nextRound"
        @return-to-lobby="returnToLobby"
        @leave-match="quitMatch"
        @emote-target="openEmote"
      >
        <template #actions>
          <YaotongControls :key="interactionHand" :game="yaotongGame"
            :send-quick-chat="interactionsEnabled ? sendQuickChat : undefined"
            :emotes="interactionsEnabled ? emotes : undefined" :send-emote="sendEmote" />
        </template>
      </GameTableHud>


      <LobbyView v-if="showLobby"
        :game-mode="gameMode"
        v-model:yaotong-length="yaotongGame.length.value"
        v-model:yaotong-mode="yaotongGame.local.mode.value"
        v-model:nickname-input="nicknameInput"
        v-model:join-code="joinCode"
        :anime-character-id="animeCharacterId"
        @update:anime-character-id="selectAnimeCharacter"
        :table-theme-name="tableThemeName"
        :stored-session="online.storedSession.value"
        :room-id="online.roomId.value"
        :room-meta="roomMeta"
        :session-status="online.sessionStatus.value"
        :session-error="online.sessionError.value"
        :room-time-limit="3600"
        :room-status="online.roomStatus.value"
        :room-seats="online.roomSeats.value"
        :reserved-seats="online.reservedSeats.value"
        :llm-enabled="online.llmEnabled.value"
        :llm-available="online.llmAvailable.value"
        :effective-llm-enabled="online.effectiveLlmEnabled.value"
        :my-seat="online.mySeat.value"
        :is-creator="online.isCreator.value"
        :all-occupied-ready="allOccupiedReady"
        :match-starting="matchStarting"
        :copied="copied"
        :leaving="leaving"
        :closing="closing"
        :waku-authenticated="wakuAuth.authenticated.value"
        :waku-account-name="wakuAuth.account.value?.displayName ?? ''"
        :waku-auth-loading="wakuAuth.loading.value"
        :waku-auth-error="wakuAuth.error.value"
        @update:game-mode="onGameModeChange"
        @start-local="startGameWithAudio"
        @create-room="createRemoteRoom"
        @join-room="joinRemoteRoom"
        @resume-session="resumeRemoteSession"
        @copy-room="copyRoomId"
        @toggle-ready="toggleReady"
        @start-remote="startRemoteMatch"
        @reserve-seat="online.reserveLlmSeat($event.seat, $event.providerId, $event.style)"
        @leave-room="leaveRemoteRoom"
        @close-room="closeRemoteRoom"
        @leave-match="leaveRemoteMatch"
        @open-stats="statsOpen = true"
        @open-replay="showReplayList"
        @open-rules="rulesOpen = true"
        @waku-login="wakuAuth.login"
        @waku-logout="wakuAuth.logout"
      />
      <SettlementOverlay
        v-model:result-visible="resultVisible"
        :result="result"
        :result-title="yaotongGame.resultTitle.value"
        :match-finished="matchFinished"
        :dealer="dealer"
        :waiting-next-round="gameMode === 'remote' ? online.waitingNextRound.value : false"
        :game-mode="gameMode"
        :continue-countdown="continueCountdown"
        :match-name="matchName"
        :standings="standings"
        :player-id="gameMode === 'remote' ? online.playerId.value : ''"
        :human-seats="[0]"
        :joker-tiles="jokerTiles"
        :theme-name="tableThemeName"
        @next-round="nextRound"
        @return-to-lobby="returnToLobby"
      >
        <template v-if="yaotongGame.local.state.value?.result" #overview>
          <YaotongRoundOverview :state="yaotongGame.local.state.value" :theme-name="tableThemeName" />
        </template>
        <template v-if="yaotongGame.local.state.value?.result" #summary>
          <YaotongLedger :state="yaotongGame.local.state.value" :players="players" :theme-name="tableThemeName" />
        </template>
      </SettlementOverlay>

    </div>
    <RulesPanel :open="rulesOpen" @close="rulesOpen = false" />
    <ReplayListView v-model:open="replayOpen" :storage="replay.storage" :available="replay.available.value"
      :before-load="replay.flush" :notice="replayNotice" @view="openReplay" />
    <ReplayViewer v-if="replayView" :match="replayView.match" :rounds="replayView.rounds"
      back-label="← 返回回放列表" @close="replayView = null; replayOpen = true" />
    <StatsOverlay v-model:open="statsOpen" :authenticated="wakuAuth.authenticated.value"
      :account-id="wakuAuth.account.value?.id ?? ''" :account-name="wakuAuth.account.value?.displayName ?? ''"
      @login="wakuAuth.login" />
  </main>
</template>
