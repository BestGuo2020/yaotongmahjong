<script setup lang="ts">
import { computed, ref } from 'vue'
import GameSettingsSummary from './GameSettingsSummary.vue'
import LobbyDialog from './LobbyDialog.vue'
import YaotongMatchPicker from '../yaotong/YaotongMatchPicker.vue'
import YaotongModePicker from '../yaotong/YaotongModePicker.vue'
import { YAOTONG_MODES, type YaotongMode } from '../../game/variants/yaotong/mode'
import AnimeCharacterPicker from '../llm/AnimeCharacterPicker.vue'
import LobbyThemeVisual from './LobbyThemeVisual.vue'
import type { CharacterId } from '../../game/llm/animeCharacters'
import type { TableThemeName } from '../table/three/tableTheme'

const props = defineProps<{
  yaotongLength: 4 | 8 | 16
  yaotongMode: YaotongMode
  animeCharacterId: CharacterId
  tableThemeName: TableThemeName
}>()
defineEmits<{
  'update:yaotongLength': [value: 4 | 8 | 16]
  'update:yaotongMode': [value: YaotongMode]
  'update:animeCharacterId': [value: CharacterId]
  startLocal: []
  openRules: []
  openReplay: []
}>()
const dialog = ref<'match' | 'mode' | 'character' | null>(null)
const mode = ref<'local' | 'multiplayer'>('local')
const matchOption = computed(() => ({
  name: ({ 4: '东风场', 8: '半庄场', 16: '全庄场' })[props.yaotongLength],
  description: String(props.yaotongLength) + '庄次 · 连庄不增加庄次',
}))
</script>

<template>
  <section class="lobby">
    <div class="lobby-layout">
      <LobbyThemeVisual :theme-name="tableThemeName" :character-id="animeCharacterId"
        @select-character="dialog = 'character'" />
      <section class="lobby-actions" aria-label="对局操作">
        <div class="mode-selector" role="radiogroup" aria-label="游戏模式">
          <button data-action-role="secondary" role="radio" :aria-checked="mode === 'local'"
            :class="{ active: mode === 'local' }" @click="mode = 'local'">
            <b>单机对战</b><span>与三名本地 AI 同桌</span>
          </button>
          <button data-action-role="secondary" role="radio" :aria-checked="mode === 'multiplayer'"
            :class="{ active: mode === 'multiplayer' }" @click="mode = 'multiplayer'">
            <b>联机对战</b><span>创建或加入房间</span>
          </button>
        </div>
        <template v-if="mode === 'local'">
          <GameSettingsSummary :match-name="matchOption.name" :match-description="matchOption.description"
            rule-label="模式" :rule-name="YAOTONG_MODES[yaotongMode].name" :rule-description="YAOTONG_MODES[yaotongMode].summary"
            @select-match="dialog = 'match'" @select-rule="dialog = 'mode'" />
          <button class="start-button" data-action-role="primary" @click="$emit('startLocal')">
            <b>开始{{ matchOption.name }}</b><span>幺筒麻将 · 四人对局</span>
          </button>
        </template>
        <section v-else class="multiplayer-coming-soon" role="status" aria-label="联机对战建设中">
          <h2>联机对战正在建设中</h2>
          <p>好友同桌功能正在开发，敬请期待。</p>
        </section>
        <div class="lobby-links">
          <button class="text-button" data-action-role="light" @click="$emit('openReplay')">对局回放 →</button>
          <button class="text-button" data-action-role="light" @click="$emit('openRules')">游戏规则 →</button>
        </div>
      </section>
    </div>
    <LobbyDialog v-if="dialog" :title="dialog === 'match' ? '选择场次' : dialog === 'mode' ? '选择模式' : '本家形象'"
      :wide="dialog === 'character'" :theme-name="tableThemeName" :variant="dialog" @close="dialog = null">
      <YaotongMatchPicker v-if="dialog === 'match'" :model-value="yaotongLength"
        @confirm="$emit('update:yaotongLength', $event); dialog = null" @close="dialog = null" />
      <YaotongModePicker v-else-if="dialog === 'mode'" :model-value="yaotongMode"
        @confirm="$emit('update:yaotongMode', $event); dialog = null" @close="dialog = null" />
      <AnimeCharacterPicker v-else :model-value="animeCharacterId"
        @update:model-value="$emit('update:animeCharacterId', $event); dialog = null" />
    </LobbyDialog>
  </section>
</template>

<style scoped>
.multiplayer-coming-soon { display: grid; gap: 12px; padding: 24px 16px; text-align: center; border: 1px solid var(--theme-border); border-radius: 12px; background: var(--theme-panel); color: var(--theme-text); }
.multiplayer-coming-soon h2 { margin: 0; font-size: 20px; }
.multiplayer-coming-soon p { margin: 0; color: var(--theme-text-muted); font-size: 13px; line-height: 1.7; }

/* 按实际可用空间收紧横屏布局，窄桌面窗口也不能让预览盖住操作区。 */
@container (orientation: landscape) and ((width < 860px) or (height < 520px)) {
  .lobby-layout { grid-template-columns: minmax(0, .85fr) minmax(300px, 1.15fr); align-items: center; align-content: center; gap: 12px; }
  .lobby-actions { padding: 8px; width: 100%; }
  .lobby-actions .mode-selector { margin-bottom: 6px; gap: 5px; }
  .lobby-actions .mode-selector button { padding: 6px 7px; }
  .lobby-actions .mode-selector button b { font-size: 15px; }
  .lobby-actions .game-settings { margin-bottom: 5px; }
  .lobby-actions :deep(.game-settings-title) { padding: 3px 9px; }
  .lobby-actions :deep(.game-settings > button) { min-height: 34px; padding: 3px 8px; }
  .lobby-actions .start-button { min-height: 42px; padding: 4px 12px; }
  .lobby-actions .start-button b { font-size: 18px; }
  .lobby-actions .start-button span { font-size: 10px; }
  .lobby-actions .lobby-links { margin-top: 5px; }
  .multiplayer-coming-soon { padding: 18px 10px; }
  :deep(.lobby-visual) { align-content: center; gap: 4px; overflow: hidden; }
  :deep(.lobby-brand h1) { font-size: clamp(24px, 5cqw, 40px); margin: 4px 0; }
  :deep(.lobby-brand .eyebrow), :deep(.lobby-brand .subtitle) { margin: 3px 0; font-size: 9px; }
  :deep(.theme-showcase) { width: 100%; padding: 3px; gap: 3px; }
  :deep(.theme-showcase.is-anime .theme-showcase-frame) { width: min(140px, 100%, 28cqh); }
  :deep(.theme-showcase-copy strong) { font-size: 14px; }
  :deep(.theme-showcase-copy p) { font-size: 9px; }
  :deep(.theme-showcase-kicker), :deep(.anime-table-theme) { font-size: 8px; }
  :deep(.character-shortcut) { width: 100%; padding: 4px 7px; }
}
</style>
