import type { YaotongEmoteId } from '../../game/variants/yaotong/emotes'

const EMOTE_ART = {
  tomato: { item: 'tomato.png', hit: 'tomato-splat.png', sheet: 'tomato-impact.png' },
  egg: { item: 'egg.png', hit: 'egg-splat.png', sheet: 'egg-impact.png' },
  pan: { item: 'pan.png' },
  kiss: { item: 'kiss.png' },
  like: { item: 'like.png' },
  banana: { item: 'banana-peel.png' },
} satisfies Record<YaotongEmoteId, { item: string; hit?: string; sheet?: string }>

const base = `${import.meta.env.BASE_URL}images/emotes/`

export const emoteArtUrls = Object.values(EMOTE_ART).flatMap(art => Object.values(art).map(file => base + file))

export function emoteArtUrl(kind: YaotongEmoteId, frame: 'item' | 'hit' | 'sheet'): string {
  const art: { item: string; hit?: string; sheet?: string } = EMOTE_ART[kind]
  return art ? base + (art[frame] ?? art.item) : ''
}
