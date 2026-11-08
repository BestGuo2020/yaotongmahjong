/** 互动表情：六个可投掷道具，选择后点击对手头像投掷。 */
export type YaotongEmoteId = 'tomato' | 'egg' | 'pan' | 'banana' | 'kiss' | 'like'

export interface YaotongEmote {
  readonly id: YaotongEmoteId
  readonly label: string
  /** 命中/整段音效；soundOnThrow 时在出手瞬间播放整段。 */
  readonly impactSound: string
  /** 有原版整段音效的道具：出手即播，不再补飞掷声。 */
  readonly soundOnThrow?: boolean
}

/** 香蕉皮等没有整段原声时使用的飞掷音效（欢乐麻将 Fly）。 */
export const EMOTE_THROW_SOUND = 'sounds/emote-throw.ogg'

export const YAOTONG_EMOTES: readonly YaotongEmote[] = [
  { id: 'tomato', label: '番茄', impactSound: 'sounds/emote-tomato.ogg', soundOnThrow: true },
  { id: 'egg', label: '鸡蛋', impactSound: 'sounds/emote-egg.ogg', soundOnThrow: true },
  { id: 'pan', label: '平底锅', impactSound: 'sounds/emote-pan.ogg', soundOnThrow: true },
  { id: 'banana', label: '香蕉皮', impactSound: 'sounds/emote-banana.ogg' },
  { id: 'kiss', label: '亲吻', impactSound: 'sounds/emote-kiss.ogg', soundOnThrow: true },
  { id: 'like', label: '点赞', impactSound: 'sounds/emote-like.ogg', soundOnThrow: true },
] as const

export function yaotongEmote(id: YaotongEmoteId): YaotongEmote {
  return YAOTONG_EMOTES.find(emote => emote.id === id) ?? YAOTONG_EMOTES[0]!
}
