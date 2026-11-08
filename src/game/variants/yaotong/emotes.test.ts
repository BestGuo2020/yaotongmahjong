import { describe, expect, it } from 'vitest'
import { EMOTE_THROW_SOUND, YAOTONG_EMOTES, yaotongEmote } from './emotes'

describe('幺筒互动表情', () => {
  it('六个道具，id 与标签都不重复', () => {
    expect(YAOTONG_EMOTES.map(emote => emote.id)).toEqual(['tomato', 'egg', 'pan', 'banana', 'kiss', 'like'])
    expect(YAOTONG_EMOTES.map(emote => emote.label)).toEqual(['番茄', '鸡蛋', '平底锅', '香蕉皮', '亲吻', '点赞'])
  })

  it('按 id 取到对应音效', () => {
    expect(yaotongEmote('banana').impactSound).toBe('sounds/emote-banana.ogg')
    expect(YAOTONG_EMOTES.filter(emote => emote.soundOnThrow).map(emote => emote.id))
      .toEqual(['tomato', 'egg', 'pan', 'kiss', 'like'])
    expect(EMOTE_THROW_SOUND).toBe('sounds/emote-throw.ogg')
    expect(YAOTONG_EMOTES.map(emote => emote.impactSound)).toEqual([
      'sounds/emote-tomato.ogg',
      'sounds/emote-egg.ogg',
      'sounds/emote-pan.ogg',
      'sounds/emote-banana.ogg',
      'sounds/emote-kiss.ogg',
      'sounds/emote-like.ogg',
    ])
  })
})
