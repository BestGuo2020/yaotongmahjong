<script setup lang="ts">
import type { useYaotongPort } from '../../game/variants/yaotong/useYaotongPort'
const props = defineProps<{ game: ReturnType<typeof useYaotongPort> }>()
</script>
<template>
  <template v-if="!game.local.autoplay.value">
    <template v-if="game.original.value && game.local.waiting.value.length">
      <button
        class="action hu"
        data-action-role="major"
        @click="game.local.dispatch({ type: 'original', declare: true })"
      >
        <b>原报</b>
      </button>
      <button
        class="action primary"
        data-action-role="primary"
        @click="game.local.dispatch({ type: 'original', declare: false })"
      >
        <b>不原报</b>
      </button>
    </template>
    <button
      v-if="game.canArmDeclaration.value"
      class="action primary"
      :class="{ active: game.declarationArmed.value }"
      data-action-role="primary"
      :aria-pressed="game.declarationArmed.value"
      @click="game.declarationArmed.value = !game.declarationArmed.value"
    >
      <b>{{ game.declarationArmed.value ? '取消报听' : '报听' }}</b>
    </button>
  </template>
  <span v-if="game.local.protectionNotice.value || game.risk.value" class="yaotong-action-note" :class="{ danger: game.local.mode.value === 'hard' }" role="status" :title="game.local.protectionNotice.value || game.risk.value" :aria-label="game.local.protectionNotice.value || game.risk.value">{{ game.local.mode.value === 'easy' ? '系统防护' : game.local.response.value?.mandatory || game.local.self.value?.mandatory ? '必胡' : '过手' }}</span>
  <span v-if="game.local.state.value?.dice[0] === game.local.state.value?.dice[1]" class="yaotong-double"
    title="骰子同点，本局双倍">×2</span
  >
</template>
<style scoped>
.yaotong-action-note {
  max-width: 220px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--theme-accent-text);
  padding: 5px 9px;
  background: var(--theme-panel);
  border: 1px solid var(--theme-border);
  border-radius: 6px;
}
.yaotong-action-note.danger {
  color: var(--theme-danger, #ffbd9a);
}
.yaotong-double {
  font-size: 12px;
  font-weight: 700;
  color: var(--theme-accent-text);
  padding: 4px 8px;
  border: 1px solid var(--theme-border);
  border-radius: 20px;
}
@container (max-width:700px) {
  .yaotong-action-note {
    font-size: 10px;
    max-width: 130px;
  }
  .yaotong-double {
    font-size: 10px;
  }
}
</style>
