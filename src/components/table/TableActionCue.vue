<script setup lang="ts">
import { computed } from 'vue'
import type { GamePlayer } from '../../game/core/contracts/types'
import type { TableCueEvent } from '../../game/core/presentation/tableActionCue'
import { resolveTableActionPresentation } from '../../theme/themeEventPresentation'
import type { TableThemeName } from './three/tableTheme'
import AnimeActionCue from './AnimeActionCue.vue'

// Display only: callers own event deduplication, timing and audio.
const props = defineProps<{
  event: TableCueEvent
  player?: GamePlayer
  themeName: TableThemeName
  position: string
  progress?: number
  label?: string
}>()
const presentation = computed(() => resolveTableActionPresentation(props.event.type))
const cueLabel = computed(() => props.label ?? ('label' in props.event ? props.event.label : undefined))
const namedGang = computed(() => presentation.value.kind === 'gang' && (cueLabel.value?.length ?? 0) > 1)
const highlighted = computed(() => props.event.type === 'ready' || props.event.type === 'peng' || presentation.value.kind === 'gang')
const timing = computed(() => props.progress == null ? undefined : {
  animation: 'win-cue-serial 700ms ease-out both paused',
  animationDelay: `${-Math.max(0, Math.min(1, props.progress)) * 700}ms`,
})
</script>

<template>
  <AnimeActionCue v-if="themeName === 'llmAnime'"
    :class="[`action-${presentation.kind}`, `strength-${presentation.strength}`, { 'named-gang': namedGang, highlighted }]"
    :data-action-type="event.type" :data-action-kind="presentation.kind" :data-action-strength="presentation.strength"
    :event="event" :player="player" :position="position" :progress="progress" :label="cueLabel" />
  <div v-else class="table-action-cue"
    :class="[`action-from-${position}`, `action-${presentation.kind}`, `strength-${presentation.strength}`,
      { gang: presentation.kind === 'gang', win: presentation.kind === 'win', 'named-gang': namedGang, highlighted }]"
    :data-action-type="event.type" :data-action-kind="presentation.kind" :data-action-strength="presentation.strength"
    :style="timing" aria-live="polite"
  ><span>{{ cueLabel ?? presentation.label }}</span></div>
</template>

<style scoped>
.table-action-cue.named-gang {
  width: clamp(132px, 14vw, 220px);
  height: clamp(78px, 8vw, 126px);
  aspect-ratio: auto;
}
.highlighted {
  --cue-accent: var(--theme-accent);
  --cue-font-size: clamp(30px, min(5.2cqw, 10cqh), 72px);
}
.highlighted[data-action-type="ready"] { --cue-accent: var(--theme-positive); }
.highlighted.action-gang { --cue-accent: var(--theme-accent-secondary); }
.highlighted:is([data-action-type="ready"], .named-gang) {
  --cue-font-size: clamp(26px, min(4.2cqw, 8.5cqh), 54px);
}
.table-action-cue.highlighted { grid-template-columns: minmax(0, 1fr); }
.table-action-cue.highlighted[data-action-type] > span,
.anime-action-cue.highlighted :deep(.anime-action-copy strong) {
  position: relative;
  padding: .12em .23em .16em;
  border: 2px solid color-mix(in srgb, var(--cue-accent) 65%, white);
  border-radius: .2em;
  background: linear-gradient(150deg, color-mix(in srgb, var(--cue-accent) 28%, #101418), #101418);
  color: #fffaf0;
  font-size: var(--cue-font-size);
  line-height: 1;
  letter-spacing: 0;
  white-space: nowrap;
  -webkit-text-stroke: 0;
  text-shadow: 0 2px 2px #000a;
  box-shadow: 0 4px 8px #0009, 0 0 14px color-mix(in srgb, var(--cue-accent) 54%, transparent);
}
.anime-action-cue.highlighted :deep(.anime-action-copy strong::after) { content: none; }
</style>
