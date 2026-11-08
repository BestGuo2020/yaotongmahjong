import { getCurrentScope, onScopeDispose, ref, type Ref } from 'vue'
import { EMOTE_THROW_SOUND, YAOTONG_EMOTES, type YaotongEmote, type YaotongEmoteId } from '../../game/variants/yaotong/emotes'

export interface EmoteCue {
  id: number
  emote: YaotongEmoteId
  fromSeat: number
  targetSeat: number
}

export interface YaotongEmotes {
  cues: Ref<EmoteCue[]>
  /** 当前点开表情面板的目标座位；null 表示面板关闭。 */
  targetSeat: Ref<number | null>
  open: (targetSeat: number) => boolean
  cancel: () => void
  throwEmote: (emote: YaotongEmoteId, relay?: (emote: YaotongEmoteId, targetSeat: number) => boolean) => boolean
  show: (emote: YaotongEmote, fromSeat: number, targetSeat: number) => void
  clear: () => void
  dispose: () => void
}

export interface UseYaotongEmotesOptions {
  cueMs?: number
  gapMs?: number
  fromSeat?: number
  now?: () => number
  /** 播放音效；缺省静音。传入 useAudio().playEffect 即可服从声音开关。 */
  playSound?: (file: string, volume?: number) => unknown
}

const DEFAULT_CUE_MS = 1_800
const DEFAULT_GAP_MS = 350

/**
 * 互动表情状态：先点对手头像 open(seat)，再选道具 throwEmote(id)。
 * 联机以房间广播为准；离桌或换局时由 clear() 取消表现。
 */
export function useYaotongEmotes(options: UseYaotongEmotesOptions = {}): YaotongEmotes {
  const cueMs = options.cueMs ?? DEFAULT_CUE_MS
  const gapMs = options.gapMs ?? DEFAULT_GAP_MS
  const fromSeat = options.fromSeat ?? 0
  const now = options.now ?? (() => Date.now())
  const playSound = options.playSound ?? (() => undefined)
  const cues = ref<EmoteCue[]>([])
  const targetSeat = ref<number | null>(null)
  const timers = new Map<number, ReturnType<typeof setTimeout>>()
  const impactTimers = new Map<number, ReturnType<typeof setTimeout>>()
  let serial = 0
  let lastAt = -Infinity
  let disposed = false

  const remove = (id: number) => {
    const timer = timers.get(id)
    if (timer !== undefined) {
      clearTimeout(timer)
      timers.delete(id)
    }
    if (!cues.value.some(cue => cue.id === id)) return
    cues.value = cues.value.filter(cue => cue.id !== id)
  }

  const open = (seat: number): boolean => {
    if (disposed) return false
    if (!Number.isInteger(seat) || seat < 0 || seat > 3 || seat === fromSeat) return false
    targetSeat.value = seat
    return true
  }

  const cancel = () => { targetSeat.value = null }

  const show = (meta: YaotongEmote, source: number, target: number) => {
    if (disposed) return
    const id = ++serial
    const cue: EmoteCue = { id, emote: meta.id, fromSeat: source, targetSeat: target }
    cues.value = [...cues.value, cue].slice(-6)
    timers.set(id, setTimeout(() => remove(id), cueMs))
    const fullSound = meta.soundOnThrow === true
    try {
      playSound(fullSound ? meta.impactSound : EMOTE_THROW_SOUND, fullSound ? 0.9 : 0.78)
    } catch {
      // 音效缺失不能影响道具表现。
    }
    if (!fullSound) {
      impactTimers.set(id, setTimeout(() => {
        impactTimers.delete(id)
        try {
          playSound(meta.impactSound, 0.9)
        } catch {
          // ignore
        }
      }, 480))
    }
  }

  const throwEmote = (emote: YaotongEmoteId, relay?: (emote: YaotongEmoteId, targetSeat: number) => boolean): boolean => {
    const target = targetSeat.value
    if (disposed || target === null) return false
    const meta = YAOTONG_EMOTES.find(item => item.id === emote)
    if (!meta) return false
    const at = now()
    if (at - lastAt < gapMs || (relay && !relay(emote, target))) return false

    lastAt = at
    cancel()
    if (!relay) show(meta, fromSeat, target)
    return true
  }

  const clear = () => {
    targetSeat.value = null
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
    for (const timer of impactTimers.values()) clearTimeout(timer)
    impactTimers.clear()
    cues.value = []
    lastAt = -Infinity
  }

  const dispose = () => {
    if (disposed) return
    disposed = true
    clear()
  }

  if (getCurrentScope()) onScopeDispose(dispose)

  return { cues, targetSeat, open, cancel, throwEmote, show, clear, dispose }
}
