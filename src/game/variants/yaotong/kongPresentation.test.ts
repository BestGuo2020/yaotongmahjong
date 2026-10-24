import { effectScope, triggerRef } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useYaotongPort } from './useYaotongPort'
import { meld, player, table } from './auditFixtures'
import { kongSoundFile, kongWeatherKind } from './kongPresentation'
import { YAOTONG_REACTION_MS, YAOTONG_EXTENDED_REACTION_MS } from './useYaotongGame'
import { PACE_MS } from '../../core/local/localGameConfig'
import type { GameEvent } from './types'

beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('window', globalThis) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('幺筒开杠天气特效', () => {
  it.each([
    ['明杠', 'tornado', 'gang.ogg'],
    ['补杠', 'tornado', 'bugang.ogg'],
    ['转弯杠', 'rain', 'zhuanwangang.ogg'],
    ['存杠', 'rain', 'gang.ogg'],
  ] as const)('%s成功后才播放%s，刷新不重复、离桌清除', async (kind, expected, expectedKongSound) => {
    const scope = effectScope(), sound = vi.fn()
    try {
      const port = scope.run(() => useYaotongPort({ playSound: sound }))!
      const state = table()
      if (kind === '明杠') {
        state.current = 1
        state.players[1].hand.push(4)
        state.players[0] = player('555m 147s 258p 369s 2p')
      } else if (kind === '补杠') {
        state.players[0] = player('5m 147s 258p 369s 2p', { drawn: 4, melds: [meld(4, { from: 1 })] })
      } else state.players[0] = player('5555m 147s 258p 369s 2p', { drawn: kind === '转弯杠' ? 4 : 10 })
      port.local.state.value = state
      if (kind === '明杠') {
        port.local.dispatch({ type: 'discard', index: 13 }, 1)
        port.local.dispatch({ type: 'respond', action: 'kong' }, 0)
        await vi.advanceTimersByTimeAsync(YAOTONG_REACTION_MS)
      } else port.userGang('m5')
      const action = port.tableActionEvent.value
      expect(action?.label).toBe(kind === '补杠' || kind === '转弯杠' ? kind : undefined)
      if (kind === '补杠') {
        expect(action?.type).toBe('added-gang')
        expect(port.tableView.value.kongWeather).toEqual([])
        expect(sound.mock.calls.some(([name]) => name === 'mingang_windy.wav')).toBe(false)
        await vi.advanceTimersByTimeAsync(YAOTONG_EXTENDED_REACTION_MS)
        expect(port.tableActionEvent.value).toBeNull()
      } else {
        expect(port.tableActionEvent.value).toBe(action)
      }
      expect(port.tableView.value.kongWeather).toEqual([expect.objectContaining({ seat: 0, kind: expected })])
      expect(sound.mock.calls.filter(([name]) => name === expectedKongSound)).toHaveLength(1)
      const cue = port.tableView.value.kongWeather![0]
      const weatherSound = expected === 'rain' ? 'angang_rainy.wav' : 'mingang_windy.wav'
      expect(sound.mock.calls.filter(([name]) => name === weatherSound)).toHaveLength(1)
      triggerRef(port.local.state)
      expect(port.tableView.value.kongWeather![0]).toBe(cue)
      expect(sound.mock.calls.filter(([name]) => name === weatherSound)).toHaveLength(1)
      expect(sound.mock.calls.filter(([name]) => name === expectedKongSound)).toHaveLength(1)
      port.local.paused.value = true
      await vi.advanceTimersByTimeAsync(cue.duration)
      expect(port.tableView.value.kongWeather).toEqual([])
      port.returnToLobby()
      await vi.runAllTimersAsync()
      expect(port.tableView.value.kongWeather).toEqual([])
    } finally { scope.stop() }
  })

  it('补杠被抢胡时不出现龙卷风，也不播放成功杠的风声', async () => {
    const scope = effectScope(), sound = vi.fn()
    try {
      const port = scope.run(() => useYaotongPort({ playSound: sound }))!
      const state = table()
      state.players[0] = player('5m 147s 258p 369s 2p', { drawn: 4, melds: [meld(4, { from: 1 })] })
      state.players[1] = player('234567m 234s 66p 34m')
      port.local.state.value = state
      port.userGang('m5')
      expect(port.tableActionEvent.value).toMatchObject({ type: 'added-gang', label: '补杠' })
      await vi.advanceTimersByTimeAsync(YAOTONG_EXTENDED_REACTION_MS)
      expect(state.pending?.kind).toBe('rob')
      port.local.dispatch({ type: 'respond', action: 'hu' }, 1)
      await vi.advanceTimersByTimeAsync(PACE_MS.betweenRobKongs)
      expect(state.result?.winKind).toBe('rob')
      expect(port.tableView.value.kongWeather).toEqual([])
      expect(sound.mock.calls.some(([name]) => name === 'mingang_windy.wav')).toBe(false)
    } finally { scope.stop() }
  })

  it('减少动态效果缩短天气提示；离桌立即移除未结束的特效', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const scope = effectScope()
    try {
      const port = scope.run(() => useYaotongPort())!, state = table()
      state.players[0] = player('5555m 147s 258p 369s 2p', { drawn: 4 })
      port.local.state.value = state
      port.userGang('m5')
      expect(port.tableView.value.kongWeather?.[0]).toMatchObject({ kind: 'rain', reducedMotion: true, duration: 600 })
      port.returnToLobby()
      expect(port.tableView.value.kongWeather).toEqual([])
    } finally { scope.stop() }
  })

  it('碰牌、补杠宣告和未知事件均不触发天气', () => {
    for (const kind of ['peng', 'kong-intent', 'discard'] as const)
      expect(kongWeatherKind({ id: 1, seat: 0, kind, text: '补杠' })).toBeNull()
    expect(kongWeatherKind({ id: 1, seat: 0, kind: 'kong', text: '未知杠' } as GameEvent)).toBeNull()
  })

  it('杠报牌音效按规则区分：转弯杠、补杠独立，明杠和存杠用普通杠', () => {
    const base = { id: 1, seat: 0 as const, tile: 4 }
    expect(kongSoundFile({ ...base, kind: 'kong', text: '转弯杠' })).toBe('zhuanwangang.ogg')
    expect(kongSoundFile({ ...base, kind: 'kong-intent', text: '宣告补杠' })).toBe('bugang.ogg')
    expect(kongSoundFile({ ...base, kind: 'kong', text: '补杠' })).toBe('bugang.ogg')
    expect(kongSoundFile({ ...base, kind: 'kong', text: '明杠' })).toBe('gang.ogg')
    expect(kongSoundFile({ ...base, kind: 'kong', text: '存杠' })).toBe('gang.ogg')
  })
})
