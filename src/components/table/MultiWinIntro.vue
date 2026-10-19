<script setup lang="ts">
import { computed } from 'vue'
import BloodFlowImpactTitle from './BloodFlowImpactTitle.vue'
import type { TableThemeName } from './three/tableTheme'
import { MULTI_WIN_INTRO_DURATION } from '../../game/core/presentation/winEffect'

const props = defineProps<{ sourceIndex: number; themeName: TableThemeName; compact?: boolean; reduced?: boolean }>()
const introStyle = computed(() => ({
  left: `${(props.compact ? [50, 74, 44, 26] : [50, 77, 50, 23])[props.sourceIndex]}%`,
  ...(props.sourceIndex === 0
    ? { bottom: props.compact ? '22%' : '19%' }
    : { top: `${(props.compact ? [0, 42, 12, 42] : [0, 38, 12, 38])[props.sourceIndex]}%` }),
  '--multi-intro-duration': `${MULTI_WIN_INTRO_DURATION}ms`,
}))
</script>

<template>
  <div class="blood-flow-multi-intro" :class="{ compact, reduced }" :style="introStyle"
    :data-source-index="sourceIndex" data-multi-intro="1" role="status" aria-live="polite">
    <BloodFlowImpactTitle text="一炮多响" :theme="themeName" />
  </div>
</template>

<style scoped>
.blood-flow-multi-intro { position: absolute; z-index: 42; pointer-events: none; transform: translateX(-50%); width: clamp(200px,26vw,340px); isolation: isolate; animation: multi-intro-pop var(--multi-intro-duration) cubic-bezier(.2,1.4,.35,1) both; }
.blood-flow-multi-intro.compact { width: clamp(150px,24vw,230px); }
.blood-flow-multi-intro.reduced { animation: none; }
@keyframes multi-intro-pop {
  0% { opacity: 0; transform: translateX(-50%) scale(.55) rotate(-4deg); }
  18% { opacity: 1; transform: translateX(-50%) scale(1.12) rotate(1.5deg); }
  30% { transform: translateX(-50%) scale(.98) rotate(0); }
  78% { opacity: 1; transform: translateX(-50%) scale(1); }
  100% { opacity: 0; transform: translateX(-50%) scale(1.04); }
}
</style>
