<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import GameShellHeader from './components/shell/GameShellHeader.vue'
import OrientationGate from './components/shell/OrientationGate.vue'
import GameTableHud from './components/table/GameTableHud.vue'
import LobbyView from './components/lobby/LobbyView.vue'
import SettlementOverlay from './components/settlement/SettlementOverlay.vue'
import YaotongControls from './components/yaotong/YaotongControls.vue'
import YaotongLedger from './components/yaotong/YaotongLedger.vue'
import { useYaotongPort } from './game/variants/yaotong/useYaotongPort'
import { useAudio } from './game/core/presentation/useAudio'
import type { TileType } from './game/core/contracts/types'
import type { TableThemeName } from './components/table/three/tableTheme'
import { readTableThemePreference, resolveInitialTableTheme } from './components/table/three/tableThemePreference'
import { themePresentationByName, themePresentationCssVariables } from './theme/themePresentation'
import { readAnimeCharacterPreference, saveAnimeCharacterPreference } from './game/llm/animeCharacterPreference'
import type { CharacterId } from './game/llm/animeCharacters'
import { preloadAnimeCharacterAssets } from './game/core/presentation/llmAnimeAssets'
import { useReplayRecorder } from './game/replay/useReplayRecorder'
import type { ReplayMatch, ReplayRound } from './game/replay/types'

const RulesPanel = defineAsyncComponent(() => import('./components/RulesPanel.vue'))
const ReplayListView = defineAsyncComponent(() => import('./components/replay/ReplayListView.vue'))
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
const tableThemeName = ref<TableThemeName>(initialTableTheme.theme)
const themePresentation = computed(() => themePresentationByName(tableThemeName.value))
const themePresentationStyle = computed(() => themePresentationCssVariables(themePresentation.value))
if (initialThemeCandidate !== null && initialThemeCandidate !== initialTableTheme.theme) {
  const canonicalUrl = new URL(window.location.href)
  canonicalUrl.searchParams.set('theme', initialTableTheme.theme)
  window.history.replaceState(window.history.state, '', canonicalUrl)
}

const { playEffect, playEffectAndWait, startBgm } = useAudio()
const animeCharacterId = ref<CharacterId>(readAnimeCharacterPreference())
watch(animeCharacterId, saveAnimeCharacterPreference)
watch(tableThemeName, (theme) => {
  if (theme === 'llmAnime') void preloadAnimeCharacterAssets()
}, { immediate: true })
const replay = useReplayRecorder({ meta: () => ({
  rulesetId: 'yaotong', rulesetName: '幺筒麻将', themeName: tableThemeName.value,
  humanSeat: 0, yaotongMode: yaotongGame.local.mode.value,
}) })
const yaotongGame = useYaotongPort({
  recorder: replay.hooks,
  playSound: playEffect,
  playSoundAndWait: playEffectAndWait,
  getCharacterId: () => animeCharacterId.value,
})
const {
  phase, wall, wallHeadDrawn, wallCount, currentPlayer, selectedIndex, turnSeconds, lastDiscard,
  actionPrompt, announcement, tableActionEvent, scoreFlowEvent, result, winEffect, winPresentation, revealHands, winningPlayerIndex,
  dealer, user, isUserTurn, userCanHu,
  matchName, matchFinished, honba, roundLabel, standings,
  userKongs, userCurrentWaits, userTingOptions, userDiscardWaits, dealAnimation, openingStage, diceValues, diceThrowerIndex, startGame, selectTile, clearUserSelection, userDiscard, userPass, userPeng, userGangFromDiscard,
  userGang, userHu, nextRound, returnToLobby,
} = yaotongGame
// GamePort.players 是 getter；开局时才生成座位，必须保持响应式读取。
const players = computed(() => yaotongGame.players)
const showLobby = computed(() => phase.value === 'lobby')
const jokerTiles: TileType[] = ['p1']
const wallBreakIndex = computed(() => {
  const state = yaotongGame.local.state.value
  return state ? ([0, 82, 54, 28][state.wallSide] + state.reservedStacks * 2) % 108 : undefined
})
watch([rulesOpen, () => yaotongGame.openingActive.value], ([open, opening]) => {
  if (!opening) yaotongGame.local.paused.value = open
})
watch(result, (value) => { resultVisible.value = Boolean(value) })
watch(showLobby, (lobby) => { if (lobby) { resetTableReady(); replay.finishAuto() } })
watch(matchFinished, (finished) => { if (finished) replay.finishAuto() })
onBeforeUnmount(() => replay.finishAuto())
onBeforeUnmount(resetTableReady)

