import { effectScope, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useYaotongQuickChat } from './useYaotongQuickChat'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function setup(options: Parameters<typeof useYaotongQuickChat>[0] = {}) {
  const scope = effectScope()
  let clock = 0
  const speak = vi.fn()
  const chat = scope.run(() => useYaotongQuickChat({
    speak,
    now: () => clock,
    bubbleMs: 1_000,
    repeatMs: 5_000,
    gapMs: 700,
    ...options,
  }))!
  const advance = (ms: number) => {
    clock += ms
    vi.advanceTimersByTime(ms)
  }
  return { scope, chat, speak, advance }
}

describe('快捷语气泡与冷却', () => {
  it('发送后显示本家气泡，并按 2.6 秒默认时长收掉', () => {
    const { scope, chat } = setup({ bubbleMs: 2_600 })
    try {
      expect(chat.send('能不能跟？')).toBe(true)
      expect(chat.bubbles.value[0]).toMatchObject({ text: '能不能跟？' })
      vi.advanceTimersByTime(2_599)
      expect(chat.bubbles.value[0]).toBeDefined()
      vi.advanceTimersByTime(1)
      expect(chat.bubbles.value[0]).toBeUndefined()
    } finally {
      scope.stop()
    }
  })

  it('有本地男声时优先播放 Ogg，不再调用浏览器 TTS', () => {
    const pause = vi.fn()
    const playAudio = vi.fn(() => ({ pause, currentTime: 0 }))
    const { scope, chat, speak } = setup({ playAudio })
    try {
      expect(chat.send('能不能跟？', '能不能跟', 'sounds/chat-follow.ogg')).toBe(true)
      expect(playAudio).toHaveBeenCalledWith('sounds/chat-follow.ogg')
      expect(speak).not.toHaveBeenCalled()
    } finally {
      scope.stop()
    }
  })

  it('Ogg 不可用时回退浏览器男声 TTS', () => {
    const playAudio = vi.fn(() => null)
    const { scope, chat, speak } = setup({ playAudio })
    try {
      expect(chat.send('听没听啊～', '听没听啊', 'sounds/chat-listen.ogg')).toBe(true)
      expect(playAudio).toHaveBeenCalled()
      expect(speak).toHaveBeenCalledWith('听没听啊')
    } finally {
      scope.stop()
    }
  })

  it('新一句会停掉上一句 Ogg，clear 也会停止', () => {
    const pause = vi.fn()
    const playAudio = vi.fn(() => ({ pause, currentTime: 0 }))
    const { scope, chat, advance } = setup({ playAudio })
    try {
      chat.send('能不能跟？', '能不能跟', 'sounds/chat-follow.ogg')
      advance(700)
      chat.send('听没听啊～', '听没听啊', 'sounds/chat-listen.ogg')
      expect(pause).toHaveBeenCalledTimes(1)
      chat.clear()
      expect(pause).toHaveBeenCalledTimes(2)
    } finally {
      scope.stop()
    }
  })

  it('同一句 5 秒内不能重复刷，换一句仍受 700ms 间隔限制', () => {
    const { scope, chat, advance } = setup()
    try {
      expect(chat.send('能不能跟？')).toBe(true)
      expect(chat.send('能不能跟？')).toBe(false)
      expect(chat.send('听没听啊～')).toBe(false)
      advance(700)
      expect(chat.send('听没听啊～')).toBe(true)
    } finally {
      scope.stop()
    }
  })

  it('气泡文案与朗读文案可以分开，+ 不会被念成加号', () => {
    const { scope, chat, speak } = setup()
    try {
      expect(chat.send('这把赔不起，流局+1', '这把赔不起，流局加一')).toBe(true)
      expect(chat.bubbles.value[0]?.text).toBe('这把赔不起，流局+1')
      expect(speak).toHaveBeenCalledWith('这把赔不起，流局加一')
    } finally {
      scope.stop()
    }
  })

  it('静音时只出气泡不朗读，恢复后可以朗读', () => {
    const enabled = ref(false)
    const { scope, chat, speak, advance } = setup({ enabled: () => enabled.value })
    try {
      expect(chat.send('大家好，很高兴见到各位')).toBe(true)
      expect(chat.bubbles.value[0]).toBeDefined()
      expect(speak).not.toHaveBeenCalled()
      enabled.value = true
      advance(700)
      expect(chat.send('让我再想想')).toBe(true)
      expect(speak).toHaveBeenCalledWith('让我再想想')
    } finally {
      scope.stop()
    }
  })

  it('clear 会移除气泡和计时器，并清掉上一局的同句冷却', () => {
    const { scope, chat } = setup()
    chat.send('能不能跟？')
    expect(chat.bubbles.value[0]).toBeDefined()
    chat.clear()
    expect(chat.bubbles.value).toEqual({})
    expect(chat.send('能不能跟？')).toBe(true)
    scope.stop()
  })

  it('dispose 后清空气泡且不再接受发送', () => {
    const { scope, chat } = setup()
    chat.send('来啊，互相伤害啊')
    expect(chat.bubbles.value[0]).toBeDefined()
    chat.dispose()
    expect(chat.bubbles.value).toEqual({})
    expect(chat.send('快点吧，我等的花都谢了')).toBe(false)
    scope.stop()
  })
})
