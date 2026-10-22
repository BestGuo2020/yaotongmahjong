<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import type { useYaotongPort } from '../../game/variants/yaotong/useYaotongPort'
const props = defineProps<{ game: ReturnType<typeof useYaotongPort> }>()
const dialog = ref<HTMLDialogElement | null>(null)
const helpOpen = ref(false)
const helpId = useId()
const hints = computed(() => props.game.guidance.value)
const helpTitle = computed(() => hints.value.some((hint) => hint.protection) ? '系统防护' : '操作提示')
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
      <b>等</b><span>{{ Math.ceil(game.local.waitRemainingMs.value / 1000) }}秒</span>
    </button>
    <button v-if="game.local.hardControls.value && (game.local.holding.value || game.local.waitRemainingMs.value <= 0) && !game.winPlans.value.length"
      class="action hu" data-action-role="major" @click="game.userHu()"><b>胡</b></button>
    <button v-for="plan in (game.local.hardControls.value && !game.local.holding.value && game.local.waitRemainingMs.value > 0 ? [] : game.winPlans.value)" :key="plan.key" class="action hu hu-plan" data-action-role="major"
      @click="game.confirmHuPlan(plan.key)">
      <b>胡{{ plan.label }}</b>
      <span>本牌 {{ plan.value.naturalYaos }} · 赖子 {{ plan.value.wildcards }}</span>
    </button>
    <button v-if="game.local.holding.value" class="action pass" data-action-role="secondary" @click="game.local.passHold()"><b>过</b></button>
    <span v-if="game.local.holding.value" class="wait-budget" role="timer" aria-label="本小局剩余等待时间">{{ Math.ceil(game.local.waitRemainingMs.value / 1000) }}秒</span>
    <template v-if="!game.local.holding.value && game.original.value && game.local.waiting.value.length">
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
      v-if="!game.local.holding.value && game.canArmDeclaration.value"
      class="action primary"
      :class="{ active: game.declarationArmed.value }"
      data-action-role="primary"
      :aria-pressed="game.declarationArmed.value"
      @click="game.declarationArmed.value = !game.declarationArmed.value"
    >
      <b>{{ game.declarationArmed.value ? '取消报听' : '报听' }}</b>
    </button>
  </template>
  <template v-if="hints.length">
    <button type="button" class="yaotong-help-trigger" data-action-role="secondary"
      :aria-expanded="helpOpen" :aria-controls="helpId" aria-haspopup="dialog" @click="openHelp">
      <b>{{ helpTitle }} <span aria-hidden="true">ⓘ</span></b>
      <span role="status" aria-live="polite">{{ hints[0]!.summary }}</span>
    </button>
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
.wait-action { min-width: 54px; height: 52px; border: 2px solid var(--theme-accent-text); }
.wait-action b { font-size: 23px; }
.wait-budget { color: var(--theme-accent-text); font-size: 13px; font-variant-numeric: tabular-nums; }
.hu-plan { min-width: 110px; min-height: 48px; height: auto; padding: 6px 10px; border-radius: 10px; }
.hu-plan b { font-size: 15px; }
.hu-plan span { font-size: 11px; }
.yaotong-help-trigger { display: grid; gap: 2px; max-width: 220px; min-height: 44px; padding: 5px 10px; border: 1px solid var(--theme-border); border-radius: 7px; background: var(--theme-panel); color: var(--theme-text); text-align: left; cursor: pointer; font: inherit; }
.yaotong-help-trigger b { color: var(--theme-accent-text); font-size: 12px; }
.yaotong-help-trigger > span { font-size: 11px; line-height: 1.4; }
.yaotong-help-trigger:focus-visible, .yaotong-help-dialog button:focus-visible { outline: 2px solid var(--theme-accent); outline-offset: 3px; }
.yaotong-help-dialog { width: min(480px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); margin: auto; padding: 0; border: 1px solid var(--theme-border); border-radius: 12px; background: var(--theme-panel); color: var(--theme-text); box-shadow: 0 16px 60px #0009; text-align: left; overflow: auto; }
.yaotong-help-dialog::backdrop { background: #0009; }
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
  padding: 4px 8px;
  border: 1px solid var(--theme-border);
  border-radius: 20px;
}
@container (max-width:700px) {
  .yaotong-help-trigger { max-width: 180px; padding: 4px 7px; }
  .yaotong-action-note {
    font-size: 10px;
    max-width: 130px;
  }
  .yaotong-double {
    font-size: 10px;
  }
}
</style>
