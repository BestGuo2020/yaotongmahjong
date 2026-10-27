<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useYaotongSeatAnchors } from './useYaotongSeatAnchors'
import type { GamePlayer } from '../../game/core/contracts/types'
import {
  SETTLEMENT_FLIGHT_MS,
  settlementFlights,
  type SettlementCue,
} from '../../game/variants/yaotong/presentation'

const props = defineProps<{ cue: SettlementCue; players: GamePlayer[] }>()
const root = ref<HTMLElement | null>(null)
const { size, anchors, measure } = useYaotongSeatAnchors(root)
watch(() => props.cue.id, measure, { flush: 'post' })
const effects = computed(() =>
  [
    ...new Set([
      ...props.cue.burned,
      ...props.cue.gifts.map((gift) => gift.seat),
      ...(props.cue.kills ?? []).flatMap((kill) => [kill.from, kill.to]),
      ...(props.cue.responsibilities ?? []).flatMap((p) => [p.from, p.to]),
    ]),
  ]
    .map((seat) => ({
      seat,
      responsibilityPaid: (props.cue.responsibilities ?? [])
        .filter((p) => p.from === seat)
        .reduce((sum, p) => sum + p.amount, 0),
      responsibilityEarned: (props.cue.responsibilities ?? [])
        .filter((p) => p.to === seat)
        .reduce((sum, p) => sum + p.amount, 0),
      burned: props.cue.burned.includes(seat),
      amount: props.cue.gifts.find((gift) => gift.seat === seat)?.amount ?? 0,
      killPaid: (props.cue.kills ?? [])
        .filter((kill) => kill.from === seat)
        .reduce((sum, kill) => sum + kill.amount, 0),
      killEarned: (props.cue.kills ?? [])
        .filter((kill) => kill.to === seat)
        .reduce((sum, kill) => sum + kill.amount, 0),
    }))
    .filter((effect) => anchors.value[effect.seat]),
)
const plannedFlights = computed(() => settlementFlights(props.cue))
type Box = { x: number; y: number; width: number; height: number }
const labelSizes = shallowRef<Record<number, { width: number; height: number }>>({})
const controls = shallowRef<Box[]>([])
const insets = shallowRef({ top: 8, right: 8, bottom: 8, left: 8 })
let labelObserver: ResizeObserver | undefined
const observedLabels = new Set<Element>()
function measureLabels() {
  const host = root.value
  if (!host) return
  const next: typeof labelSizes.value = {}
  host.querySelectorAll<HTMLElement>('[data-effect-label-seat]').forEach(label => {
    // offset sizes exclude the entrance animation's scale, so labels do not jump mid-animation.
    next[Number(label.dataset.effectLabelSeat)] = { width: label.offsetWidth, height: label.offsetHeight }
    if (labelObserver && !observedLabels.has(label)) {
      labelObserver.observe(label)
      observedLabels.add(label)
    }
  })
  labelSizes.value = next
  const style = getComputedStyle(host)
  insets.value = { top: parseFloat(style.paddingTop), right: parseFloat(style.paddingRight),
    bottom: parseFloat(style.paddingBottom), left: parseFloat(style.paddingLeft) }
  const rect = host.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  const elements = [...(host.parentElement?.querySelectorAll('.hand-rack, .turn-action-row') ?? []),
    ...(host.closest('.game-app')?.querySelectorAll('.top-bar') ?? [])]
  controls.value = elements.map(element => {
    const r = element.getBoundingClientRect()
    return { x: (r.left - rect.left) * size.value.width / rect.width,
      y: (r.top - rect.top) * size.value.height / rect.height,
      width: r.width * size.value.width / rect.width, height: r.height * size.value.height / rect.height }
  })
}
watch([anchors, () => props.cue], measureLabels, { flush: 'post' })
onMounted(() => { labelObserver = new ResizeObserver(measureLabels); measureLabels() })
onBeforeUnmount(() => { labelObserver?.disconnect(); observedLabels.clear() })

