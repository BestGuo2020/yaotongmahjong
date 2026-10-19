<script setup lang="ts">
import { ref } from 'vue'
import { YAOTONG_MODES, type YaotongMode } from '../../game/variants/yaotong/mode'

const props = defineProps<{ modelValue: YaotongMode }>()
const emit = defineEmits<{ close: []; confirm: [value: YaotongMode] }>()
const pending = ref(props.modelValue)
</script>

<template>
  <div class="picker-options yaotong-mode-options" aria-label="对局模式">
    <button v-for="(option, value) in YAOTONG_MODES" :key="value" type="button"
      data-action-role="secondary" :class="{ active: pending === value }"
      :aria-pressed="pending === value" @click="pending = value">
      <i aria-hidden="true"></i>
      <span><b>{{ option.name }}</b><small>{{ option.description }}</small><small>{{ option.detail }}</small></span>
    </button>
  </div>
  <p class="mode-note">两种模式的计分规则与 AI 对手相同，仅防违规辅助不同。</p>
  <div class="dialog-actions">
    <button class="secondary" data-action-role="light" @click="emit('close')">取消</button>
    <button class="primary" data-action-role="primary" @click="emit('confirm', pending)">确定</button>
  </div>
</template>

<style scoped>
.yaotong-mode-options small { white-space: normal; line-height: 1.6; }
.mode-note { margin: 14px 0 0; color: var(--theme-text-muted); font-size: 12px; line-height: 1.6; }
@media (orientation: landscape) and (max-height: 520px) {
  .yaotong-mode-options { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .yaotong-mode-options > button { padding: 10px; gap: 8px; }
  .yaotong-mode-options small { font-size: 11px; }
  .mode-note { margin-top: 8px; font-size: 11px; }
  .dialog-actions { margin-top: 10px; }
}
</style>
