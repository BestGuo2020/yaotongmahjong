<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { GamePlayer } from '../../game/core/contracts/types'
import type { ChickenPerformance } from '../../game/variants/yaotong/chickenPresentation'
import { tileName } from '../../game/variants/yaotong/tiles'
import { useYaotongSeatAnchors } from './useYaotongSeatAnchors'
import YaotongChickenActor from './YaotongChickenActor.vue'

const props = defineProps<{ cues: ChickenPerformance[]; players: GamePlayer[] }>()
const root = ref<HTMLElement | null>(null)
const { size, anchors, measure } = useYaotongSeatAnchors(root)
watch(() => props.cues, measure, { flush: 'post' })
const performances = computed(() =>
  props.cues.flatMap((cue) => {
    const actor = anchors.value[cue.actorSeat],
      target = anchors.value[cue.markSeat]
    if (!actor || !target) return []
    const compact = size.value.height < 600
    const extent = compact ? 92 : 142
    const offsets = [
      [extent * 2.25, -extent * 0.6],
      [-extent, extent * 1.2],
      [-extent * 1.2, extent * 1.25],
      [extent, extent * 1.2],
    ]
    const [dx, dy] = offsets[cue.actorSeat]
    const x = Math.max(extent * 0.7, Math.min(size.value.width - extent * 0.7, actor.x + dx))
    const y = Math.max(extent * 0.6, Math.min(size.value.height - extent * 0.7, actor.y + dy))
    const facing = target.x < x ? -1 : 1
    return [
      {
        ...cue,
        x,
        y,
        target,
        actor,
        extent,
        facing,
        path: `M ${x} ${y} Q ${(x + target.x) / 2} ${Math.min(y, target.y) - extent * 0.4} ${target.x} ${target.y}`,
        description:
          cue.kind === 'rush'
            ? `${props.players[cue.actorSeat]?.name}打出${tileName(cue.tile)}，${cue.label}档位${cue.points}`
            : `${props.players[cue.actorSeat]?.name}取得幺筒，${props.players[cue.markSeat]?.name}留下责任记录，原值${cue.points}，终局按规则结算`,
      },
    ]
  }),
)
</script>

<template>
  <div ref="root" class="yaotong-chicken-effects">
    <div
      v-for="cue in performances"
      :key="cue.id"
      class="chicken-performance"
      :class="cue.kind"
      :data-chicken-performance="cue.kind"
      :data-actor-seat="cue.actorSeat"
      :data-mark-seat="cue.markSeat"
      role="img"
      :aria-label="cue.description"
    >
      <div
        class="chicken-stage"
        :style="{ left: `${cue.x}px`, top: `${cue.y}px`, width: `${cue.extent}px`, '--facing': cue.facing }"
      >
        <div class="chicken-entrance">
          <div class="chicken-facing">
            <YaotongChickenActor :kind="cue.kind" :uid="`chicken-${cue.id}`" />
          </div>
        </div>
        <strong class="chicken-title">{{ cue.label }}</strong>
      </div>
      <svg class="chicken-route" :viewBox="`0 0 ${size.width} ${size.height}`" aria-hidden="true">
        <circle class="actor-origin" :cx="cue.actor.x" :cy="cue.actor.y" r="30" />
        <path class="mark-trail" :d="cue.path" pathLength="1" />
        <g class="flying-mark">
          <rect x="-15" y="-16" width="30" height="32" rx="8" />
          <text y="7" text-anchor="middle">{{ cue.kind === 'rush' ? '冲' : '责' }}</text>
          <animateMotion :path="cue.path" dur=".35s" begin="1.25s" fill="freeze" repeatCount="1" />
        </g>
        <circle class="mark-arrival" :cx="cue.target.x" :cy="cue.target.y" r="33" />
      </svg>
    </div>
  </div>
</template>

