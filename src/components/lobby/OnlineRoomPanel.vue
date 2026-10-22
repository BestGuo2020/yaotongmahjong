<script setup lang="ts">
import { computed, ref } from 'vue'

import type { CharacterId } from '../../game/llm/animeCharacters'
import type { useYaotongRemoteGame } from '../../game/variants/yaotong/remote/useYaotongRemoteGame'

const props = defineProps<{
  remote: ReturnType<typeof useYaotongRemoteGame>
  characterId?: CharacterId
}>()
const emit = defineEmits<{ back: [] }>()

const status = computed(() => props.remote.sessionStatus.value)
const error = computed(() => props.remote.sessionError.value)
const roomId = computed(() => props.remote.roomId.value)
const seats = computed(() => props.remote.roomSeats.value)
const mySeat = computed(() => props.remote.mySeat.value)
const isCreator = computed(() => props.remote.isCreator.value)
const creatorSeat = computed(() => props.remote.creatorSeat.value)
const roomStatus = computed(() => props.remote.roomStatus.value)
const matchLength = computed(() => props.remote.matchLength.value)
const signal = computed(() => props.remote.signalQuality.value)
const inRoom = computed(() => Boolean(roomId.value))
const busy = computed(() => status.value === 'creating' || status.value === 'joining')
const canStart = computed(() =>
  isCreator.value && roomStatus.value === 'lobby'
  && seats.value.some(Boolean)
  && seats.value.every((seat) => seat === null || seat.ready))

const nickname = ref('')
const roomCode = ref('')
const createLength = ref<4 | 8 | 16>(4)

const statusText = computed(() => {
  if (status.value === 'creating') return '正在建房…'
  if (status.value === 'joining') return '正在加入…'
  if (status.value === 'lobby') return '已入房 · 等待准备'
  if (status.value === 'playing') return '对局进行中'
  if (status.value === 'finished') return '本场已结束'
  if (status.value === 'error') return '连接失败'
  return '未入房'
})

const lengthLabel = computed(() => ({
  4: '东风场 · 4 庄',
  8: '半庄场 · 8 庄',
  16: '全庄场 · 16 庄',
})[matchLength.value])

async function create() {
  await props.remote.createRoom(
    createLength.value, nickname.value.trim() || '玩家', props.characterId)
}

async function join() {
  const code = roomCode.value.trim().toUpperCase()
  if (code.length !== 6) return
  await props.remote.joinRoom(
    code, nickname.value.trim() || '玩家', props.characterId)
}

async function ready() {
  await props.remote.ready()
}

async function start() {
  await props.remote.startMatch()
}

async function leave() {
  await props.remote.leaveRoom()
}

async function back() {
  if (inRoom.value) await props.remote.leaveRoom()
  emit('back')
}
</script>

<template>
  <section class="online-room" aria-label="幺筒联机房间">
    <header class="online-head">
      <div>
        <p class="eyebrow">幺筒麻将 · 联机</p>
        <h2 data-testid="online-room-id">
          {{ inRoom ? `房间 ${roomId}` : '创建或加入房间' }}
        </h2>
      </div>
      <div class="online-meta">
        <span v-if="inRoom">{{ lengthLabel }}</span>
        <span v-if="inRoom" class="signal" :title="`信号 ${signal}/3`">
          信号 {{ signal }}/3
        </span>
        <button class="text-button" data-action-role="light" @click="back">← 返回大厅</button>
      </div>
    </header>

    <p v-if="error" class="online-error" role="alert">{{ error }}</p>
    <p v-else-if="!inRoom" class="online-hint">
      联机身份使用 wakudemo 登录；空位由服务端 AI 补位。第一版不含大模型座位。
    </p>

    <template v-if="!inRoom">
      <div class="online-grid">
        <section class="online-card">
          <h3>创建房间</h3>
          <label>
            <span>你的昵称</span>
            <input v-model="nickname" maxlength="20" placeholder="玩家"
              data-testid="online-nickname-create" />
          </label>
          <label>
            <span>场次</span>
            <select v-model.number="createLength" data-testid="online-length">
              <option :value="4">东风场 · 4 庄</option>
              <option :value="8">半庄场 · 8 庄</option>
              <option :value="16">全庄场 · 16 庄</option>
            </select>
          </label>
          <button class="primary" :disabled="busy" data-testid="online-create" @click="create">
            {{ busy && status === 'creating' ? '建房中…' : '创建房间' }}
          </button>
        </section>

        <section class="online-card">
          <h3>加入房间</h3>
          <label>
            <span>你的昵称</span>
            <input v-model="nickname" maxlength="20" placeholder="玩家"
              data-testid="online-nickname-join" />
          </label>
          <label>
            <span>房间码</span>
            <input v-model="roomCode" maxlength="6" placeholder="6 位房间码"
              class="room-code" data-testid="online-room-code" @keyup.enter="join" />
          </label>
          <button class="primary" :disabled="busy || roomCode.trim().length !== 6"
            data-testid="online-join" @click="join">
            {{ busy && status === 'joining' ? '加入中…' : '加入房间' }}
          </button>
        </section>
      </div>
    </template>

    <template v-else>
      <div class="online-status">
        <span class="pill">{{ statusText }}</span>
        <span class="pill">{{ roomStatus === 'lobby' ? '等待准备' : '对局中' }}</span>
        <span v-if="mySeat >= 0" class="pill">我的座位：{{ mySeat + 1 }}</span>
      </div>

      <ol class="seat-list">
        <li v-for="(seat, index) in seats" :key="index" :class="{ mine: index === mySeat }">
          <span class="seat-index">{{ index + 1 }}</span>
          <span class="seat-name">{{ seat?.nickname || '空位 · AI 补位' }}</span>
          <span v-if="index === mySeat" class="seat-tag">我</span>
          <span v-if="index === creatorSeat" class="seat-tag owner">房主</span>
          <span class="seat-ready" :class="{ ready: seat?.ready }">
            {{ seat ? (seat.ready ? '已准备' : '未准备') : '—' }}
          </span>
        </li>
      </ol>

      <div class="online-actions">
        <button class="secondary" data-testid="online-ready" @click="ready">
          准备 / 取消准备
        </button>
        <button v-if="isCreator" class="primary" data-testid="online-start"
          :disabled="!canStart" @click="start">
          开始对局
        </button>
        <button class="text-button" data-action-role="light"
          data-testid="online-leave" @click="leave">退出房间</button>
      </div>
      <p class="online-hint">
        房主开始后，四个座位中未入座的空位由服务端 AI 补位。对局中掉线会由 AI 托管，
        凭当前浏览器会话可重进原座位。
      </p>
    </template>
  </section>
