<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import type { GamePlayer } from '../../game/core/contracts/types'
import type { SettlementCue } from '../../game/variants/yaotong/presentation'

const props = defineProps<{ cue: SettlementCue; players: GamePlayer[] }>()
const root = ref<HTMLElement | null>(null)
const size = shallowRef({ width: 1, height: 1 })
const anchors = shallowRef<Record<number, { x: number; y: number; cardBottom: number }>>({})
let observer: ResizeObserver | undefined
function measure() {
  const host = root.value
  if (!host) return
  const rect = host.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  const width = host.clientWidth,
    height = host.clientHeight
  const found: typeof anchors.value = {}
  for (let seat = 0; seat < 4; seat++) {
    const card = host.parentElement?.querySelector(`[data-yaotong-seat="${seat}"]`)
    const avatar = card?.querySelector('.avatar')
    if (!avatar) continue
    const a = avatar.getBoundingClientRect()
    found[seat] = {
      x: ((a.left + a.width / 2 - rect.left) * width) / rect.width,
      y: ((a.top + a.height / 2 - rect.top) * height) / rect.height,
      cardBottom: ((card!.getBoundingClientRect().bottom - a.top - a.height / 2) * height) / rect.height,
    }
  }
  size.value = { width, height }
  anchors.value = found
}
onMounted(() => {
  measure()
  observer = new ResizeObserver(measure)
  observer.observe(root.value!)
  root
    .value!.parentElement?.querySelectorAll('[data-yaotong-seat]')
    .forEach((seat) => observer!.observe(seat))
  window.addEventListener('resize', measure)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('resize', measure)
})
watch(() => props.cue.id, measure, { flush: 'post' })
const effects = computed(() =>
  [...new Set([...props.cue.burned, ...props.cue.gifts.map((gift) => gift.seat)])]
    .map((seat) => ({
      seat,
      burned: props.cue.burned.includes(seat),
      amount: props.cue.gifts.find((gift) => gift.seat === seat)?.amount ?? 0,
    }))
    .filter((effect) => anchors.value[effect.seat]),
)
const payments = computed(() =>
  props.cue.payments.flatMap((payment) => {
    const from = anchors.value[payment.from],
      to = anchors.value[payment.to]
    if (!from || !to) return []
    const dx = to.x - from.x,
      dy = to.y - from.y,
      length = Math.hypot(dx, dy) || 1
    const inset = Math.min(30, length / 4)
    const start = { x: from.x + (dx / length) * inset, y: from.y + (dy / length) * inset }
    const end = { x: to.x - (dx / length) * inset, y: to.y - (dy / length) * inset }
    const middle = { x: (start.x + end.x) / 2 - dy * 0.08, y: (start.y + end.y) / 2 + dx * 0.08 }
    return [
      {
        ...payment,
        start,
        middle,
        path: `M ${start.x} ${start.y} Q ${middle.x} ${middle.y} ${end.x} ${end.y}`,
      },
    ]
  }),
)
const position = (seat: number) => ({
  left: `${anchors.value[seat].x}px`,
  top: `${anchors.value[seat].y}px`,
  '--card-bottom': `${anchors.value[seat].cardBottom}px`,
  '--credit-delay': `${0.72 + Math.max(0, ...props.cue.payments.flatMap((payment, index) => (payment.to === seat ? [index] : []))) * 0.12}s`,
})
</script>

