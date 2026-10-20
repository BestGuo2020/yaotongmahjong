<script setup lang="ts">
import { computed } from 'vue'
import MahjongTile from '../MahjongTile.vue'
import type { TableThemeName } from '../table/three/tableTheme'
import type { Account, GameState } from '../../game/variants/yaotong/types'
import { toSharedTile } from '../../game/variants/yaotong/useYaotongPort'
import { huScoreBreakdown } from './huScoreBreakdown'

const props = defineProps<{ state: GameState; themeName?: TableThemeName }>()
const result = computed(() => props.state.result!)
// The local human is seat 0. Every amount is their net income, including dice doubling.
const delta = computed(() => result.value.deltas[0])
const huParts = computed(() => huScoreBreakdown(result.value))
const accounts: Account[] = ['胡牌分', '鸡分', '杠分', '幺筒责任分', '杀报加分', '见面礼', '流局赔听款', '一般包牌赔付']
const breakdown = computed(() => accounts.flatMap(account => {
  const entries = result.value.transfers.filter(entry => entry.account === account && (entry.from === 0 || entry.to === 0))
  return entries.length ? [{ account, amount: entries.reduce((sum, entry) => sum + (entry.to === 0 ? entry.amount : -entry.amount), 0) }] : []
}))
const outcome = computed(() => {
  const settlement = result.value
  if (settlement.kind === 'penalty') return settlement.offender === 0 ? '包牌赔付' : '获赔'
  if (settlement.winners.includes(0)) return settlement.winKind === 'self' ? '自摸' : '胡牌'
  if (settlement.source === 0) return '放炮'
  return settlement.ready[0] ? '已听牌' : '未听牌'
})
const signed = (amount: number) => `${amount > 0 ? '+' : amount < 0 ? '−' : ''}${Math.abs(amount)}`
</script>

<template>
  <section class="yaotong-round-overview" aria-label="本家分数概览">
    <div class="self-score-summary">
      <p class="self-result-label">本家 · {{ outcome }}</p>
      <div class="self-round-score" :class="{ positive: delta > 0, negative: delta < 0 }" :aria-label="`本局净得分${signed(delta)}分`">
        <span>本局净得分</span><strong>{{ signed(delta) }}</strong><span>分</span>
      </div>
    </div>
    <div class="self-score-breakdown" aria-label="本家分项净得分">
      <span v-for="item in breakdown" :key="item.account">
        {{ item.account }}
        <b :class="{ positive: item.amount > 0, negative: item.amount < 0 }">{{ signed(item.amount) }}</b>
        <template v-if="item.account === '胡牌分'">
          <small v-for="part in huParts" :key="part.winner" class="hu-score-parts">
            <template v-if="huParts.length > 1">{{ state.players[part.winner].name }}：</template>{{ part.formula }}<template v-if="huParts.length > 1"> = {{ signed(part.amount) }}分</template>
          </small>
        </template>
      </span>
      <span v-if="!breakdown.length">本局无分数收付</span>
    </div>
    <div v-if="result.indicator !== null || state.dice[0] === state.dice[1]" class="overview-chicken">
      <template v-if="result.indicator !== null && result.chicken !== null">
        <span>指示牌</span>
        <MahjongTile :tile="toSharedTile(result.indicator)" :theme-name="themeName" small disabled />
        <span class="chicken-arrow" aria-hidden="true">→</span>
        <MahjongTile class="flipped-chicken" :tile="toSharedTile(result.chicken)" :theme-name="themeName" small disabled />
        <span>翻鸡</span>
      </template>
      <b v-if="state.dice[0] === state.dice[1]" class="overview-double" title="展示的分数已包含同点翻倍">同点 ×2</b>
    </div>
  </section>
</template>

