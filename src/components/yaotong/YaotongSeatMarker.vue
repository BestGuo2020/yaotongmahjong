<script setup lang="ts">
import type { ChickenCue, SeatStatus } from '../../game/variants/yaotong/presentation'
defineProps<{ status?: SeatStatus; cue?: ChickenCue | null; name: string }>()
</script>
<template>
  <span
    v-if="status"
    class="yaotong-seat-marker"
    :class="{ 'is-winner': status.winner, 'is-burned': status.burned }"
  >
    <span
      v-if="status.declaration !== 'none'"
      :key="status.declaration"
      class="declaration-seal"
      :class="[status.declaration, { killed: status.killed }]"
      :title="
        status.killed
          ? '被杀报，附加款已列入结算'
          : status.declaration === 'original'
            ? '原报 · 已锁定听口'
            : '报听 · 已锁定听口'
      "
      :aria-label="`${name}${status.killed ? '被杀' : ''}${status.declaration === 'original' ? '原报' : '报听'}`"
      >{{ status.declaration === 'original' ? '原报' : '报听' }}</span
    >
    <span
      v-if="status.burned"
      class="burn-seal"
      title="烧鸡：本家的鸡分收益归零，其他分项仍按规则结算"
      :aria-label="`${name}烧鸡`"
      >烧</span
    >
    <span v-if="status.winner" class="win-seal" :aria-label="`${name}${status.winPattern ?? ''}胡牌`">{{
      status.winPattern ?? '胡'
    }}</span>
    <span v-if="status.gift" class="gift-seal" title="见面礼" :aria-label="`${name}获得见面礼`">礼</span>
  </span>
  <Transition name="chicken-cue"
    ><span
      v-if="cue"
      :key="cue.id"
      class="yaotong-chicken-cue"
      :class="{ strong: cue.strong }"
      :title="`${name}${cue.label}，这张幺筒的鸡分档位为${cue.points}，终局按听牌状态收赔`"
      ><i>◉</i
      ><span
        >{{ cue.label }}<b>{{ cue.points }}</b></span
      ></span
    ></Transition
  >
</template>
<style scoped>
.yaotong-seat-marker {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  position: relative;
  margin-top: 4px;
  pointer-events: auto;
  line-height: 1.1;
}
.yaotong-seat-marker > span {
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  padding: 3px 5px;
  font-size: 10px;
  font-weight: 800;
  background: var(--theme-panel);
  color: var(--theme-accent-text);
  white-space: nowrap;
}
.declaration-seal {
  animation: declare-pulse 0.7s ease-out 1;
}
.declaration-seal.original {
  border-color: #dbb36f;
  color: #ffe2a3;
}
.declaration-seal.ready {
  border-color: #66bcb5;
  color: #9be7d4;
}
.burn-seal {
  color: #ed947a !important;
  border-color: #ad584c !important;
}
.win-seal,
.gift-seal {
  color: #ffe6a0 !important;
  box-shadow: 0 0 12px #e2ba5b44;
}
.declaration-seal.killed {
  text-decoration: line-through;
  text-decoration-color: #ef947b;
  opacity: 0.65;
}
.is-winner:after {
  content: '';
  position: absolute;
  inset: -8px;
  pointer-events: none;
  border: 2px solid #f3d681;
  border-radius: 12px;
  animation: winner-ring 1s ease-out 1;
  opacity: 0;
}
.yaotong-chicken-cue {
  position: absolute;
  z-index: 5;
  left: 50%;
  top: -28px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 5px;
  pointer-events: none;
  padding: 4px 8px;
  border: 1px solid #dcb968;
  border-radius: 20px;
  background: #193d31e8;
  color: #f5db9b;
  white-space: nowrap;
  box-shadow: 0 0 15px #edc76433;
}
.yaotong-chicken-cue i {
  font-size: 22px;
  font-style: normal;
}
.yaotong-chicken-cue span {
  font-size: 9px;
}
.yaotong-chicken-cue b {
  font:
    700 18px Georgia,
    serif;
  padding-left: 5px;
}
.yaotong-chicken-cue.strong {
  box-shadow: 0 0 22px #edc76488;
  border-width: 2px;
}
.chicken-cue-enter-active,
.chicken-cue-leave-active {
  transition:
    opacity 0.2s,
    translate 0.2s;
}
.chicken-cue-enter-from {
  opacity: 0;
  translate: 0 10px;
}
.chicken-cue-leave-to {
  opacity: 0;
  translate: 0 -10px;
}
@keyframes declare-pulse {
  0% {
    transform: scale(1.35);
    box-shadow: 0 0 25px #ecce7c88;
  }
  100% {
    transform: scale(1);
    box-shadow: none;
  }
}
@keyframes winner-ring {
  0% {
    opacity: 1;
    transform: scale(0.8);
  }
  100% {
    opacity: 0;
    transform: scale(1.5);
  }
}
@container game (max-height: 600px) {
  .yaotong-seat-marker > span {
    font-size: 9px;
    padding: 2px 3px;
  }
  .yaotong-chicken-cue {
    top: -24px;
    padding: 2px 6px;
  }
  .yaotong-chicken-cue b {
    font-size: 15px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .declaration-seal,
  .is-winner:after {
    animation: none;
  }
  .chicken-cue-enter-active,
  .chicken-cue-leave-active {
    transition: none;
  }
}
</style>
