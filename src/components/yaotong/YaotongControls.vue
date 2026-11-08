<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import { QUICK_CHAT_PAGES, type QuickChatPhrase } from '../../game/variants/yaotong/quickChat'
import { YAOTONG_EMOTES, type YaotongEmoteId } from '../../game/variants/yaotong/emotes'
import type { YaotongEmotes } from './useYaotongEmotes'
import type { useYaotongPort } from '../../game/variants/yaotong/useYaotongPort'
import TableControlIcon from '../table/TableControlIcon.vue'
import YaotongEmoteArt from './YaotongEmoteArt.vue'
const props = defineProps<{
  game: ReturnType<typeof useYaotongPort>
  sendQuickChat?: (phrase: QuickChatPhrase) => boolean
  emotes?: YaotongEmotes
  sendEmote: (emote: YaotongEmoteId) => void
}>()
const declarationLabel = computed(() => props.game.declarationArmed.value ? '取消报听' : '报听')
const dialog = ref<HTMLDialogElement | null>(null)
const helpOpen = ref(false)
const helpId = useId()
const hints = computed(() => props.game.guidance.value)
const hasProtectionHint = computed(() => hints.value.some((hint) => hint.protection))
const helpTitle = computed(() => hasProtectionHint.value ? '系统防护' : '操作提示')
const chatDialog = ref<HTMLDialogElement | null>(null)
const chatOpen = ref(false)
const chatPage = ref(0)
const chatNotice = ref('')
const chatTitleId = useId()
const chatPages = QUICK_CHAT_PAGES
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
watch(() => props.sendQuickChat, (send) => { if (!send) closeChat() })
const emoteDialog = ref<HTMLDialogElement | null>(null)
const emoteTitleId = useId()
const emoteTargetSeat = computed(() => props.emotes?.targetSeat.value ?? null)
const emoteTargetPlayer = computed(() => emoteTargetSeat.value === null
  ? null
  : props.game.players?.[emoteTargetSeat.value] ?? null)
const emoteTitle = computed(() => emoteTargetPlayer.value
  ? `对 ${emoteTargetPlayer.value.name} 使用互动道具`
  : '互动道具')