async function showReplayList() {
  replayNotice.value = ''
  await replay.flush()
  replayOpen.value = true
}
async function openReplay(id: string) {
  const [match, rounds] = await Promise.all([replay.storage.loadMatch(id), replay.storage.loadRounds(id)])
  if (!match || !rounds.length) { replayNotice.value = '这场回放暂无可读取的牌局，请重新打开列表。'; return }
  replayOpen.value = false
  replayView.value = { match, rounds }
}

function startGameWithAudio() {
  resetTableReady()
  startBgm()
  startGame('east', { waitForTableReady })
}
function toggleAutoPlay() {
  yaotongGame.local.autoplay.value = !yaotongGame.local.autoplay.value
}
function quitMatch() {
  if (window.confirm('退出将结束当前本地对局，确定返回大厅？')) returnToLobby()
}
function changeTableTheme(theme: TableThemeName) {
  tableThemeName.value = theme
  const url = new URL(window.location.href)
  url.searchParams.set('theme', theme)
  window.history.replaceState(window.history.state, '', url)
}
</script>

<template>
  <OrientationGate :theme-name="tableThemeName" />
  <main class="game-app"
    :class="[{ 'is-lobby': showLobby }, themePresentation.typography.headingClass]"
    :data-table-theme="tableThemeName"
    :data-theme-player-frame="themePresentation.hud.playerFrame"
    :data-theme-particle="themePresentation.shell.particle"
    :data-theme-loading="themePresentation.presentation.loading"
    :style="themePresentationStyle"
  >
    <div v-if="!replayView" :class="{ 'has-three-scene': players.length }">
      <GameShellHeader game-mode="local" :phase="phase" :has-players="Boolean(players.length)"
        :match-name="matchName" :round-label="roundLabel" :honba="honba" :base-score="5"
        room-id="" :signal-quality="3" :theme-name="tableThemeName"
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
        :is-user-turn="isUserTurn"
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
        :joker-tiles="jokerTiles"
        :theme-name="tableThemeName"
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
      >
        <template #actions><YaotongControls :game="yaotongGame" /></template>
      </GameTableHud>


      <LobbyView v-if="showLobby" v-model:yaotong-length="yaotongGame.length.value"
        v-model:yaotong-mode="yaotongGame.local.mode.value"
        v-model:anime-character-id="animeCharacterId" :table-theme-name="tableThemeName"
        @start-local="startGameWithAudio" @open-rules="rulesOpen = true" @open-replay="showReplayList"
      />
      <SettlementOverlay
        v-model:result-visible="resultVisible"
        :result="result"
        :result-title="yaotongGame.resultTitle.value"
        :match-finished="matchFinished"
        :dealer="dealer"
        :waiting-next-round="false"
        game-mode="local"
        :continue-countdown="0"
        :match-name="matchName"
        :standings="standings"
        player-id=""
        :human-seats="[0]"
        :joker-tiles="jokerTiles"
        :theme-name="tableThemeName"
        @next-round="nextRound"
        @return-to-lobby="returnToLobby"
      >
        <template v-if="yaotongGame.local.state.value?.result" #summary>
          <YaotongLedger :state="yaotongGame.local.state.value" :players="players" :theme-name="tableThemeName" />
        </template>
      </SettlementOverlay>

    </div>
    <RulesPanel :open="rulesOpen" @close="rulesOpen = false" />
    <ReplayListView v-model:open="replayOpen" :storage="replay.storage" :available="replay.available.value"
      :notice="replayNotice" @view="openReplay" />
    <ReplayViewer v-if="replayView" :match="replayView.match" :rounds="replayView.rounds"
      back-label="← 返回回放列表" @close="replayView = null; replayOpen = true" />
  </main>
</template>
