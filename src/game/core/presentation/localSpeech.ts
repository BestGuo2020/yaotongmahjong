/** 浏览器本地语音（SpeechSynthesis）。只在用户点击后朗读，不请求任何 TTS 网关。 */

export interface SpeechVoiceInfo {
  name: string
  lang: string
  localService?: boolean
  default?: boolean
}

const MALE_VOICE_HINTS = [
  'kangkang', 'yunxi', 'yunjian', 'yunyang', 'yunye', 'yunfeng', 'yunhao',
  'male', '男', '康康', '云希', '云健', '云扬', '云野', '云枫', '云皓',
] as const

const FEMALE_VOICE_HINTS = [
  'huihui', 'xiaoxiao', 'xiaoyi', 'yaoyao', 'xiaohan', 'xiaomo',
  'female', 'woman', '女', '慧慧', '晓晓', '晓伊', '瑶瑶', '小艺',
] as const

function voiceName(voice: SpeechVoiceInfo): string {
  return (voice.name ?? '').toLowerCase()
}

export function isMaleChineseVoice(voice: SpeechVoiceInfo): boolean {
  const name = voiceName(voice)
  if (FEMALE_VOICE_HINTS.some(hint => name.includes(hint))) return false
  return MALE_VOICE_HINTS.some(hint => name.includes(hint))
}

function isChineseVoice(voice: SpeechVoiceInfo): boolean {
  return /^zh(?:$|[-_])/i.test((voice.lang ?? '').trim())
}

function isMainlandChineseVoice(voice: SpeechVoiceInfo): boolean {
  return /^zh[-_]?cn$/i.test((voice.lang ?? '').trim())
}

/**
 * 只选本地/在线中文男声；没有男声时返回 null，调用方保持静默而不是退回女声。
 * （本机 Windows 的 SAPI 实际只有 Huihui 女声，Chromium 却会列出 Kangkang，
 * 所以快捷语主路径改为预生成的豆包男声 Ogg；这里是兜底。）
 */
export function pickChineseMaleVoice<T extends SpeechVoiceInfo>(voices: readonly T[]): T | null {
  const males = voices.filter(voice => isChineseVoice(voice) && isMaleChineseVoice(voice))
  if (!males.length) return null

  const score = (voice: T): number => {
    let value = 0
    if (voice.localService) value += 4
    if (isMainlandChineseVoice(voice)) value += 3
    if (voice.default) value += 1
    return value
  }

  return [...males].sort((a, b) => score(b) - score(a))[0] ?? null
}

export interface LocalSpeech {
  speak(text: string): void
  cancel(): void
  dispose(): void
  voiceName(): string | null
}

interface LocalSpeechOptions {
  /** 测试可注入；缺省用 window.speechSynthesis。 */
  synth?: SpeechSynthesis | null
  /** 测试可注入；缺省 new SpeechSynthesisUtterance(text)。 */
  createUtterance?: (text: string) => SpeechSynthesisUtterance
}

/**
 * 创建本地朗读器。语音列表在首次点击时读取；部分浏览器会异步触发 voiceschanged，
 * 因此同时监听并缓存，后续朗读不需要等待。
 */
export function createLocalSpeech(options: LocalSpeechOptions = {}): LocalSpeech {
  const synth = options.synth !== undefined
    ? options.synth
    : (typeof window !== 'undefined' ? window.speechSynthesis ?? null : null)
  if (!synth) return { speak() {}, cancel() {}, dispose() {}, voiceName: () => null }

  let voices: SpeechSynthesisVoice[] = []
  const refresh = () => {
    try {
      voices = Array.from(synth.getVoices() ?? [])
    } catch {
      voices = []
    }
  }
  refresh()
  const onVoicesChanged = () => refresh()
  try {
    synth.addEventListener?.('voiceschanged', onVoicesChanged)
  } catch {
    // 某些 WebView 不实现事件；首次点击仍会重新读取。
  }

  const createUtterance = options.createUtterance
    ?? ((text: string) => new SpeechSynthesisUtterance(text))

  const speak = (text: string) => {
    const value = text.trim()
    if (!value) return
    refresh()
    const voice = pickChineseMaleVoice(voices)
    // 没有中文男声就不出声；女声兜底会让“男声快捷语”变成另一种错误。
    if (!voice) return
    try {
      synth.cancel()
      const utterance = createUtterance(value)
      utterance.lang = 'zh-CN'
      utterance.voice = voice
      utterance.rate = 1.06
      utterance.pitch = 0.95
      utterance.volume = 0.95
      synth.speak(utterance)
    } catch {
      // 浏览器没有可用语音时保持静默，快捷语气泡仍正常显示。
    }
  }

  const cancel = () => {
    try {
      synth.cancel()
    } catch {
      // ignore
    }
  }

  return {
    speak,
    cancel,
    dispose() {
      cancel()
      try {
        synth.removeEventListener?.('voiceschanged', onVoicesChanged)
      } catch {
        // ignore
      }
    },
    voiceName() {
      refresh()
      return pickChineseMaleVoice(voices)?.name ?? null
    },
  }
}
