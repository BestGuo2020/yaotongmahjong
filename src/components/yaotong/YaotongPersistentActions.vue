<script setup lang="ts">
import { ref, useId, watch } from 'vue'
import { QUICK_CHAT_PAGES, type QuickChatPhrase } from '../../game/variants/yaotong/quickChat'
import type { useYaotongPort } from '../../game/variants/yaotong/useYaotongPort'
import TableControlIcon from '../table/TableControlIcon.vue'

const props = defineProps<{
  game: ReturnType<typeof useYaotongPort>
  showActions: boolean
  showAutoPlay: boolean
  sendQuickChat?: (phrase: QuickChatPhrase) => boolean
}>()
defineEmits<{ toggleAutoPlay: [] }>()

const chatDialog = ref<HTMLDialogElement | null>(null)
const chatOpen = ref(false)
const chatPage = ref(0)
const chatNotice = ref('')
const chatTitleId = useId()

function openChat() {
  chatNotice.value = ''
  chatDialog.value?.showModal()
  chatOpen.value = Boolean(chatDialog.value?.open)
}
function closeChat() {
  chatDialog.value?.close()
  chatOpen.value = false
}
function closeChatFromBackdrop(event: MouseEvent) {
  if (event.target !== chatDialog.value) return
  const rect = chatDialog.value!.getBoundingClientRect()
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)
    closeChat()
}
function sendPhrase(phrase: QuickChatPhrase) {
  if (props.sendQuickChat?.(phrase)) closeChat()
  else chatNotice.value = '刚发过，稍等一下'
}
watch(chatPage, () => { chatNotice.value = '' })
watch(() => props.showActions && props.sendQuickChat, (send) => { if (!send) closeChat() })
</script>

<template>
  <template v-if="showActions && sendQuickChat">
    <button type="button" class="action quick-chat-trigger" data-action-role="secondary"
      aria-label="快捷语" title="快捷语" aria-haspopup="dialog" :aria-expanded="chatOpen" @click="openChat">
      <TableControlIcon name="chat" class="quick-chat-icon" />
    </button>
    <dialog ref="chatDialog" class="yaotong-control-dialog quick-chat-dialog" :aria-labelledby="chatTitleId"
      @close="chatOpen = false" @click="closeChatFromBackdrop">
      <header>
        <h2 :id="chatTitleId">快捷语</h2>
        <button type="button" class="yaotong-control-dialog-close" aria-label="关闭快捷语" @click="closeChat">×</button>
      </header>
      <div class="quick-chat-tabs" role="tablist" aria-label="快捷语分类">
        <button v-for="(page, index) in QUICK_CHAT_PAGES" :key="page.id" type="button" role="tab"
          :aria-selected="chatPage === index" :class="{ active: chatPage === index }"
          @click="chatPage = index">{{ page.label }}</button>
      </div>
      <div class="quick-chat-grid" role="tabpanel" :aria-label="QUICK_CHAT_PAGES[chatPage]?.label">
        <button v-for="phrase in QUICK_CHAT_PAGES[chatPage]?.phrases ?? []" :key="phrase.id" type="button"
          class="quick-chat-send" @click="sendPhrase(phrase)">{{ phrase.text }}</button>
      </div>
      <footer>
        <p v-if="chatNotice" class="quick-chat-note" role="status">{{ chatNotice }}</p>
        <button type="button" class="quick-chat-done" @click="closeChat">关闭</button>
      </footer>
    </dialog>
  </template>
  <button
    v-if="showAutoPlay" type="button" class="action autoplay-action" :class="{ active: game.local.autoplay.value }" data-action-role="secondary"
    :aria-pressed="game.local.autoplay.value"
    :aria-label="game.local.autoplay.value ? '取消机器人托管，恢复手动操作' : '开启机器人托管，自动出牌与过牌'"
    :title="game.local.autoplay.value ? '机器人托管中：点击恢复手动' : '点击机器人托管：到您的回合自动出牌/过牌'"
    @click="$emit('toggleAutoPlay')"
  >
    <TableControlIcon name="autoplay" />
  </button>
  <button v-if="showActions && game.local.hardControls.value && !game.local.holding.value && game.local.waitRemainingMs.value > 0"
    type="button" class="action wait-action" data-action-role="primary"
    aria-label="等，暂停牌局并使用本局等待时间" @click="game.local.startHold()">
    <b>等</b><span class="action-detail">{{ Math.ceil(game.local.waitRemainingMs.value / 1000) }}秒</span>
  </button>
</template>

<style scoped>
.quick-chat-dialog { --dialog-width: 430px; }
.quick-chat-dialog header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border-bottom: 1px solid var(--theme-border); }
.quick-chat-dialog h2 { margin: 0; font-size: 18px; color: var(--theme-accent-text); }
.quick-chat-tabs { display: flex; gap: 6px; padding: 10px 14px 0; }
.quick-chat-tabs button { flex: 1; min-height: 36px; border: 1px solid var(--theme-border); border-radius: 7px; background: transparent; color: var(--theme-text); font: inherit; font-size: 13px; cursor: pointer; }
.quick-chat-tabs button.active { border-color: var(--theme-accent); background: var(--theme-accent); color: #17110a; font-weight: 700; }
.quick-chat-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; padding: 12px 14px; }
.quick-chat-send { min-height: 46px; padding: 8px 10px; border: 1px solid var(--theme-border); border-radius: 8px; background: var(--theme-button); color: var(--theme-button-text); font: inherit; font-size: 13px; line-height: 1.45; text-align: left; cursor: pointer; }
.quick-chat-send:hover, .quick-chat-send:focus-visible { border-color: var(--theme-accent); }
.quick-chat-dialog button:focus-visible { outline: 2px solid var(--theme-accent); outline-offset: 2px; }
.quick-chat-dialog footer { display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding: 0 14px 14px; }
.quick-chat-note { margin: 0 auto 0 0; color: var(--theme-text-muted); font-size: 11px; line-height: 1.5; }
.quick-chat-done { min-width: 76px; min-height: 38px; border: 1px solid var(--theme-border); border-radius: 7px; background: var(--theme-panel); color: var(--theme-text); font: inherit; cursor: pointer; }
@media (max-width: 430px) {
  .quick-chat-grid { grid-template-columns: 1fr; }
}
@media (max-height: 520px) {
  .quick-chat-dialog header { padding: 6px 14px; }
  .quick-chat-grid { padding: 8px 12px; }
  .quick-chat-send { min-height: 40px; }
}
</style>
