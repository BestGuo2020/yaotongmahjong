import { describe, expect, it, vi } from 'vitest'
import { createLocalSpeech, isMaleChineseVoice, pickChineseMaleVoice } from './localSpeech'

interface TestVoice {
  name: string
  lang: string
  localService?: boolean
  default?: boolean
}

const voice = (name: string, lang: string, localService = true): TestVoice => ({ name, lang, localService })

describe('本地中文男声选择', () => {
  it('优先本地普通话男声，而不是同级的本地女声', () => {
    const voices = [
      voice('Microsoft Huihui - Chinese (Simplified, PRC)', 'zh-CN'),
      voice('Microsoft Kangkang - Chinese (Simplified, PRC)', 'zh-CN'),
    ]
    expect(pickChineseMaleVoice(voices)?.name).toContain('Kangkang')
  })

  it('本地男声优先于在线男声', () => {
    const voices = [
      voice('Microsoft Yunxi Online (Natural) - Chinese (Mainland)', 'zh-CN', false),
      voice('Microsoft Kangkang - Chinese (Simplified, PRC)', 'zh-CN', true),
    ]
    expect(pickChineseMaleVoice(voices)?.name).toContain('Kangkang')
  })

  it('没有男声时返回 null，不退回女声', () => {
    const voices = [
      voice('Microsoft Huihui - Chinese (Simplified, PRC)', 'zh-CN'),
      voice('English United States', 'en-US'),
    ]
    expect(pickChineseMaleVoice(voices)).toBeNull()
  })

  it('没有任何中文声时返回 null，让浏览器按 lang 自行选择', () => {
    expect(pickChineseMaleVoice([voice('English United States', 'en-US')])).toBeNull()
  })

  it('女声名不会被误判成男声', () => {
    expect(isMaleChineseVoice(voice('Microsoft Huihui - Chinese (Mandarin)', 'zh-CN'))).toBe(false)
    expect(isMaleChineseVoice(voice('Microsoft Kangkang - Chinese (Simplified, PRC)', 'zh-CN'))).toBe(true)
  })
})

describe('createLocalSpeech', () => {
  it('朗读前取消上一条，并使用中文男声参数', () => {
    const spoken: SpeechSynthesisUtterance[] = []
    const cancel = vi.fn()
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()
    const synth = {
      getVoices: () => [
        { name: 'Microsoft Huihui', lang: 'zh-CN', localService: true },
        { name: 'Microsoft Kangkang', lang: 'zh-CN', localService: true },
      ],
      speak: (utterance: SpeechSynthesisUtterance) => { spoken.push(utterance) },
      cancel,
      addEventListener,
      removeEventListener,
    } as unknown as SpeechSynthesis
    const speech = createLocalSpeech({
      synth,
      createUtterance: (text) => ({ text } as SpeechSynthesisUtterance),
    })

    speech.speak('能不能跟')

    expect(cancel).toHaveBeenCalled()
    expect(spoken).toHaveLength(1)
    expect(spoken[0]!.text).toBe('能不能跟')
    expect(spoken[0]!.lang).toBe('zh-CN')
    expect(spoken[0]!.voice?.name).toContain('Kangkang')
    expect(spoken[0]!.rate).toBeGreaterThan(1)
    expect(spoken[0]!.volume).toBeGreaterThan(0)

    speech.dispose()
    expect(cancel).toHaveBeenCalledTimes(2)
    expect(removeEventListener).toHaveBeenCalledWith('voiceschanged', expect.any(Function))
  })

  it('空白文本不触发朗读', () => {
    const speak = vi.fn()
    const synth = {
      getVoices: () => [],
      speak,
      cancel: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as SpeechSynthesis
    createLocalSpeech({ synth, createUtterance: (text) => ({ text } as SpeechSynthesisUtterance) }).speak('   ')
    expect(speak).not.toHaveBeenCalled()
  })

  it('只有女声时不朗读，避免快捷语又出女声', () => {
    const speak = vi.fn()
    const synth = {
      getVoices: () => [{ name: 'Microsoft Huihui', lang: 'zh-CN', localService: true }],
      speak,
      cancel: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as SpeechSynthesis
    createLocalSpeech({ synth, createUtterance: (text) => ({ text } as SpeechSynthesisUtterance) }).speak('能不能跟')
    expect(speak).not.toHaveBeenCalled()
  })
})