<style scoped>
.yaotong-chicken-effects {
  position: absolute;
  inset: 0;
  z-index: 43;
  overflow: hidden;
  pointer-events: none;
}
.chicken-performance {
  --mark-color: #f7d477;
}
.chicken-performance.responsibility {
  --mark-color: #a9e9f2;
}
.chicken-stage {
  position: absolute;
  transform: translate(-50%, -55%);
}
.chicken-facing {
  transform: scaleX(var(--facing));
}
.chicken-entrance {
  animation: chicken-arrive 1.8s ease-out both;
}
.responsibility .chicken-entrance {
  animation-name: chicken-transform;
}
.chicken-title {
  position: absolute;
  top: 89%;
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  font:
    900 clamp(18px, 3cqh, 26px) 'Microsoft YaHei',
    sans-serif;
  color: #ffedb1;
  text-shadow:
    0 2px 0 #54391d,
    0 0 6px #472b1e;
  animation: chicken-caption 1.8s ease-out both;
}
.responsibility .chicken-title {
  color: #dbf9ff;
  text-shadow:
    0 2px 0 #234655,
    0 0 6px #234655;
}
.chicken-route {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.mark-trail {
  fill: none;
  stroke: var(--mark-color);
  stroke-width: 3;
  stroke-linecap: round;
  stroke-dasharray: 1;
  animation: chicken-trail 1.8s ease-out both;
}
.flying-mark {
  animation: chicken-mark 1.8s linear both;
  filter: drop-shadow(0 0 6px var(--mark-color));
}
.flying-mark rect {
  fill: #294b49;
  stroke: var(--mark-color);
  stroke-width: 2;
}
.flying-mark text {
  fill: var(--mark-color);
  font-size: 22px;
  font-weight: 900;
}
.mark-arrival {
  fill: none;
  stroke: var(--mark-color);
  stroke-width: 3;
  transform-box: fill-box;
  transform-origin: center;
  animation: chicken-arrival-ring 1.8s ease-out both;
}
.actor-origin {
  fill: none;
  stroke: var(--mark-color);
  stroke-width: 2;
  animation: chicken-caption 1.8s ease-out both;
}
@keyframes chicken-arrive {
  0% {
    opacity: 0;
    transform: translateX(calc(var(--facing) * -65px)) scale(0.6);
  }
  12% {
    opacity: 1;
  }
  43% {
    transform: translateX(calc(var(--facing) * 8px)) scale(1.05, 0.95);
  }
  55% {
    transform: translateX(0) scale(0.96, 1.04);
  }
  64%,
  70% {
    opacity: 1;
    transform: scale(1);
  }
  83%,
  100% {
    opacity: 0;
    transform: scale(0.4);
  }
}
@keyframes chicken-transform {
  0% {
    opacity: 0;
    transform: scale(0.6);
  }
  12%,
  70% {
    opacity: 1;
    transform: scale(1);
  }
  87%,
  100% {
    opacity: 0;
    transform: scale(0.5);
  }
}
@keyframes chicken-caption {
  0%,
  15% {
    opacity: 0;
    translate: 0 5px;
  }
  26%,
  68% {
    opacity: 1;
    translate: 0 0;
  }
  82%,
  100% {
    opacity: 0;
  }
}
@keyframes chicken-mark {
  0%,
  69% {
    opacity: 0;
  }
  70%,
  92% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
@keyframes chicken-trail {
  0%,
  69% {
    opacity: 0;
    stroke-dashoffset: 1;
  }
  70% {
    opacity: 0.7;
  }
  89% {
    stroke-dashoffset: 0;
    opacity: 0.7;
  }
  100% {
    opacity: 0;
    stroke-dashoffset: 0;
  }
}
@keyframes chicken-arrival-ring {
  0%,
  87% {
    opacity: 0;
    transform: scale(0.75);
  }
  89% {
    opacity: 1;
    transform: scale(0.85);
  }
  100% {
    opacity: 0;
    transform: scale(1.5);
  }
}
@media (prefers-reduced-motion: reduce) {
  .chicken-entrance,
  .chicken-title {
    animation: none !important;
  }
  .chicken-route {
    display: none;
  }
  .chicken-stage {
    opacity: 0.95;
  }
}
</style>
