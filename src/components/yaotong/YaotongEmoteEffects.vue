<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { EmoteCue } from './useYaotongEmotes'
import { yaotongEmote } from '../../game/variants/yaotong/emotes'
import { useYaotongSeatAnchors } from './useYaotongSeatAnchors'
import YaotongEmoteArt from './YaotongEmoteArt.vue'

const props = defineProps<{ cues: readonly EmoteCue[] }>()
const root = ref<HTMLElement | null>(null)
const { size, anchors, measure } = useYaotongSeatAnchors(root)
watch(() => props.cues, measure, { flush: 'post' })

const performances = computed(() =>
  props.cues.flatMap((cue) => {
    const from = anchors.value[cue.fromSeat] ?? anchors.value[0]
    const target = anchors.value[cue.targetSeat]
    if (!from || !target) return []
    const meta = yaotongEmote(cue.emote)
    const dx = target.x - from.x
    const lift = Math.min(150, Math.max(58, Math.abs(dx) * 0.22 + 38))
    const midX = from.x + dx * 0.5
    const midY = Math.max(24, Math.min(from.y, target.y) - lift)
    return [{
      ...cue,
      meta,
      from,
      target,
      path: `M ${from.x.toFixed(1)} ${from.y.toFixed(1)} Q ${midX.toFixed(1)} ${midY.toFixed(1)} ${target.x.toFixed(1)} ${target.y.toFixed(1)}`,
    }]
  }),
)

const hitTimers = new Map<number, ReturnType<typeof setTimeout>>()
function shakeTarget(seat: number) {
  const host = root.value?.parentElement
  const card = host?.querySelector(`[data-yaotong-seat="${seat}"] .avatar-wrap`)
  if (!(card instanceof HTMLElement)) return
  card.classList.remove('emote-hit-shake')
  void card.offsetWidth
  card.classList.add('emote-hit-shake')
  const previous = hitTimers.get(seat)
  if (previous !== undefined) clearTimeout(previous)
  hitTimers.set(seat, setTimeout(() => {
    card.classList.remove('emote-hit-shake')
    hitTimers.delete(seat)
  }, 560))
}
watch(() => props.cues.map(cue => cue.id).join(','), () => {
  const latest = props.cues[props.cues.length - 1]
  if (latest) shakeTarget(latest.targetSeat)
}, { flush: 'post' })
onBeforeUnmount(() => {
  for (const timer of hitTimers.values()) clearTimeout(timer)
  hitTimers.clear()
  root.value?.parentElement?.querySelectorAll('.emote-hit-shake')
    .forEach(element => element.classList.remove('emote-hit-shake'))
})
</script>

