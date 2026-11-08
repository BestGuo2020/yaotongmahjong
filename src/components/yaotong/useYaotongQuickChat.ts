import { getCurrentScope, onScopeDispose, ref, watch, type Ref } from 'vue'
import { createLocalSpeech } from '../../game/core/presentation/localSpeech'

export interface QuickChatBubble {
  text: string
  id: number
  persistent?: boolean
}

export interface QuickChatAudioHandle {
  pause(): void
  currentTime?: number
}

export interface YaotongQuickChat {
  /** key = 本家视角座位。 */
  bubbles: Ref<Record<number, QuickChatBubble>>
  send: (text: string, speech?: string, audio?: string, relay?: () => boolean) => boolean
  show: (seat: number, text: string, speech?: string, audio?: string) => void
  clear: (seat?: number) => void
  dispose: () => void
}

export interface UseYaotongQuickChatOptions {
  /** 测试可注入；缺省使用浏览器本地 SpeechSynthesis。 */
  speak?: (text: string) => void
  cancelSpeech?: () => void
  /** 播放预生成的本地男声（豆包 TTS 2.0 Ogg）；返回 null 时回退浏览器男声 TTS。 */
  playAudio?: (file: string) => QuickChatAudioHandle | null | undefined
  /** 声音总开关 + 音效开关；静音时气泡照常显示，但不朗读。 */
  enabled?: () => boolean
  now?: () => number
  bubbleMs?: number
  repeatMs?: number
  gapMs?: number
  seat?: number
}

const DEFAULT_BUBBLE_MS = 2_600
const DEFAULT_REPEAT_MS = 5_000
const DEFAULT_GAP_MS = 700

/**
 * 快捷语气泡、发送冷却和朗读。联机以房间广播为准，避免发送者重复播放。
 * 气泡复用 GameTableHud → PlayerSeat 的现有 bubble 渲染，不另建组件。
 */
export function useYaotongQuickChat(options: UseYaotongQuickChatOptions = {}): YaotongQuickChat {
  const localSpeech = options.speak ? null : createLocalSpeech()
  const speak = options.speak ?? ((text: string) => localSpeech!.speak(text))
  const cancelSpeech = options.cancelSpeech ?? (() => localSpeech?.cancel())
  const playAudio = options.playAudio ?? (() => null)
  const enabled = options.enabled ?? (() => true)
  const now = options.now ?? (() => Date.now())
  const bubbleMs = options.bubbleMs ?? DEFAULT_BUBBLE_MS
  const repeatMs = options.repeatMs ?? DEFAULT_REPEAT_MS
  const gapMs = options.gapMs ?? DEFAULT_GAP_MS
  const seat = options.seat ?? 0

  const bubbles = ref<Record<number, QuickChatBubble>>({})
  const timers = new Map<number, ReturnType<typeof setTimeout>>()
  const activeAudio = new Map<number, QuickChatAudioHandle>()
  let serial = 0
  let lastSentAt = -Infinity
  let lastText = ''
  let lastTextAt = -Infinity
  let disposed = false

  const stopAudio = (target: number) => {
    const audio = activeAudio.get(target)
    if (!audio) return
    try {
      audio.pause()
      if (audio.currentTime !== undefined) audio.currentTime = 0
    } catch {
      // 播放器已释放时忽略。
    }
    activeAudio.delete(target)
  }

  const stopVoice = () => {
    cancelSpeech()
    for (const target of activeAudio.keys()) stopAudio(target)
  }

  const removeBubble = (target: number) => {
    if (!(target in bubbles.value)) return
    const next = { ...bubbles.value }
    delete next[target]
    bubbles.value = next
  }

  const clear = (target?: number) => {
    if (target === undefined) {
      stopVoice()
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
      bubbles.value = {}
      // 新一局/回大厅后，上一局的同句冷却不应继续压着玩家。
      lastSentAt = -Infinity
      lastText = ''
      lastTextAt = -Infinity
      return
    }
    const timer = timers.get(target)
    if (timer !== undefined) {
      clearTimeout(timer)
      timers.delete(target)
    }
    removeBubble(target)
  }

  const show = (target: number, value: string, speech = value, audio?: string) => {
    if (disposed) return
    const id = ++serial
    bubbles.value = { ...bubbles.value, [target]: { text: value, id } }

    const previous = timers.get(target)
    if (previous !== undefined) clearTimeout(previous)
    timers.set(target, setTimeout(() => {
      timers.delete(target)
      if (bubbles.value[target]?.id === id) removeBubble(target)
    }, bubbleMs))

    if (enabled()) {
      stopAudio(target)
      let played: QuickChatAudioHandle | null = null
      try {
        played = audio ? playAudio(audio) ?? null : null
      } catch {
        played = null
      }
      if (played) {
        activeAudio.set(target, played)
      } else if (enabled()) {
        try {
          speak(speech.trim() || value)
        } catch {
          // 本地语音失败不能影响气泡和牌局。
        }
      }
    }
  }

  const send = (text: string, speech = text, audio?: string, relay?: () => boolean): boolean => {
    if (disposed) return false
    const value = text.trim()
    if (!value) return false

    const at = now()
    if (at - lastSentAt < gapMs) return false
    if (value === lastText && at - lastTextAt < repeatMs) return false
    if (relay && !relay()) return false

    lastSentAt = at
    lastText = value
    lastTextAt = at
    if (!relay) show(seat, value, speech, audio)
    return true
  }

  const stopWatching = watch(enabled, (on) => {
    if (!on) stopVoice()
  })

  const dispose = () => {
    if (disposed) return
    disposed = true
    stopWatching()
    clear()
    localSpeech?.dispose()
  }

  if (getCurrentScope()) onScopeDispose(dispose)

  return { bubbles, send, show, clear, dispose }
}
