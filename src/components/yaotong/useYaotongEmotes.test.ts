import { effectScope } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useYaotongEmotes } from './useYaotongEmotes'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function setup(options: Parameters<typeof useYaotongEmotes>[0] = {}) {
  const scope = effectScope()
  let clock = 0
  const emotes = scope.run(() => useYaotongEmotes({
    now: () => clock,
    cueMs: 1_800,
    gapMs: 350,
    ...options,
  }))!
  const advance = (ms: number) => {
    clock += ms
    vi.advanceTimersByTime(ms)
  }
  return { scope, emotes, advance }
}

describe('互动表情状态', () => {
  it('先点头像，再选道具才生成表演', () => {
    const { scope, emotes } = setup()
    try {
      expect(emotes.throwEmote('tomato')).toBe(false)
      expect(emotes.open(0)).toBe(false)
      expect(emotes.open(9)).toBe(false)
      expect(emotes.open(2)).toBe(true)
      expect(emotes.targetSeat.value).toBe(2)
      expect(emotes.throwEmote('tomato')).toBe(true)
      expect(emotes.targetSeat.value).toBeNull()
      expect(emotes.cues.value).toHaveLength(1)
      expect(emotes.cues.value[0]).toMatchObject({ emote: 'tomato', fromSeat: 0, targetSeat: 2 })
    } finally {
      scope.stop()
    }
  })

  it('取消目标后不能投掷', () => {
    const { scope, emotes } = setup()
    try {
      emotes.open(1)
      emotes.cancel()
      expect(emotes.targetSeat.value).toBeNull()
      expect(emotes.throwEmote('egg')).toBe(false)
      expect(emotes.cues.value).toEqual([])
    } finally {
      scope.stop()
    }
  })

  it('表演在 1.8 秒后自动移除，clear 立即清空', () => {
    const { scope, emotes, advance } = setup()
    try {
      emotes.open(1)
      emotes.throwEmote('pan')
      expect(emotes.cues.value).toHaveLength(1)
      advance(1_799)
      expect(emotes.cues.value).toHaveLength(1)
      advance(1)
      expect(emotes.cues.value).toEqual([])

      emotes.open(3)
      emotes.throwEmote('banana')
      expect(emotes.cues.value).toHaveLength(1)
      emotes.clear()
      expect(emotes.cues.value).toEqual([])
      expect(emotes.targetSeat.value).toBeNull()
    } finally {
      scope.stop()
    }
  })

  it('没有整段原声的道具：出手播飞掷声，480ms 后播命中声；clear 取消命中声', () => {
    const playSound = vi.fn()
    const { scope, emotes, advance } = setup({ playSound })
    try {
      emotes.open(1)
      expect(emotes.throwEmote('banana')).toBe(true)
      expect(playSound).toHaveBeenCalledWith('sounds/emote-throw.ogg', 0.78)
      expect(playSound).not.toHaveBeenCalledWith('sounds/emote-banana.ogg', 0.9)
      advance(479)
      expect(playSound).not.toHaveBeenCalledWith('sounds/emote-banana.ogg', 0.9)
      advance(1)
      expect(playSound).toHaveBeenCalledWith('sounds/emote-banana.ogg', 0.9)

      playSound.mockClear()
      emotes.open(2)
      emotes.throwEmote('banana')
      emotes.clear()
      advance(600)
      expect(playSound).not.toHaveBeenCalledWith('sounds/emote-banana.ogg', 0.9)
    } finally {
      scope.stop()
    }
  })

  it('有原版整段音效的道具：出手即播整段，不再补飞掷声', () => {
    const playSound = vi.fn()
    const { scope, emotes, advance } = setup({ playSound })
    try {
      emotes.open(1)
      expect(emotes.throwEmote('tomato')).toBe(true)
      expect(playSound).toHaveBeenCalledWith('sounds/emote-tomato.ogg', 0.9)
      expect(playSound).not.toHaveBeenCalledWith('sounds/emote-throw.ogg', 0.78)
      advance(600)
      expect(playSound.mock.calls.filter(([file]) => file.includes('emote-tomato'))).toHaveLength(1)
    } finally {
      scope.stop()
    }
  })

  it('两次投掷至少间隔 350ms，dispose 后不再接受', () => {
    const { scope, emotes, advance } = setup()
    try {
      emotes.open(1)
      expect(emotes.throwEmote('pan')).toBe(true)
      emotes.open(1)
      expect(emotes.throwEmote('pan')).toBe(false)
      advance(350)
      emotes.open(2)
      expect(emotes.throwEmote('pan')).toBe(true)
      emotes.dispose()
      expect(emotes.open(1)).toBe(false)
      expect(emotes.throwEmote('tomato')).toBe(false)
    } finally {
      scope.stop()
    }
  })
})