<template>
  <div ref="root" class="yaotong-emote-effects" aria-hidden="true">
    <div v-for="cue in performances" :key="cue.id" class="emote-performance" :data-emote="cue.emote"
      :data-emote-id="cue.id" :data-from-seat="cue.fromSeat" :data-target-seat="cue.targetSeat">
      <svg class="emote-route" :viewBox="`0 0 ${size.width} ${size.height}`" aria-hidden="true">
        <path class="emote-route-glow" :d="cue.path" pathLength="1" />
        <path class="emote-route-line" :d="cue.path" pathLength="1" />
      </svg>
      <div class="emote-start-puff" :style="{ left: `${cue.from.x}px`, top: `${cue.from.y}px` }"></div>
      <div class="emote-target-ring" :style="{
        left: `${cue.target.x}px`, top: `${cue.target.y}px`,
        width: `${cue.target.avatarSize + 32}px`, height: `${cue.target.avatarSize + 32}px`,
      }"></div>
      <div class="emote-projectile" :style="{ offsetPath: `path('${cue.path}')` }">
        <div class="emote-projectile-art"><YaotongEmoteArt :kind="cue.emote" :size="48" /></div>
      </div>
      <div class="emote-impact" :style="{ left: `${cue.target.x}px`, top: `${cue.target.y}px` }">
        <i class="emote-impact-star"></i>
        <i class="emote-impact-burst"></i>
        <i v-for="n in 8" :key="n" class="emote-particle" :style="{ '--angle': `${n * 45}deg` }"></i>
        <YaotongEmoteArt :kind="cue.emote" :size="100" variant="hit" animated class="emote-impact-art" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.yaotong-emote-effects {
  position: absolute;
  inset: 0;
  z-index: 60;
  overflow: hidden;
  pointer-events: none;
}
.emote-performance { position: absolute; inset: 0; }
.emote-route { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.emote-route path { fill: none; stroke-linecap: round; stroke-dasharray: 1 1; }
.emote-route-glow { stroke: #ffd36e; stroke-width: 5; opacity: 0; filter: blur(2px); animation: emote-route .58s ease-out both; }
.emote-route-line { stroke: #fff0bd; stroke-width: 1.2; opacity: 0; animation: emote-route .58s ease-out both; }
.emote-start-puff {
  position: absolute;
  width: 30px;
  height: 30px;
  margin: -15px;
  border: 2px solid #ffe2a0;
  border-radius: 50%;
  opacity: 0;
  animation: emote-puff .5s ease-out both;
}
.emote-projectile {
  position: absolute;
  left: 0;
  top: 0;
  width: 48px;
  height: 48px;
  offset-anchor: 50% 50%;
  offset-rotate: 0deg;
  animation: emote-travel .6s cubic-bezier(.2, .7, .3, 1) both,
    emote-projectile-fade .12s ease-out .48s both;
}
.emote-projectile-art { width: 100%; height: 100%; animation: emote-spin .6s linear both; }
/* 点赞/亲吻是手势，飞行时保持正向，不做翻转。 */
.emote-performance[data-emote="like"] .emote-projectile-art,
.emote-performance[data-emote="kiss"] .emote-projectile-art { animation: none; }
.emote-target-ring {
  position: absolute;
  border: 2px solid #ffd36e;
  border-radius: 50%;
  box-shadow: 0 0 14px rgba(255, 211, 110, .5), inset 0 0 12px rgba(255, 211, 110, .2);
  opacity: 0;
  transform: translate(-50%, -50%) scale(.65);
  animation: emote-ring .8s ease-out .42s both;
}
.emote-impact {
  position: absolute;
  display: grid;
  place-items: center;
  width: 120px;
  height: 120px;
  opacity: 0;
  transform: translate(-50%, -50%) scale(.3);
  animation: emote-impact 1.3s cubic-bezier(.2, .8, .3, 1) .48s both;
}
.emote-impact-star {
  position: absolute;
  z-index: 0;
  width: 80px;
  height: 80px;
  background: #fff1b8;
  clip-path: polygon(50% 0, 61% 30%, 93% 25%, 70% 50%, 93% 75%, 61% 70%, 50% 100%, 39% 70%, 7% 75%, 30% 50%, 7% 25%, 39% 30%);
  filter: drop-shadow(0 0 6px #ffd36e);
  opacity: 0;
  animation: emote-star .6s cubic-bezier(.2, .8, .3, 1) .45s both;
}
.emote-impact-burst {
  position: absolute;
  z-index: 0;
  inset: 6px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 226, 150, .9) 0 28%, rgba(255, 178, 70, .4) 52%, transparent 72%);
}
.emote-particle {
  position: absolute;
  width: 5px;
  height: 5px;
  margin: -2.5px;
  border-radius: 50%;
  background: #ffe8a3;
  box-shadow: 0 0 4px #ffd36e;
  opacity: 0;
  animation: emote-particle .65s ease-out .5s both;
}
.emote-impact-art { position: relative; z-index: 2; }
.emote-performance[data-emote="banana"] .emote-impact-art {
  transform-origin: 50% 35%;
  animation: banana-stick 1.2s cubic-bezier(.2, .8, .3, 1) .52s both;
}
@keyframes banana-stick {
  0% { opacity: 0; transform: scale(1.3) rotate(-8deg); }
  10% { opacity: 1; transform: scale(1.08) rotate(-3deg); }
  32% { opacity: 1; transform: scale(1.03) rotate(0); }
  55% { opacity: 1; transform: scale(1) rotate(3deg); }
  82% { opacity: 1; transform: translateY(16px) scale(.98) rotate(12deg); }
  100% { opacity: 0; transform: translateY(30px) scale(.92) rotate(18deg); }
}
/* 除香蕉外不套黄色光晕，命中用中性白闪。 */
.emote-performance:not([data-emote="banana"]) .emote-impact-star { display: none; }
.emote-performance:not([data-emote="banana"]) .emote-impact-burst {
  background: radial-gradient(circle, rgba(255, 255, 255, .85) 0 26%, rgba(255, 255, 255, .22) 52%, transparent 72%);
}
.emote-performance:not([data-emote="banana"]) .emote-particle {
  background: #fff;
  box-shadow: 0 0 4px rgba(255, 255, 255, .7);
}
.emote-performance:not([data-emote="banana"]) .emote-target-ring {
  border-color: rgba(255, 255, 255, .85);
  box-shadow: 0 0 14px rgba(255, 255, 255, .35), inset 0 0 12px rgba(255, 255, 255, .16);
}
.emote-performance:not([data-emote="banana"]) .emote-route-glow { stroke: #fff; }
.emote-performance:not([data-emote="banana"]) .emote-route-line { stroke: #fff; }
.emote-performance:not([data-emote="banana"]) .emote-start-puff { border-color: rgba(255, 255, 255, .8); }

@keyframes emote-route {
  0% { stroke-dashoffset: 1; opacity: 0; }
  18% { opacity: .5; }
  72% { stroke-dashoffset: 0; opacity: .42; }
  100% { stroke-dashoffset: 0; opacity: 0; }
}
@keyframes emote-puff {
  0% { opacity: 0; transform: scale(.4); }
  25% { opacity: .8; }
  100% { opacity: 0; transform: scale(1.5); }
}
@keyframes emote-travel {
  from { offset-distance: 0%; }
  to { offset-distance: 100%; }
}
@keyframes emote-projectile-fade {
  to { opacity: 0; }
}
@keyframes emote-spin {
  to { transform: rotate(520deg); }
}
@keyframes emote-ring {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(.65); }
  25% { opacity: 1; }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(1.18); }
}
@keyframes emote-star {
  0% { opacity: 0; transform: scale(.2) rotate(-30deg); }
  25% { opacity: .95; transform: scale(1.15) rotate(6deg); }
  60% { opacity: .8; transform: scale(1) rotate(0); }
  100% { opacity: 0; transform: scale(.9); }
}
@keyframes emote-particle {
  0% { opacity: 0; transform: rotate(var(--angle)) translateY(-4px) scale(.5); }
  25% { opacity: 1; }
  100% { opacity: 0; transform: rotate(var(--angle)) translateY(-38px) scale(1); }
}
@keyframes emote-impact {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(.3); }
  18% { opacity: 1; transform: translate(-50%, -50%) scale(1.12); }
  78% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(.92); }
}
@media (prefers-reduced-motion: reduce) {
  .emote-route,
  .emote-start-puff,
  .emote-projectile,
  .emote-impact-star,
  .emote-particle { display: none; }
  .emote-target-ring { animation: emote-ring .2s ease-out both; }
  .emote-impact { animation-duration: .3s; animation-delay: 0s; }
}
</style>
