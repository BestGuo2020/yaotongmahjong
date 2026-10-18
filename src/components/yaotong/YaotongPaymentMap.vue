<script setup lang="ts">
import { computed, ref } from 'vue'
import type { GamePlayer } from '../../game/core/contracts/types'
import type { TableThemeName } from '../table/three/tableTheme'
import { animeAvatarForPlayer } from '../../game/core/presentation/animeAvatarPresentation'
import { displayImageSrc } from '../../game/core/presentation/imagePreload'
import { giftAwards, giftPayments, paymentEdges } from '../../game/variants/yaotong/presentation'
import type { Account, Transfer } from '../../game/variants/yaotong/types'

const props = defineProps<{
  transfers: Transfer[]
  players: GamePlayer[]
  themeName?: TableThemeName
  handNumber: number
  burnedSeats?: number[]
}>()
const emit = defineEmits<{ inspect: [pair: { from: number; to: number; account?: Account }] }>()
const selected = ref(0)
const mode = ref<'net' | 'gift'>('net')
const gifts = computed(() => giftAwards(props.transfers))
const edges = computed(() =>
  (mode.value === 'gift' ? giftPayments(props.transfers) : paymentEdges(props.transfers)).filter(
    (edge) => edge.from === selected.value || edge.to === selected.value,
  ),
)
function showGift() {
  mode.value = 'gift'
  selected.value = gifts.value[0]?.seat ?? selected.value
}
function inspect(from: number, to: number) {
  emit('inspect', { from, to, account: mode.value === 'gift' ? '见面礼' : undefined })
}
const others = computed(() => [0, 1, 2, 3].filter((seat) => seat !== selected.value))
const position = (seat: number) =>
  seat === selected.value ? { x: 300, y: 139 } : { x: [85, 300, 515][others.value.indexOf(seat)], y: 30 }
function path(from: number, to: number) {
  const a = position(from),
    b = position(to),
    down = a.y < b.y
  return `M ${a.x} ${a.y + (down ? 23 : -23)} Q ${(a.x + b.x) / 2} 85 ${b.x} ${b.y + (down ? -23 : 23)}`
}
const avatar = (player: GamePlayer) =>
  displayImageSrc(props.themeName === 'llmAnime' ? animeAvatarForPlayer(player) : player.avatar)
const label = (from: number, to: number, amount: number) =>
  `${props.players[from].name}向${props.players[to].name}${mode.value === 'gift' ? '支付见面礼' : '净付'}${amount}分`
</script>
<template>
  <section class="yaotong-payment-map" :class="{ 'gift-mode': mode === 'gift' }" aria-label="本局分数流向">
    <header>
      <span v-if="gifts.length" class="payment-modes" role="group" aria-label="收付分项">
        <button :aria-pressed="mode === 'net'" :class="{ selected: mode === 'net' }" @click="mode = 'net'">
          净收付
        </button>
        <button :aria-pressed="mode === 'gift'" :class="{ selected: mode === 'gift' }" @click="showGift">
          见面礼
        </button>
      </span>
      <span v-else>本局净收付</span
      ><span class="payment-viewers" role="group" aria-label="查看玩家收付"
        ><button
          v-for="(p, seat) in players"
          :key="seat"
          :class="{ selected: selected === seat }"
          :aria-pressed="selected === seat"
          @click="selected = seat"
        >
          {{ p.name }}
        </button></span
      >
    </header>
    <svg viewBox="0 0 600 180" role="group" :aria-label="`${players[selected]?.name}的本局收付`">
      <defs>
        <marker
          id="yaotong-pay-arrow"
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L8 4 L0 8 Z" fill="context-stroke" />
        </marker>
        <clipPath id="yaotong-pay-avatar"><circle r="20" /></clipPath>
      </defs>
      <g
        v-for="edge in edges"
        :key="`${handNumber}/${mode}/${selected}/${edge.from}/${edge.to}`"
        class="payment-edge"
        :class="{ incoming: edge.to === selected }"
        role="button"
        tabindex="0"
        :aria-label="label(edge.from, edge.to, edge.amount)"
        @click="inspect(edge.from, edge.to)"
        @keydown.enter="inspect(edge.from, edge.to)"
        @keydown.space.prevent="inspect(edge.from, edge.to)"
      >
        <title>
          {{ label(edge.from, edge.to, edge.amount) }}；{{
            edge.parts.map((p) => `${p.account}${p.amount > 0 ? '+' : ''}${p.amount}`).join('，')
          }}
        </title>
        <path class="payment-hit" :d="path(edge.from, edge.to)" />
        <path class="payment-line" :d="path(edge.from, edge.to)" marker-end="url(#yaotong-pay-arrow)" />
        <circle class="payment-particle" r="4">
          <animateMotion :path="path(edge.from, edge.to)" dur=".9s" repeatCount="1" fill="freeze" />
          <animate
            attributeName="opacity"
            values="0;1;1;0"
            keyTimes="0;.1;.8;1"
            dur=".9s"
            repeatCount="1"
            fill="freeze"
          />
        </circle>
        <g :transform="`translate(${(position(edge.from).x + position(edge.to).x) / 2},86)`">
          <rect x="-34" y="-12" width="68" height="24" rx="12" />
          <text text-anchor="middle" y="5">{{ edge.to === selected ? '+' : '−' }}{{ edge.amount }}</text>
        </g>
      </g>
      <g
        v-for="(p, seat) in players"
        :key="seat"
        :transform="`translate(${position(seat).x},${position(seat).y})`"
        class="payment-player"
        :class="{
          selected: seat === selected,
          burned: burnedSeats?.includes(seat),
          gifted: gifts.some((gift) => gift.seat === seat),
        }"
      >
        <circle r="22" />
        <image
          :href="avatar(p)"
          x="-20"
          y="-20"
          width="40"
          height="40"
          clip-path="url(#yaotong-pay-avatar)"
        />
        <text y="37" text-anchor="middle">{{ p.name }}</text>
        <g v-if="burnedSeats?.includes(seat)" class="map-burn-mark" :aria-label="`${p.name}烧鸡`">
          <title>烧鸡</title>
          <path d="M-27 -3 C-37 -14 -25 -14 -29 -23 C-12 -12 -15 -2 -23 -2 C-29 -1 -34 -6 -29 -11Z" />
          <text x="-22" y="-24" text-anchor="end">烧鸡</text>
        </g>
        <g
          v-if="gifts.some((gift) => gift.seat === seat)"
          class="map-gift-mark"
          :aria-label="`${p.name}见面礼${gifts.find((gift) => gift.seat === seat)!.amount}分`"
        >
          <title>见面礼</title>
          <text x="30" y="5">礼 +{{ gifts.find((gift) => gift.seat === seat)!.amount }}</text>
        </g>
      </g>
      <text v-if="!edges.length" class="no-payments" x="300" y="92" text-anchor="middle">无收付</text>
    </svg>
  </section>
