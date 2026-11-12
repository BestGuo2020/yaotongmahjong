<script setup lang="ts">
import { ref } from 'vue'
import TableControlIcon from '../table/TableControlIcon.vue'
import { canUseEdgeFullscreen, requestPageFullscreen } from './mobileFullscreen'

const pending = ref(false)
const message = ref('')

async function enterFullscreen() {
  if (pending.value || document.fullscreenElement || !window.matchMedia('(orientation: landscape)').matches) return

  pending.value = true
  message.value = ''
  try {
    await requestPageFullscreen()
  } catch {
    message.value = '暂时无法进入全屏，请重试。'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div v-if="canUseEdgeFullscreen" class="edge-fullscreen-entry">
    <button type="button" class="topbar-control" aria-label="进入全屏" title="进入全屏"
      :disabled="pending" @click="enterFullscreen">
      <TableControlIcon name="fullscreen" />
    </button>
    <small v-if="message" class="edge-fullscreen-status" role="status">{{ message }}</small>
  </div>
</template>

<style>
.edge-fullscreen-entry { position: relative; }
:root:fullscreen .edge-fullscreen-entry { display: none; }
@media (orientation: portrait) {
  .edge-fullscreen-entry { display: none; }
}
.edge-fullscreen-status {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  padding: 6px 10px;
  border: 1px solid var(--theme-border);
  border-radius: 8px;
  background: var(--theme-panel);
  color: var(--theme-text);
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
}
</style>
