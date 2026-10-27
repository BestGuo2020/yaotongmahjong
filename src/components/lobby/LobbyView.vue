<script setup lang="ts">
import { computed, ref } from 'vue'

import AnimeCharacterPicker from '../llm/AnimeCharacterPicker.vue'
import YaotongMatchPicker from '../yaotong/YaotongMatchPicker.vue'
import YaotongModePicker from '../yaotong/YaotongModePicker.vue'
import GameSettingsSummary from './GameSettingsSummary.vue'
import LobbyDialog from './LobbyDialog.vue'
import LobbyThemeVisual from './LobbyThemeVisual.vue'
import RoomPanel from './RoomPanel.vue'
import type { TableThemeName } from '../table/three/tableTheme'
import type { CharacterId } from '../../game/llm/animeCharacters'
import type { GameMode } from '../../game/core/contracts/activeGamePort'
import type { RoomMeta, RoomSeatState } from '../../game/online/api/roomApi'
import type { StoredSession } from '../../game/online/session/remoteSessionStore'
import { YAOTONG_MODES, type YaotongMode } from '../../game/variants/yaotong/mode'

interface Props {
  gameMode: GameMode
  yaotongLength: 4 | 8 | 16
  yaotongMode: YaotongMode
  animeCharacterId: CharacterId
  tableThemeName: TableThemeName
  storedSession: StoredSession | null
  roomId: string
  nicknameInput: string
  joinCode: string
  roomMeta: RoomMeta | null
  sessionStatus: string
  sessionError: string
  roomTimeLimit: number | null
  roomStatus?: string
  roomSeats: Array<RoomSeatState | null>
  mySeat: number
  isCreator: boolean
  allOccupiedReady: boolean
  matchStarting: boolean
  copied: boolean
  leaving: boolean
  closing: boolean
  wakuAuthenticated: boolean
  wakuAccountName: string
  wakuAuthLoading: boolean
  wakuAuthError: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:gameMode': [value: GameMode]
  'update:yaotongLength': [value: 4 | 8 | 16]
  'update:yaotongMode': [value: YaotongMode]
  'update:nicknameInput': [value: string]
  'update:joinCode': [value: string]
  'update:animeCharacterId': [value: CharacterId]
  startLocal: []
  createRoom: []
  joinRoom: []
  resumeSession: []
  copyRoom: []
  toggleReady: []
  startRemote: []
  leaveRoom: []
  closeRoom: []
  leaveMatch: []
  openStats: []
  openReplay: []
  openRules: []
  wakuLogin: []
  wakuLogout: []
}>()

type DialogName = 'create' | 'join' | 'match' | 'mode' | 'character' | null
const dialog = ref<DialogName>(null)
const pickerReturn = ref<'create' | null>(null)

const matchOption = computed(() => ({
  name: ({ 4: '东风场', 8: '半庄场', 16: '全庄场' })[props.yaotongLength],
  description: `${props.yaotongLength}庄次 · 连庄不增加庄次`,
}))
const modeOption = computed(() => YAOTONG_MODES[props.yaotongMode])
const dialogTitle = computed(() => ({
  create: '创建房间',
  join: '加入房间',
  match: '选择场次',
  mode: '选择模式',
  character: '本家形象',
}[dialog.value ?? 'create']))

function openPicker(name: 'match' | 'mode', fromCreate = false) {
  pickerReturn.value = fromCreate ? 'create' : null
  dialog.value = name
}

function closePicker() {
  dialog.value = pickerReturn.value
  pickerReturn.value = null
}

function selectMatch(value: 4 | 8 | 16) {
  emit('update:yaotongLength', value)
  closePicker()
}

function selectMode(value: YaotongMode) {
  emit('update:yaotongMode', value)
  closePicker()
}

function selectCharacter(value: CharacterId) {
  emit('update:animeCharacterId', value)
  dialog.value = null
}

function confirmCreate() {
  dialog.value = null
  emit('createRoom')
}

function confirmJoin() {
  dialog.value = null
  emit('joinRoom')
}

function closeDialog() {
  if (dialog.value === 'match' || dialog.value === 'mode') {
    closePicker()
    return
  }
  dialog.value = null
}

function toggleWakuDemoAuth() {
  if (props.wakuAuthenticated) emit('wakuLogout')
  else emit('wakuLogin')
}
</script>