<template>
  <div ref="root" class="yaotong-settlement-effects" :data-settlement-cue="cue.id">
    <svg v-if="payments.length" class="gift-flights" :viewBox="`0 0 ${size.width} ${size.height}`" role="group" aria-label="见面礼付款方向">
      <defs>
        <marker
          :id="`gift-arrow-${cue.id}`"
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M0 0 L8 4 L0 8 Z" fill="#f3ce78" />
        </marker>
      </defs>
      <g
        v-for="(payment, index) in payments"
        :key="`${cue.id}/${payment.from}/${payment.to}`"
        :data-from="payment.from"
        :data-to="payment.to"
        :data-amount="payment.amount"
        :aria-label="`${players[payment.from]?.name}向${players[payment.to]?.name}支付见面礼${payment.amount}分`"
        role="img"
      >
        <path class="gift-trail" :d="payment.path" :marker-end="`url(#gift-arrow-${cue.id})`" />
        <text class="gift-debit" :x="payment.start.x" :y="payment.start.y - 12">−{{ payment.amount }}</text>
        <g class="gift-packet" :style="{ '--flight-delay': `${index * 0.12}s` }">
          <rect x="-27" y="-15" width="54" height="30" rx="15" />
          <text text-anchor="middle" y="5">{{ payment.amount }}</text>
          <animateMotion
            :path="payment.path"
            dur=".72s"
            :begin="`${index * 0.12}s`"
            fill="freeze"
            repeatCount="1"
          />
        </g>
        <g class="gift-static-amount" :transform="`translate(${payment.middle.x},${payment.middle.y})`">
          <rect x="-27" y="-15" width="54" height="30" rx="15" />
          <text text-anchor="middle" y="5">{{ payment.amount }}</text>
        </g>
      </g>
    </svg>
    <div
      v-for="effect in effects"
      :key="`${cue.id}/${effect.seat}`"
      class="seat-special-effect"
      :class="[
        { burn: effect.burned, gift: effect.amount > 0 },
        `from-${['bottom', 'right', 'top', 'left'][effect.seat]}`,
      ]"
      :style="position(effect.seat)"
      :data-effect-seat="effect.seat"
      :data-burned="effect.burned"
      :data-gift-amount="effect.amount"
      role="status"
      :aria-label="`${players[effect.seat]?.name}${effect.burned ? '烧鸡，鸡分收益归零。' : ''}${effect.amount ? `获得见面礼${effect.amount}分` : ''}`"
    >
      <div class="seat-effect-ring" aria-hidden="true"></div>
      <svg v-if="effect.burned" class="burn-flame" viewBox="0 0 100 100" aria-hidden="true">
        <path
          d="M51 4 C64 28 35 33 60 46 C71 37 77 26 74 18 C105 58 89 91 55 96 C17 99 2 69 20 39 C18 58 34 60 34 44 C33 28 47 22 51 4Z"
          fill="#ef6b38"
        />
        <path
          d="M48 42 C63 57 44 64 64 64 C79 79 62 94 49 94 C29 92 23 74 39 60 C36 72 50 67 48 42Z"
          fill="#ffd187"
        />
      </svg>
      <span
        v-for="n in 8"
        :key="n"
        class="seat-spark"
        :style="{ '--angle': `${n * 45}deg`, '--delay': `${n * 0.025}s` }"
        aria-hidden="true"
      ></span>
      <div class="seat-effect-label">
        <strong v-if="effect.burned" class="burn-title">烧鸡</strong>
        <template v-if="effect.amount">
          <span class="gift-tiles" aria-hidden="true"><i v-for="n in 4" :key="n">◉</i></span>
          <strong class="gift-title">见面礼</strong><b>+{{ effect.amount }}</b>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.yaotong-settlement-effects {
  position: absolute;
  inset: 0;
  z-index: 47;
  pointer-events: none;
  overflow: hidden;
}
.gift-flights {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.gift-trail {
  fill: none;
  stroke: #f3ce78;
  stroke-width: 2;
  opacity: 0.6;
  stroke-dasharray: 6 5;
  animation: gift-trail-in 0.22s ease-out both;
}
.gift-debit {
  fill: #edb096;
  font-size: 17px;
  font-weight: 800;
  text-anchor: middle;
  paint-order: stroke;
  stroke: #182b26;
  stroke-width: 4px;
}
.gift-packet {
  opacity: 0;
  animation: gift-packet-life 1.15s var(--flight-delay) ease-out both;
}
.gift-packet rect,
.gift-static-amount rect {
  fill: #f6d47d;
  stroke: #fff0c1;
  stroke-width: 2;
}
.gift-packet text,
.gift-static-amount text {
  fill: #49331c;
  font-size: 17px;
  font-weight: 900;
}
.gift-static-amount {
  display: none;
}
.seat-special-effect {
  position: absolute;
  width: 80px;
  height: 80px;
  transform: translate(-50%, -50%);
  color: #f2c76e;
}
.seat-special-effect.burn {
  color: #f17a56;
}
.seat-effect-ring {
  position: absolute;
  inset: -4px;
  border: 3px solid currentColor;
  border-radius: 22%;
  box-shadow:
    0 0 20px currentColor,
    inset 0 0 12px currentColor;
  animation: seat-special-ring 1.35s ease-out both;
}
.burn-flame {
  position: absolute;
  inset: -8% 4% 0;
  width: 92%;
  height: 100%;
  opacity: 0.65;
  animation: burn-out 1.35s ease-out both;
}
.seat-spark {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 8px currentColor;
  animation: seat-spark 1.1s var(--delay) ease-out both;
}
.seat-effect-label {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  white-space: nowrap;
  filter: drop-shadow(0 3px 5px #000);
  animation: seat-label-in 0.25s ease-out both;
}
.seat-effect-label strong {
  font:
    900 clamp(24px, 4cqh, 34px) 'Microsoft YaHei',
    sans-serif;
  line-height: 1.2;
  color: currentColor;
  -webkit-text-stroke: 0.5px #392b20;
}
.seat-effect-label b {
  font-size: 24px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: #ffe6a2;
  animation: gift-credit-in 0.25s var(--credit-delay, 0.72s) ease-out both;
}
.seat-effect-label .gift-title {
  color: #f2c76e;
}
.burn-title + .gift-tiles {
  margin-top: 6px;
}
.seat-special-effect.burn.gift .seat-effect-ring {
  box-shadow:
    0 0 20px #f2c76e,
    inset 0 0 12px #f17a56;
}
.from-right .seat-effect-label {
  right: calc(100% + 10px);
  top: 12px;
}
.from-left .seat-effect-label {
  left: calc(100% + 10px);
  top: 12px;
}
.from-top .seat-effect-label {
  top: calc(50% + var(--card-bottom) + 8px);
  left: 50%;
  transform: translateX(-50%);
}
.from-bottom .seat-effect-label {
  bottom: calc(100% + 10px);
  left: 50%;
  transform: translateX(-50%);
}
.gift-tiles {
  display: flex;
  gap: 2px;
  margin-bottom: 5px;
}
.gift-tiles i {
  font:
    700 12px Georgia,
    serif;
  color: #914528;
  background: #fff0bf;
  border: 1px solid #d8ac5a;
  border-radius: 3px;
  padding: 2px 3px;
  box-shadow: 0 3px #ad8346;
}
@keyframes seat-special-ring {
  0% {
    opacity: 0;
    scale: 0.85;
  }
  20% {
    opacity: 1;
    scale: 1.05;
  }
  80% {
    opacity: 0.8;
  }
  100% {
    opacity: 0;
    scale: 1.28;
  }
}
@keyframes burn-out {
  0% {
    opacity: 0;
    translate: 0 12px;
  }
  25% {
    opacity: 0.75;
  }
  70% {
    opacity: 0.55;
  }
  100% {
    opacity: 0;
    translate: 0 -20px;
    filter: grayscale(1);
  }
}
@keyframes seat-spark {
  0% {
    opacity: 0;
    transform: rotate(var(--angle)) translateY(-30px);
  }
  20% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: rotate(var(--angle)) translateY(-65px) scale(0.2);
  }
}
@keyframes seat-label-in {
  from {
    opacity: 0;
    scale: 0.8;
  }
  to {
    opacity: 1;
    scale: 1;
  }
}
@keyframes gift-credit-in {
  from {
    opacity: 0;
    translate: 0 8px;
  }
  to {
    opacity: 1;
    translate: 0 0;
  }
}
@keyframes gift-trail-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 0.6;
  }
}
@keyframes gift-packet-life {
  0% {
    opacity: 0;
  }
  10%,
  80% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
@container game (max-height:600px) {
  .seat-special-effect {
    width: 58px;
    height: 58px;
  }
  .seat-effect-label strong {
    font-size: 20px;
  }
  .seat-effect-label b {
    font-size: 20px;
  }
  .gift-tiles {
    margin-bottom: 3px;
  }
  .gift-tiles i {
    font-size: 9px;
    padding: 1px 2px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .seat-effect-ring,
  .burn-flame,
  .seat-effect-label,
  .seat-effect-label b,
  .gift-trail {
    animation: none;
  }
  .seat-effect-ring {
    opacity: 0.75;
    box-shadow: none;
  }
  .burn-flame {
    opacity: 0.35;
  }
  .seat-spark,
  .gift-packet {
    display: none;
  }
  .gift-static-amount {
    display: block;
  }
}
</style>