</template>
<style scoped>
.yaotong-payment-map {
  margin: 12px 0;
  color: var(--theme-text);
  border-top: 1px solid var(--theme-border);
  padding-top: 10px;
}
.yaotong-payment-map header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
}
.payment-viewers {
  display: flex;
  gap: 5px;
}
.payment-modes {
  display: flex;
  gap: 5px;
}
.payment-modes button {
  border: 1px solid transparent;
  border-radius: 20px;
  background: transparent;
  color: var(--theme-text-muted);
  font-size: 11px;
  padding: 4px 8px;
}
.payment-modes button.selected {
  border-color: var(--theme-border);
  color: var(--theme-accent-text);
  background: var(--theme-surface);
}
.gift-mode .payment-edge {
  color: #e6bf6f;
}
.payment-player.gifted > circle {
  stroke: #e6bf6f;
  stroke-width: 3;
  animation: map-gift-glow 1.1s ease-out both;
}
.payment-player.burned > circle {
  stroke: #ed8969;
  stroke-width: 3;
}
.map-burn-mark path {
  fill: #ed8969;
}
.payment-player .map-burn-mark text {
  fill: #ed8969;
  font-size: 10px;
  font-weight: 800;
}
.payment-player .map-gift-mark text {
  fill: #e6bf6f;
  font-size: 11px;
  font-weight: 800;
}
@keyframes map-gift-glow {
  0% {
    stroke-width: 6;
    filter: drop-shadow(0 0 9px #e6bf6f);
  }
  100% {
    stroke-width: 3;
    filter: none;
  }
}
.payment-viewers button {
  border: 1px solid transparent;
  background: transparent;
  color: var(--theme-text-muted);
  font-size: 10px;
  padding: 4px 8px;
  border-radius: 20px;
}
.payment-viewers button.selected {
  border-color: var(--theme-border);
  color: var(--theme-accent-text);
  background: var(--theme-surface);
}
svg {
  display: block;
  width: 100%;
  height: 175px;
  overflow: visible;
}
.payment-edge {
  color: #e1a078;
  cursor: pointer;
}
.payment-edge.incoming {
  color: #8bceac;
}
.payment-line {
  fill: none;
  stroke: currentColor;
  stroke-width: 2.5;
  opacity: 0.85;
}
.payment-hit {
  fill: none;
  stroke: transparent;
  stroke-width: 20;
}
.payment-particle {
  fill: currentColor;
  filter: drop-shadow(0 0 4px currentColor);
}
.payment-edge rect {
  fill: var(--theme-panel);
  stroke: currentColor;
  stroke-width: 1;
}
.payment-edge text {
  fill: currentColor;
  font-size: 15px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.payment-player circle {
  fill: var(--theme-surface);
  stroke: var(--theme-border);
  stroke-width: 1.5;
}
.payment-player.selected circle {
  stroke: var(--theme-accent);
  stroke-width: 2.5;
}
.payment-player text {
  fill: var(--theme-text);
  font-size: 11px;
}
.no-payments {
  fill: var(--theme-text-muted);
  font-size: 12px;
}
.payment-edge:focus-visible {
  outline: none;
}
.payment-edge:focus-visible .payment-line {
  stroke-width: 4;
}
@container game (max-height: 600px) {
  svg {
    height: 110px;
  }
  .yaotong-payment-map {
    margin: 7px 0;
    padding-top: 6px;
  }
  .yaotong-payment-map header {
    font-size: 10px;
  }
  .payment-viewers button {
    padding: 3px 6px;
    font-size: 9px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .payment-player.gifted > circle {
    animation: none;
  }
  .payment-particle {
    display: none;
  }
}
</style>
