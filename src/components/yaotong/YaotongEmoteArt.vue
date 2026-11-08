<script setup lang="ts">
import { computed } from 'vue'
import type { YaotongEmoteId } from '../../game/variants/yaotong/emotes'

const props = withDefaults(defineProps<{
  kind: YaotongEmoteId
  size?: number
  /** item = 飞行/面板；hit = 命中时的碎裂帧。 */
  variant?: 'item' | 'hit'
  /** 番茄/鸡蛋命中时播放原版逐帧动画。 */
  animated?: boolean
}>(), { size: 44, variant: 'item', animated: false })

const IMAGES: Partial<Record<YaotongEmoteId, { item: string; hit?: string }>> = {
  tomato: { item: 'tomato.png', hit: 'tomato-splat.png' },
  egg: { item: 'egg.png', hit: 'egg-splat.png' },
  pan: { item: 'pan.png' },
  kiss: { item: 'kiss.png' },
  like: { item: 'like.png' },
  banana: { item: 'banana-peel.png' },
}

const image = computed(() => {
  const entry = IMAGES[props.kind]
  if (!entry) return ''
  const file = props.variant === 'hit' && entry.hit ? entry.hit : entry.item
  return `${import.meta.env.BASE_URL}images/emotes/${file}`
})
const sheet = computed(() => props.animated && (props.kind === 'tomato' || props.kind === 'egg')
  ? props.kind
  : '')
const sheetWidth = computed(() => props.kind === 'egg' ? Math.round(props.size * 0.625) : props.size)
const sheetEnd = computed(() => `-${(props.kind === 'egg' ? 19 : 20) * sheetWidth.value}px`)
const sheetImage = computed(() => sheet.value
  ? `url(${import.meta.env.BASE_URL}images/emotes/${sheet.value}-impact.png)`
  : 'none')
</script>

<template>
  <div v-if="sheet" class="yaotong-emote-sheet" :class="sheet"
    :style="{ width: `${sheetWidth}px`, height: `${size}px`, backgroundImage: sheetImage, '--sprite-end': sheetEnd }" aria-hidden="true"></div>
  <img v-else-if="image" class="yaotong-emote-art" :src="image" :width="size" :height="size"
    alt="" draggable="false" />
</template>

<style scoped>
.yaotong-emote-art { display: block; flex: none; object-fit: contain; overflow: visible; }
.yaotong-emote-sheet {
  display: block;
  flex: none;
  background-repeat: no-repeat;
  background-position: 0 0;
  background-size: auto 100%;
}
.yaotong-emote-sheet.tomato {
  animation: tomato-sheet 1.1s steps(20) both;
}
.yaotong-emote-sheet.egg {
  animation: egg-sheet 1.1s steps(19) both;
}
@keyframes tomato-sheet {
  from { background-position: 0 0; }
  to { background-position: var(--sprite-end) 0; }
}
@keyframes egg-sheet {
  from { background-position: 0 0; }
  to { background-position: var(--sprite-end) 0; }
}
@media (prefers-reduced-motion: reduce) {
  .yaotong-emote-sheet.tomato,
  .yaotong-emote-sheet.egg {
    animation: none;
    background-position: var(--sprite-end) 0;
  }
}
</style>