<style scoped>
.yaotong-round-overview { color: var(--theme-text); padding: 8px 0 14px; }
.self-result-label { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 14px; margin: 0 0 4px; color: var(--theme-accent-text); font-size: 14px; font-weight: 700; }
.self-round-score { display: flex; align-items: baseline; justify-content: center; gap: 12px; color: var(--theme-text-muted); }
.self-round-score > span { font-size: 13px; color: var(--theme-text-muted); }
.self-round-score strong { font: 800 clamp(48px, 8cqh, 72px)/1.15 Georgia, serif; font-variant-numeric: tabular-nums; }
.self-score-breakdown { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; margin: 12px auto; }
.self-score-breakdown > span { display: inline-flex; flex-wrap: wrap; justify-content: center; align-items: baseline; max-width: 100%; gap: 4px 9px; padding: 6px 12px; border: 1px solid var(--theme-border); border-radius: 5px; background: color-mix(in srgb, var(--theme-accent) 5%, transparent); color: var(--theme-text-muted); font-size: 12px; }
.self-score-breakdown b { font-size: 15px; font-variant-numeric: tabular-nums; }
.hu-score-parts { padding-left: 9px; border-left: 1px solid var(--theme-border); font-size: 11px; line-height: 1.5; }
.positive { color: var(--theme-positive); }
.negative { color: var(--theme-negative); }
.overview-chicken { display: flex; align-items: center; justify-content: center; gap: 12px; width: fit-content; margin: 0 auto; padding: 8px 20px; border: 1px solid var(--theme-border); border-radius: 6px; background: color-mix(in srgb, var(--theme-accent) 4%, transparent); color: var(--theme-text-muted); font-size: 12px; }
.overview-chicken .mahjong-tile { --tile-width: 33px; flex: none; }
.overview-chicken .flipped-chicken { box-shadow: 0 0 0 2px var(--theme-accent), 0 0 16px color-mix(in srgb, var(--theme-accent) 25%, transparent); }
.chicken-arrow { color: var(--theme-accent-text); }
.overview-double { margin-left: 4px; color: var(--theme-accent-text); font-size: 12px; }
@container game (max-height: 600px) {
  .yaotong-round-overview { padding: 4px 0 8px; }
  .self-result-label { font-size: 12px; margin-bottom: 0; }
  .self-round-score strong { font-size: 38px; }
  .self-round-score > span { font-size: 11px; }
  .self-score-breakdown { margin: 6px auto; gap: 5px; }
  .self-score-breakdown > span { padding: 3px 8px; font-size: 11px; }
  .self-score-breakdown b { font-size: 13px; }
  .overview-chicken { padding: 4px 14px; gap: 9px; font-size: 11px; }
  .overview-chicken .mahjong-tile { --tile-width: 25px; }
}
@container game (max-height: 450px) and (min-width: 620px) {
  .yaotong-round-overview { display: grid; grid-template-columns: minmax(110px, .7fr) minmax(0, 1.5fr) auto; align-items: center; gap: 12px; padding: 8px 12px; border: 1px solid color-mix(in srgb, var(--theme-border) 60%, transparent); border-radius: 8px; background: color-mix(in srgb, var(--theme-accent) 4%, transparent); }
  .self-result-label { justify-content: flex-start; font-size: 11px; }
  .self-round-score { justify-content: flex-start; gap: 6px; }
  .self-round-score > span:first-child { display: none; }
  .self-round-score strong { font-size: clamp(30px, 10cqh, 42px); }
  .self-score-breakdown { justify-content: flex-start; margin: 0; gap: 5px; }
  .self-score-breakdown > span { padding: 4px 7px; gap: 6px; border: 0; background: color-mix(in srgb, var(--theme-accent) 9%, transparent); font-size: 11px; }
  .self-score-breakdown b { font-size: 14px; }
  .hu-score-parts { display: none; }
  .overview-chicken { flex-wrap: wrap; gap: 6px; max-width: 170px; margin: 0; padding: 4px 0 4px 12px; border: 0; border-left: 1px solid var(--theme-border); border-radius: 0; background: transparent; font-size: 10px; }
  .overview-chicken .mahjong-tile { --tile-width: 23px; }
  .overview-double { width: 100%; margin: 0; text-align: right; font-size: 10px; }
}
</style>
