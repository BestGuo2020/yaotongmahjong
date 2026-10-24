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
const timing = computed(() => props.progress == null ? undefined : {
  animation: 'win-cue-serial 700ms ease-out both paused',
  animationDelay: `${-Math.max(0, Math.min(1, props.progress)) * 700}ms`,
})
</script>

<template>
  <AnimeActionCue v-if="themeName === 'llmAnime'"
    :class="[`action-${presentation.kind}`, `strength-${presentation.strength}`, { 'named-gang': namedGang }]"
    :data-action-type="event.type" :data-action-kind="presentation.kind" :data-action-strength="presentation.strength"
    :event="event" :player="player" :position="position" :progress="progress" :label="cueLabel" />
  <div v-else class="table-action-cue"
    :class="[`action-from-${position}`, `action-${presentation.kind}`, `strength-${presentation.strength}`,
      { gang: presentation.kind === 'gang', win: presentation.kind === 'win', 'named-gang': namedGang }]"
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
.table-action-cue.named-gang span {
  font-size: clamp(28px, 3.4vw, 52px);
}
.anime-action-cue.named-gang :deep(.anime-action-copy strong) {
  font-size: clamp(24px, 4.7vh, 60px);
  white-space: nowrap;
}
</style>
