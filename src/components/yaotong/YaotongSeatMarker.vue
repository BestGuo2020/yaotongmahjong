<script setup lang="ts">
import type { SeatStatus } from '../../game/variants/yaotong/presentation'
defineProps<{ status?: SeatStatus; name: string }>()
</script>
<template>
  <span
    v-if="status"
    class="yaotong-seat-marker"
    :class="{ 'is-winner': status.winner, 'is-burned': status.burned }"
  >
    <span
      v-if="status.rushCount"
      class="chicken-seal rush-seal"
      :key="`rush-${status.rushCount}`"
      :aria-label="`${name}牌河中有${status.rushCount}张冲鸡`"
      title="仍在本人牌河的冲鸡，终局按听牌状态计分"
      >冲<span v-if="status.rushCount > 1">×{{ status.rushCount }}</span></span
    >
    <span
      v-if="status.responsibilityCount"
      class="chicken-seal responsibility-seal"
      :key="`responsibility-${status.responsibilityCount}`"
      :aria-label="`${name}有${status.responsibilityCount}笔幺筒碰杠责任记录`"
      title="幺筒碰杠责任记录，终局按双方听牌状态收赔"
      >责<span v-if="status.responsibilityCount > 1">×{{ status.responsibilityCount }}</span></span
    >
    <span
      v-if="status.declaration !== 'none'"
      :key="status.declaration"
      class="declaration-seal"
      :class="[status.declaration, { killed: status.killed }]"
      :title="
        status.killed
          ? `被杀报，额外支付${status.killedAmount ?? 0}分`
          : status.declaration === 'original'
            ? '原报 · 已锁定听口'
            : '报听 · 已锁定听口'
      "
      :aria-label="`${name}${status.killed ? '被杀' : ''}${status.declaration === 'original' ? '原报' : '报听'}`"
      ><span class="declaration-name">{{ status.declaration === 'original' ? '原报' : '报听' }}</span
      ><b v-if="status.killed && status.killedAmount"> −{{ status.killedAmount }}</b></span
    >
    <span
      v-if="status.burned"
      class="burn-seal"
      title="烧鸡：本家的鸡分收益归零，其他分项仍按规则结算"
      :aria-label="`${name}烧鸡`"
      >烧鸡</span
    >
    <span v-if="status.winner" class="win-seal" :aria-label="`${name}${status.winPattern ?? ''}胡牌`">{{
      status.winPattern ?? '胡'
    }}</span>
    <span
      v-if="status.gift"
      class="gift-seal"
      title="见面礼"
      :aria-label="`${name}获得见面礼${status.giftAmount ?? ''}分`"
      >礼<span v-if="status.giftAmount"> +{{ status.giftAmount }}</span></span
    >
  </span>
</template>
<style scoped>
.yaotong-seat-marker {
  display: flex;
  flex-wrap: wrap;
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
.chicken-seal.rush-seal {
  color: #ffe39b;
  border-color: #cda95b;
  background: #343c2a;
}
.chicken-seal.responsibility-seal {
  color: #c6f2f9;
  border-color: #6ca8b8;
  background: #203f4b;
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
.declaration-seal.killed .declaration-name {
  text-decoration: line-through;
  text-decoration-color: #ef947b;
}
.declaration-seal.killed {
  border-color: #f18b9e;
  color: #f4b5bf;
  opacity: 0.85;
}
.declaration-seal.killed b {
  color: #ff9eaf;
  font-variant-numeric: tabular-nums;
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
}
@media (prefers-reduced-motion: reduce) {
  .declaration-seal,
  .is-winner:after {
    animation: none;
  }
}
</style>
