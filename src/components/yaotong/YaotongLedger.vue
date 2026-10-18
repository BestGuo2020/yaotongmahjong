<script setup lang="ts">
import { computed } from 'vue'
import MahjongTile from '../MahjongTile.vue'
import type { GameState } from '../../game/variants/yaotong/types'
import { toSharedTile } from '../../game/variants/yaotong/useYaotongPort'
import type { TableThemeName } from '../table/three/tableTheme'
const props = defineProps<{ state: GameState; themeName?: TableThemeName }>()
const result = computed(() => props.state.result!)
function download() {
  const url = URL.createObjectURL(
    new Blob(
      [
        JSON.stringify(
          { rules: '幺筒-v1.0', hand: props.state.handNumber, dice: props.state.dice, result: result.value },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    ),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = `yaotong-${props.state.handNumber}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>
<template>
  <section class="yaotong-ledger">
    <h3 v-if="result.kind === 'penalty'">包牌 · {{ state.players[result.offender!].name }}</h3>
    <h3 v-else-if="result.winners.length > 1">一炮{{ result.winners.length }}响</h3>
    <p>{{ result.reason }}<b v-if="state.dice[0] === state.dice[1]"> · 骰子同点 ×2</b></p>
    <div v-if="result.indicator !== null" class="yaotong-flip">
      <span>指示牌</span><MahjongTile :theme-name="themeName" :tile="toSharedTile(result.indicator)" small disabled /><span
        >→ 翻鸡</span
      ><MahjongTile :theme-name="themeName" :tile="toSharedTile(result.chicken!)" small disabled />
    </div>
    <p v-for="(value, seat) in result.values" :key="seat">
      <b>{{ state.players[Number(seat)].name }}</b> ·
      {{ value.patterns.map((p) => p.name).join('＋') || '鸡胡' }} · H={{ value.h }}
    </p>
    <details>
      <summary>分项账单 · {{ result.transfers.length }} 笔</summary>
      <div class="yaotong-ledger-scroll">
        <table>
          <thead>
            <tr>
              <th>付款 → 收款</th>
              <th>分项 / 依据</th>
              <th>分数</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(entry, i) in result.transfers" :key="i">
              <td>{{ state.players[entry.from].name }} → {{ state.players[entry.to].name }}</td>
              <td>
                {{ entry.account }}<small>{{ entry.reason }}</small>
              </td>
              <td>{{ entry.base }}{{ entry.multiplier === 2 ? ' ×2' : '' }} = {{ entry.amount }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <button class="secondary" @click="download">导出账单</button>
    </details>
  </section>
</template>
<style scoped>
.yaotong-ledger {
  color: var(--theme-text);
  text-align: center;
}
.yaotong-ledger h3 {
  margin: 8px 0;
  color: var(--theme-accent-text);
}
.yaotong-ledger p {
  font-size: 12px;
  line-height: 1.6;
  margin: 8px 0;
}
.yaotong-flip {
  display: flex;
  justify-content: center;
  gap: 15px;
  align-items: center;
  margin: 12px 0;
  font-size: 12px;
}
.yaotong-ledger details {
  margin: 12px 0;
  border: 1px solid var(--theme-border);
  border-radius: 8px;
  padding: 10px;
  text-align: left;
}
.yaotong-ledger summary {
  font-size: 12px;
  cursor: pointer;
  color: var(--theme-accent-text);
}
.yaotong-ledger-scroll {
  max-height: 180px;
  overflow: auto;
}
.yaotong-ledger table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.yaotong-ledger td,
.yaotong-ledger th {
  padding: 8px 6px;
  border-bottom: 1px solid var(--theme-border);
}
.yaotong-ledger td:last-child {
  white-space: nowrap;
  text-align: right;
}
.yaotong-ledger td small {
  display: block;
  opacity: 0.65;
  font-size: 9px;
  margin-top: 3px;
}
.yaotong-ledger button {
  font-size: 11px;
  margin-top: 10px;
  padding: 7px 12px;
}
</style>
