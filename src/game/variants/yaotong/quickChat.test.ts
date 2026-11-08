import { describe, expect, it } from 'vitest'
import { QUICK_CHAT_AUDIO_ASSETS } from '../../core/presentation/audioAssets'
import { QUICK_CHAT_PAGES, QUICK_CHAT_PHRASES } from './quickChat'

describe('幺筒快捷语', () => {
  it('两页十二槽，id 与文案都不重复', () => {
    expect(QUICK_CHAT_PAGES.map(page => page.label)).toEqual(['常用', '气氛'])
    expect(QUICK_CHAT_PAGES.map(page => page.phrases.length)).toEqual([6, 6])
    expect(QUICK_CHAT_PHRASES).toHaveLength(12)
    expect(new Set(QUICK_CHAT_PHRASES.map(phrase => phrase.id)).size).toBe(12)
    expect(new Set(QUICK_CHAT_PHRASES.map(phrase => phrase.text)).size).toBe(12)
  })

  it('每句都指向独立的豆包男声 Ogg', () => {
    const audio = QUICK_CHAT_PHRASES.map(phrase => phrase.audio)
    expect(audio.every(Boolean)).toBe(true)
    expect(new Set(audio).size).toBe(12)
    expect(audio).toEqual([...QUICK_CHAT_AUDIO_ASSETS])
    for (const phrase of QUICK_CHAT_PHRASES)
      expect(phrase.audio).toBe(`sounds/chat-${phrase.id}.ogg`)
  })

  it('保留用户指定的三句幺筒快捷语', () => {
    const texts = QUICK_CHAT_PHRASES.map(phrase => phrase.text)
    expect(texts).toContain('能不能跟？')
    expect(texts).toContain('听没听啊～')
    expect(texts).toContain('这把赔不起，流局+1')
  })

  it('TTS 文本处理 + 和波浪号，避免念成加号', () => {
    const draw = QUICK_CHAT_PHRASES.find(phrase => phrase.id === 'draw')
    const listen = QUICK_CHAT_PHRASES.find(phrase => phrase.id === 'listen')
    const follow = QUICK_CHAT_PHRASES.find(phrase => phrase.id === 'follow')
    expect(draw?.speech).toBe('这把赔不起，流局加一')
    expect(listen?.speech).toBe('听没听啊')
    expect(follow?.speech).toBe('能不能跟')
  })
})