const labelPositions = computed(() => {
  const placed: Record<number, Box> = {}
  const obstacles = [...Object.values(anchors.value).map(a => a.card), ...controls.value]
  const gap = 8
  const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.width, b.x + b.width + gap) - Math.max(a.x, b.x - gap))
    * Math.max(0, Math.min(a.y + a.height, b.y + b.height + gap) - Math.max(a.y, b.y - gap))
  for (const effect of effects.value) {
    const dimensions = labelSizes.value[effect.seat]
    if (!dimensions) continue
    const { width, height } = dimensions, card = anchors.value[effect.seat].card
    const x = effect.seat === 1 ? card.x + card.width - width
      : effect.seat === 2 ? card.x + (card.width - width) / 2 : card.x
    const y = effect.seat === 0 ? card.y - height - gap : card.y + card.height + gap
    const candidates = [
      { x, y }, { x: card.x + card.width + gap, y: card.y + card.height - height },
      { x: card.x - width - gap, y: card.y }, { x, y: card.y - height - gap },
    ]
    // A burn can coincide with gifts and report fees. Fit the full measured stack, and
    // move later seats' labels around it instead of painting one account over another.
    for (const other of Object.values(placed)) {
      candidates.push({ x: other.x + other.width + gap, y }, { x: other.x - width - gap, y },
        { x, y: other.y - height - gap }, { x, y: other.y + other.height + gap })
    }
    const fitted = candidates.map(p => ({ ...dimensions,
      x: Math.max(insets.value.left, Math.min(size.value.width - insets.value.right - width, p.x)),
      y: Math.max(insets.value.top, Math.min(size.value.height - insets.value.bottom - height, p.y)),
    }))
    const cost = (box: Box) => obstacles.reduce((total, other) => total + overlap(box, other), 0) * 1000
      + Math.hypot(box.x - x, box.y - y)
    const best = fitted.sort((a, b) => cost(a) - cost(b))[0]
    placed[effect.seat] = best
    obstacles.push(best)
  }
  return placed
})
const effectSize = (seat: number) => anchors.value[seat].avatarSize + 8
function labelStyle(seat: number) {
  const box = labelPositions.value[seat], anchor = anchors.value[seat]
  return box ? { left: `${box.x - anchor.x + effectSize(seat) / 2}px`,
    top: `${box.y - anchor.y + effectSize(seat) / 2}px` } : { visibility: 'hidden' as const }
}
const payments = computed(() =>
  plannedFlights.value.flatMap((payment) => {
    const from = anchors.value[payment.from],
      to = anchors.value[payment.to]
    if (!from || !to) return []
    const dx = to.x - from.x,
      dy = to.y - from.y,
      length = Math.hypot(dx, dy) || 1
    const inset = Math.min(30, length / 4)
    const halfWidth = payment.kind === 'gift' ? 29 : 41
    const within = (p: { x: number; y: number }) => ({
      x: Math.max(insets.value.left + halfWidth, Math.min(size.value.width - insets.value.right - halfWidth, p.x)),
      y: Math.max(insets.value.top + 17, Math.min(size.value.height - insets.value.bottom - 17, p.y)),
    })
    const start = within({ x: from.x + (dx / length) * inset, y: from.y + (dy / length) * inset })
    const end = within({ x: to.x - (dx / length) * inset, y: to.y - (dy / length) * inset })
    // Gift, kill and responsibility fees can share a pair, even in opposite directions.
    // Bend against a canonical seat order so their account lines never collapse onto one another.
    const mixedPair = plannedFlights.value.some(
      (other) =>
        other.kind !== payment.kind &&
        ((other.from === payment.from && other.to === payment.to) ||
          (other.from === payment.to && other.to === payment.from)),
    )
    const bend = mixedPair
      ? (payment.from < payment.to ? 1 : -1) * { kill: -0.16, responsibility: 0, gift: 0.16 }[payment.kind]
      : 0.08
    const control = within({ x: (start.x + end.x) / 2 - dy * bend, y: (start.y + end.y) / 2 + dx * bend })
    const middle = { x: (start.x + 2 * control.x + end.x) / 4, y: (start.y + 2 * control.y + end.y) / 4 }
    return [
      {
        ...payment,
        start,
        middle,
        path: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`,
      },
    ]
  }),
)
const position = (seat: number) => ({
  left: `${anchors.value[seat].x}px`,
  top: `${anchors.value[seat].y}px`,
  '--effect-size': `${effectSize(seat)}px`,
  '--responsibility-credit-delay': `${SETTLEMENT_FLIGHT_MS + Math.max(0, ...plannedFlights.value.filter((p) => p.to === seat && p.kind === 'responsibility').map((p) => p.delayMs))}ms`,
  '--gift-credit-delay': `${SETTLEMENT_FLIGHT_MS + Math.max(0, ...plannedFlights.value.filter((p) => p.to === seat && p.kind === 'gift').map((p) => p.delayMs))}ms`,
  '--kill-credit-delay': `${SETTLEMENT_FLIGHT_MS + Math.max(0, ...plannedFlights.value.filter((p) => p.to === seat && p.kind === 'kill').map((p) => p.delayMs))}ms`,
})
</script>

<template>
  <div ref="root" class="yaotong-settlement-effects" :data-settlement-cue="cue.id">
    <svg
      v-if="payments.length"
      class="gift-flights"
      :viewBox="`0 0 ${size.width} ${size.height}`"
      role="group"
      aria-label="分项付款方向"
    >
      <defs>
        <marker
          v-for="kind in ['gift', 'kill', 'responsibility']"
          :key="kind"
          :id="`${kind}-arrow-${cue.id}`"
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path
            d="M0 0 L8 4 L0 8 Z"
            :fill="kind === 'responsibility' ? '#b2d8ff' : kind === 'kill' ? '#81e2e2' : '#f3ce78'"
          />
        </marker>
      </defs>
      <g
        v-for="payment in payments"
        :key="`${cue.id}/${payment.kind}/${payment.from}/${payment.to}`"
        :class="`flight-${payment.kind}`"
        :data-flight-kind="payment.kind"
        :data-from="payment.from"
        :data-to="payment.to"
        :data-amount="payment.amount"
        :aria-label="`${players[payment.from]?.name}向${players[payment.to]?.name}${payment.kind === 'responsibility' ? '支付幺筒责任款' : payment.kind === 'kill' ? '额外支付杀报款' : '支付见面礼'}${payment.amount}分`"
        role="img"
      >
        <path class="gift-trail" :d="payment.path" :marker-end="`url(#${payment.kind}-arrow-${cue.id})`" />
        <text
          v-if="payment.kind === 'gift'"
          class="gift-debit"
          :x="payment.start.x"
          :y="payment.start.y - 12"
        >
          −{{ payment.amount }}
        </text>
        <g class="gift-packet" :style="{ '--flight-delay': `${payment.delayMs}ms` }">
          <rect
            :x="payment.kind !== 'gift' ? -39 : -27"
            y="-15"
            :width="payment.kind !== 'gift' ? 78 : 54"
            height="30"
            rx="15"
          />
          <text text-anchor="middle" y="5">
            {{ payment.kind === 'responsibility' ? '责 ' : payment.kind === 'kill' ? '杀报 ' : ''
            }}{{ payment.amount }}
          </text>
          <animateMotion
            :path="payment.path"
            :dur="`${SETTLEMENT_FLIGHT_MS}ms`"
            :begin="`${payment.delayMs}ms`"
            fill="freeze"
            repeatCount="1"
          />
        </g>
        <g class="gift-static-amount" :transform="`translate(${payment.middle.x},${payment.middle.y})`">
          <rect
            :x="payment.kind !== 'gift' ? -39 : -27"
            y="-15"
            :width="payment.kind !== 'gift' ? 78 : 54"
            height="30"
            rx="15"
          />
          <text text-anchor="middle" y="5">
            {{ payment.kind === 'responsibility' ? '责 ' : payment.kind === 'kill' ? '杀报 ' : ''
            }}{{ payment.amount }}
          </text>
        </g>
      </g>
    </svg>
    <div
      v-for="effect in effects"
      :key="`${cue.id}/${effect.seat}`"
      class="seat-special-effect"
      :class="[
        {
          burn: effect.burned,
          gift: effect.amount > 0,
          'killed-report': effect.killPaid > 0,
          'kill-credit-seat': effect.killEarned > 0,
          'responsibility-seat': effect.responsibilityPaid > 0 || effect.responsibilityEarned > 0,
        },
        `from-${['bottom', 'right', 'top', 'left'][effect.seat]}`,
      ]"
      :style="position(effect.seat)"
      :data-effect-seat="effect.seat"
      :data-burned="effect.burned"
      :data-gift-amount="effect.amount"
      :data-kill-paid="effect.killPaid"
      :data-kill-earned="effect.killEarned"
      :data-responsibility-paid="effect.responsibilityPaid"
      :data-responsibility-earned="effect.responsibilityEarned"
      role="status"
      :aria-label="`${players[effect.seat]?.name}${effect.responsibilityPaid ? `责任款支付${effect.responsibilityPaid}分。` : ''}${effect.responsibilityEarned ? `责任款收取${effect.responsibilityEarned}分。` : ''}${effect.burned ? '烧鸡，鸡分收益归零。' : ''}${effect.killPaid ? `被杀报，额外支付${effect.killPaid}分。` : ''}${effect.killEarned ? `杀报额外收取${effect.killEarned}分。` : ''}${effect.amount ? `获得见面礼${effect.amount}分` : ''}`"
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
      <svg v-if="effect.killPaid" class="report-break" viewBox="0 0 100 100" aria-hidden="true">
        <path class="report-break-slash" d="M12 15 L42 43 L35 49 L65 70 L88 86" />
        <path class="report-break-cracks" d="M39 40 L55 19 M48 58 L28 82 M65 70 L81 55" />
      </svg>
      <span
        v-for="n in 8"
        :key="n"
        class="seat-spark"
        :style="{ '--angle': `${n * 45}deg`, '--delay': `${n * 0.025}s` }"
        aria-hidden="true"
      ></span>
      <div class="seat-effect-label" :data-effect-label-seat="effect.seat" :style="labelStyle(effect.seat)">
        <div v-if="effect.responsibilityPaid" class="seat-account-total responsibility-debit">
          <strong>责</strong><b>−{{ effect.responsibilityPaid }}</b>
        </div>
        <div v-if="effect.responsibilityEarned" class="seat-account-total responsibility-credit">
          <strong>责</strong><b>+{{ effect.responsibilityEarned }}</b>
        </div>
        <strong v-if="effect.burned" class="burn-title">烧鸡</strong>
        <div v-if="effect.killPaid" class="seat-account-total kill-debit">
          <strong>被杀报</strong><b>−{{ effect.killPaid }}</b>
        </div>
        <template v-if="effect.amount">
          <span class="gift-tiles" aria-hidden="true"><i v-for="n in 4" :key="n">◉</i></span>
          <div class="seat-account-total gift-total">
            <strong class="gift-title">见面礼</strong><b>+{{ effect.amount }}</b>
          </div>
        </template>
        <div v-if="effect.killEarned" class="seat-account-total kill-credit">
          <strong>杀报</strong><b>+{{ effect.killEarned }}</b>
        </div>
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
  box-sizing: border-box;
  padding: max(8px, var(--safe-top, 0px)) max(8px, var(--safe-right, 0px))
    max(8px, var(--safe-bottom, 0px)) max(8px, var(--safe-left, 0px));
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
.flight-kill .gift-trail {
  stroke: #81e2e2;
  stroke-dasharray: 3 4;
  opacity: 0.85;
}
.flight-kill .gift-packet rect,
.flight-kill .gift-static-amount rect {
  fill: #164650;
  stroke: #a5f3ed;
}
.flight-kill .gift-packet text,
.flight-kill .gift-static-amount text {
  fill: #e7fffa;
  font-size: 15px;
}
.seat-special-effect.kill-credit-seat {
  color: #81e2e2;
}
.seat-special-effect.killed-report {
  color: #f1879d;
}
.report-break {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  filter: drop-shadow(0 0 5px #f1879d);
}
.report-break path {
  fill: none;
  stroke: #ffb9c6;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.report-break-slash {
  stroke-width: 6;
  stroke-dasharray: 140;
  animation: report-shatter 0.3s ease-out both;
}
.report-break-cracks {
  stroke-width: 3;
  animation: seat-label-in 0.3s 0.15s ease-out both;
}
.seat-account-total {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 3px;
}
.seat-account-total.kill-debit strong,
.seat-account-total.kill-debit b {
  color: #ffa3b6;
}
.seat-account-total.kill-credit strong,
.seat-account-total.kill-credit b {
  color: #a7f4ec;
}
.seat-account-total.kill-debit b {
  animation: none;
}
.seat-account-total.gift-total b {
  animation-delay: var(--gift-credit-delay, 0.72s);
}
.seat-account-total.kill-credit b {
  animation-delay: var(--kill-credit-delay, 0.72s);
}
.flight-responsibility .gift-trail {
  stroke: #b2d8ff;
}
.flight-responsibility .gift-packet rect,
.flight-responsibility .gift-static-amount rect {
  fill: #243c59;
  stroke: #b2d8ff;
}
.flight-responsibility .gift-packet text,
.flight-responsibility .gift-static-amount text {
  fill: #e3f1ff;
}
.responsibility-credit strong,
.responsibility-credit b {
  color: #b2d8ff !important;
}
.responsibility-debit strong,
.seat-account-total.responsibility-debit b {
  color: #edb096 !important;
}
.responsibility-debit b {
  animation: none;
}
.seat-account-total.responsibility-credit b {
  animation-delay: var(--responsibility-credit-delay);
}
.seat-special-effect.responsibility-seat {
  color: #b2d8ff;
}
@keyframes report-shatter {
  from {
    stroke-dashoffset: 140;
    opacity: 0.3;
  }
  to {
    stroke-dashoffset: 0;
    opacity: 1;
  }
}
.seat-special-effect {
  position: absolute;
  width: var(--effect-size);
  height: var(--effect-size);
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
  width: max-content;
  max-width: calc(100cqw - 32px);
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
  animation: gift-credit-in 0.25s ease-out both;
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
    translate: 0 calc(var(--effect-size) * 0.15);
  }
  25% {
    opacity: 0.75;
  }
  70% {
    opacity: 0.55;
  }
  100% {
    opacity: 0;
    translate: 0 calc(var(--effect-size) * -0.25);
    filter: grayscale(1);
  }
}
@keyframes seat-spark {
  0% {
    opacity: 0;
    transform: rotate(var(--angle)) translateY(calc(var(--effect-size) * -0.4));
  }
  20% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: rotate(var(--angle)) translateY(calc(var(--effect-size) * -0.8)) scale(0.2);
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
@container game (max-height:600px) or (max-width:600px) {
  .seat-effect-label strong {
    font-size: 16px;
  }
  .seat-effect-label b {
    font-size: 16px;
  }
  .seat-account-total {
    gap: 4px;
    margin-top: 2px;
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
  .report-break path,
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