function closeEmotePanel() {
  props.emotes?.cancel()
}
function closeEmoteFromBackdrop(event: MouseEvent) {
  if (event.target !== emoteDialog.value) return
  const rect = emoteDialog.value!.getBoundingClientRect()
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)
    closeEmotePanel()
}
function onEmoteDialogClose() {
  if (!emoteDialog.value?.open) props.emotes?.cancel()
}
watch([emoteDialog, emoteTargetSeat], ([modal, seat]) => {
  if (!modal) return
  if (seat === null && modal.open) modal.close()
  if (seat !== null && !modal.open) modal.showModal()
}, { flush: 'post' })
onBeforeUnmount(() => props.emotes?.cancel())
function openHelp() {
  dialog.value?.showModal()
  helpOpen.value = Boolean(dialog.value?.open)
}
function closeHelp() { dialog.value?.close(); helpOpen.value = false }
function closeFromBackdrop(event: MouseEvent) {
  if (event.target !== dialog.value) return
  const rect = dialog.value!.getBoundingClientRect()
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)
    closeHelp()
}
watch(() => hints.value.map((hint) => hint.id).join(','), closeHelp)
</script>
<template>
  <template v-if="!game.local.autoplay.value">
    <button v-if="game.local.hardControls.value && !game.local.holding.value && game.local.waitRemainingMs.value > 0"
      class="action wait-action" data-action-role="primary" aria-label="等，暂停牌局并使用本局等待时间" @click="game.local.startHold()">
      <b>等</b><span class="action-detail">{{ Math.ceil(game.local.waitRemainingMs.value / 1000) }}秒</span>
    </button>
    <button v-if="game.local.hardControls.value && (game.local.holding.value || game.local.waitRemainingMs.value <= 0) && !game.winPlans.value.length"
      class="action hu" data-action-role="major" @click="game.userHu()"><b>胡</b></button>
    <button v-for="plan in (game.local.hardControls.value && !game.local.holding.value && game.local.waitRemainingMs.value > 0 ? [] : game.winPlans.value)" :key="plan.key" class="action hu hu-plan" data-action-role="major"
      :aria-label="`胡${plan.label}`" :title="`本牌 ${plan.value.naturalYaos} 张 · 赖子 ${plan.value.wildcards} 张`"
      @click="game.confirmHuPlan(plan.key)">
      <b class="hu-plan-label"><span v-for="pattern in plan.label.split('＋')" :key="pattern">{{ pattern }}</span></b>
      <span class="action-detail">本{{ plan.value.naturalYaos }}·赖{{ plan.value.wildcards }}</span>
    </button>
    <button v-if="game.local.holding.value" class="action pass" data-action-role="secondary" @click="game.local.passHold()"><b>过</b></button>
    <span v-if="game.local.holding.value" class="wait-budget" role="timer" aria-label="本小局剩余等待时间">{{ Math.ceil(game.local.waitRemainingMs.value / 1000) }}秒</span>
    <template v-if="!game.local.holding.value && game.original.value && game.local.waiting.value.length">
      <span v-if="game.local.decisionSeconds.value > 0" class="wait-budget" role="timer" aria-label="原报操作剩余时间"
        title="操作超时后由 AI 代操作一次">操作 {{ game.local.decisionSeconds.value }}秒</span>
      <button
        class="action hu"
        data-action-role="major"
        @click="game.local.dispatch({ type: 'original', declare: true })"
      >
        <b class="action-label">原报</b>
      </button>
      <button
        class="action primary"
        data-action-role="primary"
        @click="game.local.dispatch({ type: 'original', declare: false })"
      >
        <b class="action-label action-label-small">不原报</b>
      </button>
    </template>
    <button
      v-if="!game.local.holding.value && game.canArmDeclaration.value"
      class="action primary"
      :class="{ active: game.declarationArmed.value }"
      data-action-role="primary"
      :aria-label="declarationLabel"
      :title="declarationLabel"
      :aria-pressed="game.declarationArmed.value"
      @click="game.declarationArmed.value = !game.declarationArmed.value"
    >
      <TableControlIcon name="declare" />
    </button>
  </template>
  <template v-if="sendQuickChat">
    <button type="button" class="action quick-chat-trigger" data-action-role="secondary"
      aria-label="快捷语" title="快捷语" aria-haspopup="dialog" :aria-expanded="chatOpen" @click="openChat">
      <TableControlIcon name="chat" class="quick-chat-icon" />
    </button>
    <dialog ref="chatDialog" class="quick-chat-dialog" :aria-labelledby="chatTitleId"
      @close="chatOpen = false" @click="closeChatFromBackdrop">
      <header>
        <h2 :id="chatTitleId">快捷语</h2>
        <button type="button" class="quick-chat-close" aria-label="关闭快捷语" @click="closeChat">×</button>
      </header>
      <div class="quick-chat-tabs" role="tablist" aria-label="快捷语分类">
        <button v-for="(page, index) in chatPages" :key="page.id" type="button" role="tab"
          :aria-selected="chatPage === index" :class="{ active: chatPage === index }"
          @click="chatPage = index">{{ page.label }}</button>
      </div>
      <div class="quick-chat-grid" role="tabpanel" :aria-label="chatPages[chatPage]?.label">
        <button v-for="phrase in chatPages[chatPage]?.phrases ?? []" :key="phrase.id" type="button"
          class="quick-chat-send" @click="sendPhrase(phrase)">{{ phrase.text }}</button>
      </div>
      <footer>
        <p v-if="chatNotice" class="quick-chat-note" role="status">{{ chatNotice }}</p>
        <button type="button" class="quick-chat-done" @click="closeChat">关闭</button>
      </footer>
    </dialog>
  </template>
  <template v-if="emotes">
    <dialog ref="emoteDialog" class="emote-dialog" :aria-labelledby="emoteTitleId"
      @close="onEmoteDialogClose" @click="closeEmoteFromBackdrop">
      <header>
        <h2 :id="emoteTitleId">{{ emoteTitle }}</h2>
        <button type="button" class="quick-chat-close" aria-label="关闭互动道具" @click="closeEmotePanel">×</button>
      </header>
      <div class="emote-grid">
        <button v-for="emote in YAOTONG_EMOTES" :key="emote.id" type="button" :data-emote-choice="emote.id"
          @click="sendEmote(emote.id)">
          <YaotongEmoteArt :kind="emote.id" :size="46" />
          <span>{{ emote.label }}</span>
        </button>
      </div>
    </dialog>
  </template>
  <template v-if="hints.length">
    <button type="button" class="action yaotong-help-trigger" data-action-role="secondary"
      :title="helpTitle" :aria-label="helpTitle" :aria-describedby="`${helpId}-summary`"
      :aria-expanded="helpOpen" :aria-controls="helpId" aria-haspopup="dialog" @click="openHelp">
      <TableControlIcon :name="hasProtectionHint ? 'protection' : 'hint'" />
    </button>
    <span :id="`${helpId}-summary`" class="help-summary" role="status">{{ hints[0]?.summary }}</span>
    <dialog ref="dialog" :id="helpId" class="yaotong-help-dialog" :aria-labelledby="`${helpId}-title`"
      @close="helpOpen = false" @click="closeFromBackdrop">
      <header><h2 :id="`${helpId}-title`">{{ helpTitle }}</h2>
        <button type="button" class="help-close" aria-label="关闭提示" @click="closeHelp">×</button>
      </header>
      <div class="yaotong-help-content">
        <article v-for="hint in hints" :key="hint.id">
          <h3>{{ hint.summary }}</h3>
          <p>{{ hint.reason }}</p>
          <p class="help-action"><b>现在怎么做</b>{{ hint.action }}</p>
          <p v-if="hint.release"><b>何时解除</b>{{ hint.release }}</p>
        </article>
      </div>
      <footer><button type="button" class="help-confirm" autofocus @click="closeHelp">知道了</button></footer>
    </dialog>
  </template>
  <span v-else-if="game.local.mode.value === 'hard' && game.risk.value" class="yaotong-action-note danger" role="status"
    :title="game.risk.value" :aria-label="game.risk.value">{{ game.local.response.value?.mandatory || game.local.self.value?.mandatory ? '必胡' : '过手' }}</span>
  <span v-if="game.local.state.value?.dice[0] === game.local.state.value?.dice[1]" class="yaotong-double"
    title="骰子同点，本局双倍">×2</span
  >