<template>
  <section class="lobby" :class="{ 'room-focused': Boolean(roomId) }">
    <div class="lobby-layout" :class="{ 'room-focused': Boolean(roomId) }">
      <LobbyThemeVisual
        :theme-name="tableThemeName"
        :character-id="animeCharacterId"
        @select-character="dialog = 'character'"
      />

      <section class="lobby-actions" aria-label="对局操作">
        <div class="lobby-account-slot">
          <div class="waku-account" :class="{ authenticated: wakuAuthenticated }">
            <div>
              <b>{{ wakuAuthenticated ? (wakuAccountName || 'WakuDemo 玩家') : 'WakuDemo 账号' }}</b>
              <small>{{ wakuAuthenticated ? '已安全登录' : '登录后关联平台身份' }}</small>
            </div>
            <button type="button" data-action-role="secondary" :disabled="wakuAuthLoading"
              @click="toggleWakuDemoAuth">
              {{ wakuAuthLoading ? '处理中…' : (wakuAuthenticated ? '退出' : '登录') }}
            </button>
          </div>
          <p v-if="wakuAuthError" class="waku-auth-error" role="alert">{{ wakuAuthError }}</p>
        </div>

        <button v-if="storedSession && !roomId" class="continue-session" @click="$emit('resumeSession')">
          ⏵ 继续对局<template v-if="storedSession.roomId">（房间 {{ storedSession.roomId }}）</template>
        </button>

        <div class="mode-selector" role="radiogroup" aria-label="游戏模式">
          <button data-action-role="secondary" role="radio" :aria-checked="gameMode === 'local'"
            :class="{ active: gameMode === 'local' }"
            @click="$emit('update:gameMode', 'local')">
            <b>单机对战</b><span>与 AI 同桌</span>
          </button>
          <button data-action-role="secondary" role="radio" :aria-checked="gameMode === 'remote'"
            :class="{ active: gameMode === 'remote' }"
            @click="$emit('update:gameMode', 'remote')">
            <b>联机对战</b><span>创建或加入房间</span>
          </button>
        </div>

        <template v-if="gameMode === 'local'">
          <GameSettingsSummary
            :match-name="matchOption.name" :match-description="matchOption.description"
            rule-label="模式" :rule-name="modeOption.name" :rule-description="modeOption.summary"
            @select-match="openPicker('match')" @select-rule="openPicker('mode')"
          />
          <button class="start-button" data-action-role="primary" @click="$emit('startLocal')">
            <b>开始{{ matchOption.name }}</b><span>幺筒麻将 · 四人对局</span>
          </button>
        </template>

        <div v-else class="remote-lobby">
          <label v-if="!roomId" class="remote-field">
            <span>昵称</span>
            <input :value="nicknameInput" maxlength="12" placeholder="输入昵称"
              data-testid="lobby-nickname"
              @input="$emit('update:nicknameInput', ($event.target as HTMLInputElement).value)"
              @keyup.enter="dialog = 'create'" />
          </label>
          <p v-if="roomMeta && !roomId" class="room-meta-note" role="status">
            剩余房间 <b>{{ roomMeta.max - roomMeta.active }}</b> / {{ roomMeta.max }}
          </p>
          <div v-if="!roomId" class="remote-entry-actions">
            <button class="remote-create" data-action-role="primary" data-testid="lobby-create"
              :disabled="!wakuAuthenticated || !nicknameInput.trim() || sessionStatus === 'creating'"
              @click="dialog = 'create'">
              {{ sessionStatus === 'creating' ? '创建中…' : '创建房间' }}
            </button>
            <button class="remote-join-btn" data-action-role="primary" data-testid="lobby-join"
              :disabled="!wakuAuthenticated || !nicknameInput.trim() || sessionStatus === 'joining'"
              @click="dialog = 'join'">
              {{ sessionStatus === 'joining' ? '加入中…' : '加入房间' }}
            </button>
          </div>
          <p v-if="!wakuAuthenticated" class="room-meta-note">
            联机对战需要先登录 WakuDemo 账号。
          </p>
          <p v-if="sessionError" class="session-error" role="alert">{{ sessionError }}</p>

          <RoomPanel
            v-if="roomId"
            :room-id="roomId"
            :room-time-limit="roomTimeLimit"
            :room-status="roomStatus"
            :room-seats="roomSeats"
            :reserved-seats="[]"
            :llm-enabled="false"
            :effective-llm-enabled="false"
            :llm-available="false"
            :llm-providers="[]"
            :my-seat="mySeat"
            :is-creator="isCreator"
            :session-status="sessionStatus"
            :all-occupied-ready="allOccupiedReady"
            :match-starting="matchStarting"
            :copied="copied"
            :leaving="leaving"
            :closing="closing"
            :match-name="matchOption.name"
            :rule-name="modeOption.name"
            :table-theme-name="tableThemeName"
            :character-id="animeCharacterId"
            @copy="$emit('copyRoom')"
            @toggle-ready="$emit('toggleReady')"
            @start="$emit('startRemote')"
            @leave="$emit('leaveRoom')"
            @close="$emit('closeRoom')"
            @resume="$emit('resumeSession')"
            @leave-match="$emit('leaveMatch')"
            @open-character="dialog = 'character'"
            @update:character-id="$emit('update:animeCharacterId', $event)"
          />
        </div>

        <div class="lobby-links">
          <button class="text-button" data-action-role="light"
            @click="$emit('openStats')">我的战绩 →</button>
          <button class="text-button" data-action-role="light" data-testid="open-replay"
            @click="$emit('openReplay')">对局回放 →</button>
          <button class="text-button" data-action-role="light"
            @click="$emit('openRules')">游戏规则 →</button>
        </div>
      </section>
    </div>

    <LobbyDialog v-if="dialog" :title="dialogTitle"
      :wide="dialog === 'mode' || dialog === 'character'"
      :theme-name="tableThemeName" :variant="dialog" @close="closeDialog">
      <template v-if="dialog === 'create'">
        <GameSettingsSummary
          :match-name="matchOption.name" :match-description="matchOption.description"
          rule-label="模式" :rule-name="modeOption.name" :rule-description="modeOption.summary"
          @select-match="openPicker('match', true)" @select-rule="openPicker('mode', true)"
        />
        <label class="remote-llm-create-option disabled">
          <input type="checkbox" disabled>
          <span>
            <b>空位使用服务端 AI 补位</b>
            <small>第一版不含大模型座位；四个座位中未入座的空位由服务端 AI 开局补位。</small>
          </span>
        </label>
        <div class="dialog-actions">
          <button class="secondary" type="button" data-action-role="light" @click="dialog = null">取消</button>
          <button class="primary" type="button" data-action-role="primary"
            data-testid="lobby-create-confirm"
            :disabled="!wakuAuthenticated || !nicknameInput.trim() || sessionStatus === 'creating'"
            @click="confirmCreate">确认创建</button>
        </div>
      </template>

      <template v-else-if="dialog === 'join'">
        <label class="join-dialog-field">
          <span>房间码</span>
          <input :value="joinCode" maxlength="6" autofocus placeholder="输入 6 位房间码"
            data-testid="lobby-join-code"
            @input="$emit('update:joinCode', ($event.target as HTMLInputElement).value.toUpperCase())"
            @keyup.enter="joinCode.trim() && confirmJoin()" />
        </label>
        <p class="dialog-hint">场次和规则玩法由房主设置，加入后可查看。</p>
        <div class="dialog-actions">
          <button class="secondary" type="button" data-action-role="light" @click="dialog = null">取消</button>
          <button class="primary" type="button" data-action-role="primary"
            data-testid="lobby-join-confirm"
            :disabled="!wakuAuthenticated || !joinCode.trim() || sessionStatus === 'joining'"
            @click="confirmJoin">确认加入</button>
        </div>
      </template>

      <AnimeCharacterPicker v-else-if="dialog === 'character'"
        :model-value="animeCharacterId" @update:model-value="selectCharacter" />
      <YaotongMatchPicker v-else-if="dialog === 'match'" :model-value="yaotongLength"
        @close="closePicker" @confirm="selectMatch" />
      <YaotongModePicker v-else-if="dialog === 'mode'" :model-value="yaotongMode"
        @close="closePicker" @confirm="selectMode" />
    </LobbyDialog>
  </section>
</template>

<style scoped>
.lobby-actions { min-width: 0; }
</style>