</template>

<style scoped>
.online-room { display: grid; gap: 18px; width: min(720px, 100%); margin: 0 auto; padding: 24px; color: var(--theme-text); }
.online-head { display: flex; justify-content: space-between; align-items: end; gap: 16px; flex-wrap: wrap; }
.online-head h2 { margin: 4px 0 0; font-size: 24px; }
.eyebrow { margin: 0; color: var(--theme-text-muted); font-size: 11px; letter-spacing: .14em; }
.online-meta { display: flex; align-items: center; gap: 10px; color: var(--theme-text-muted); font-size: 12px; flex-wrap: wrap; }
.signal { padding: 2px 8px; border: 1px solid var(--theme-border); border-radius: 999px; }
.online-error { margin: 0; padding: 10px 12px; border: 1px solid #b45353; border-radius: 10px; color: #ffd7d7; background: rgba(120, 30, 30, .28); }
.online-hint { margin: 0; color: var(--theme-text-muted); font-size: 12px; line-height: 1.7; }
.online-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; }
.online-card { display: grid; gap: 12px; padding: 16px; border: 1px solid var(--theme-border); border-radius: 12px; background: var(--theme-panel); }
.online-card h3 { margin: 0; font-size: 16px; }
.online-card label { display: grid; gap: 6px; color: var(--theme-text-muted); font-size: 12px; }
.online-card input, .online-card select { min-height: 38px; padding: 0 10px; border: 1px solid var(--theme-border); border-radius: 8px; background: var(--theme-bg); color: var(--theme-text); font: inherit; }
.online-card input.room-code { letter-spacing: .18em; text-transform: uppercase; }
.online-card button, .online-actions button { min-height: 40px; border-radius: 9px; border: 1px solid var(--theme-border); font: inherit; cursor: pointer; }
button.primary { background: var(--theme-accent); color: #17130e; border-color: transparent; font-weight: 700; }
button.secondary { background: transparent; color: var(--theme-text); }
button:disabled { opacity: .45; cursor: not-allowed; }
.online-status { display: flex; gap: 8px; flex-wrap: wrap; }
.pill { padding: 4px 10px; border: 1px solid var(--theme-border); border-radius: 999px; color: var(--theme-text-muted); font-size: 12px; }
.seat-list { list-style: none; display: grid; gap: 8px; margin: 0; padding: 0; }
.seat-list li { display: grid; grid-template-columns: 28px 1fr auto auto; gap: 8px; align-items: center; padding: 10px 12px; border: 1px solid var(--theme-border); border-radius: 10px; background: var(--theme-panel); }
.seat-list li.mine { border-color: var(--theme-accent); }
.seat-index { color: var(--theme-text-muted); font-variant-numeric: tabular-nums; }
.seat-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.seat-tag { padding: 1px 6px; border-radius: 999px; background: var(--theme-border); color: var(--theme-text-muted); font-size: 10px; }
.seat-tag.owner { background: var(--theme-accent); color: #17130e; }
.seat-ready { color: var(--theme-text-muted); font-size: 12px; }
.seat-ready.ready { color: var(--theme-accent); }
.online-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.online-actions button { padding: 0 16px; }
</style>