</template>
<style scoped>
.wait-budget { color: var(--theme-accent-text); font-size: 13px; font-variant-numeric: tabular-nums; }
.help-summary { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.yaotong-help-dialog { --dialog-width: 480px; --dialog-radius: 12px; }
.quick-chat-dialog { --dialog-width: 430px; }
.emote-dialog { --dialog-width: 390px; }
:is(.yaotong-help-dialog, .quick-chat-dialog, .emote-dialog) {
  position: fixed;
  inset: var(--safe-top) var(--safe-right) var(--safe-bottom) var(--safe-left);
  width: min(var(--dialog-width), calc(100vw - var(--safe-left) - var(--safe-right) - 24px));
  max-width: none;
  max-height: calc(100dvh - var(--safe-top) - var(--safe-bottom) - 24px);
  margin: auto;
  padding: 0;
  border: 1px solid var(--theme-border);
  border-radius: var(--dialog-radius, 14px);
  background: var(--theme-panel);
  color: var(--theme-text);
  box-shadow: 0 16px 60px #0009;
  text-align: left;
  overflow: auto;
}
:is(.yaotong-help-dialog, .quick-chat-dialog, .emote-dialog)::backdrop { background: #0009; }
.yaotong-help-dialog button:focus-visible { outline: 2px solid var(--theme-accent); outline-offset: 3px; }
.yaotong-help-dialog header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 18px; border-bottom: 1px solid var(--theme-border); }
.yaotong-help-dialog h2 { margin: 0; font-size: 19px; color: var(--theme-accent-text); }
.help-close { min-width: 36px; min-height: 36px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--theme-text); font-size: 24px; cursor: pointer; }
.yaotong-help-content { padding: 0 18px; }
.yaotong-help-content article { padding: 14px 0; }
.yaotong-help-content article + article { border-top: 1px solid var(--theme-border); }
.yaotong-help-content h3 { margin: 0 0 8px; font-size: 15px; color: var(--theme-accent-text); }
.yaotong-help-content p { margin: 7px 0 0; font-size: 13px; line-height: 1.7; }
.yaotong-help-content p b { display: block; margin-bottom: 2px; }
.yaotong-help-dialog footer { display: flex; justify-content: flex-end; padding: 0 18px 14px; }
.help-confirm { min-width: 90px; min-height: 40px; padding: 8px 18px; border: 1px solid var(--theme-border); border-radius: 6px; background: var(--theme-button); color: var(--theme-button-text); font-weight: 700; cursor: pointer; }
.quick-chat-dialog header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border-bottom: 1px solid var(--theme-border); }
.quick-chat-dialog h2 { margin: 0; font-size: 18px; color: var(--theme-accent-text); }
.quick-chat-close { min-width: 36px; min-height: 36px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--theme-text); font-size: 24px; cursor: pointer; }
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
.emote-dialog header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border-bottom: 1px solid var(--theme-border); }
.emote-dialog h2 { margin: 0; font-size: 18px; color: var(--theme-accent-text); }
.emote-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; padding: 14px; }
.emote-grid button { display: grid; justify-items: center; align-content: center; gap: 4px; min-height: 86px; padding: 8px 4px; border: 1px solid var(--theme-border); border-radius: 10px; background: var(--theme-button); color: var(--theme-button-text); font: inherit; font-size: 12px; cursor: pointer; }
.emote-grid button:hover, .emote-grid button:focus-visible { border-color: var(--theme-accent); background: color-mix(in srgb, var(--theme-accent) 16%, var(--theme-button)); }
.emote-grid button:focus-visible { outline: 2px solid var(--theme-accent); outline-offset: 2px; }
@media (max-width: 430px) {
  .emote-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; padding: 10px; }
  .emote-grid button { min-height: 72px; padding: 5px 2px; font-size: 11px; }
}
@media (max-height: 520px) {
  .emote-dialog header { padding: 6px 14px; }
  .emote-grid { padding: 8px 10px; }
  .emote-grid button { min-height: 68px; }
}
@media (max-width: 430px) {
  .quick-chat-grid { grid-template-columns: 1fr; }
}
@media (max-height: 520px) {
  .quick-chat-dialog header { padding: 6px 14px; }
  .quick-chat-grid { padding: 8px 12px; }
  .quick-chat-send { min-height: 40px; }
}
@media (max-height: 520px) {
  .yaotong-help-dialog header { padding: 6px 14px; }
  .yaotong-help-content { padding: 0 14px; }
  .yaotong-help-content article { padding: 10px 0; }
  .yaotong-help-content p { font-size: 12px; line-height: 1.5; }
}
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
}
@media (hover: hover) and (pointer: fine) {
  @container game (min-width: 1000px) and (min-height: 560px) {
    .yaotong-double { font-size: clamp(12px, .88cqw, 18px); }
  }
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
