import { effectScope, triggerRef } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from './engine'
import { player, table } from './auditFixtures'
import { chickenMarks, chickenPerformance, CHICKEN_PERFORMANCE_MS } from './chickenPresentation'
import { responsibilityPayments } from './presentation'
import { settle } from './settlement'
import { useYaotongPort } from './useYaotongPort'

function peng(tile: number, later = false, seat = 0) {
  const state = table(),
    source = (seat + 3) % 4
  state.current = source
  state.firstFixedPeng = later
  state.players[source] = player('234567m 234567s 2p')
  state.players[source].hand.push(tile)
  state.players[seat] = player('234m 456p 56789s')
  state.players[seat].hand.unshift(tile, tile)
  expect(act(state, source, { type: 'discard', index: 13 })).toBe(true)
  expect(act(state, seat, { type: 'respond', action: 'peng' })).toBe(true)
  return state
}

describe('固定鸡碰牌有独立碰鸡动画，不产生责任关系', () => {
  it.each([0, 16, 18].flatMap((tile) => [false, true].map((later) => ({ tile, later }))))(
    '$tile首碰/后碰=$later保留8/6鸡分，动画与落点归碰牌者',
    ({ tile, later }) => {
      const state = peng(tile, later, later ? 2 : 0)
      const event = state.events.find((e) => e.kind === 'peng')!
      const before = structuredClone(state)
      expect(chickenPerformance(event, state)).toMatchObject({
        kind: 'peng',
        actorSeat: event.seat,
        markSeat: event.seat,
        tile,
        label: '碰鸡',
        points: later ? 6 : 8,
      })
      expect(state.players[event.seat].melds[0]).toMatchObject({ chicken: later ? 6 : 8, responsibility: 0 })
      for (let seat = 0; seat < 4; seat++) expect(chickenMarks(state, seat).responsibilityCount).toBe(0)
      expect(state).toEqual(before)
      expect(responsibilityPayments(settle(state, { kind: 'win' }).transfers)).toEqual([])
    },
  )
  it('普通牌、杠、补杠意图及包牌终局不触发碰鸡动画', () => {
    const ordinary = peng(5)
    expect(chickenPerformance(ordinary.events.find((e) => e.kind === 'peng')!, ordinary)).toBeNull()
    const state = peng(18),
      event = state.events.find((e) => e.kind === 'peng')!
    for (const text of ['明杠', '补杠', '存杠', '转弯杠'])
      expect(chickenPerformance({ ...event, kind: 'kong', text }, state)).toBeNull()
    expect(chickenPerformance({ ...event, kind: 'kong-intent' }, state)).toBeNull()
    state.result = settle(state, { kind: 'penalty', offender: 0 })
    expect(chickenPerformance(event, state)).toBeNull()
  })
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('window', globalThis)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('碰鸡沿用碰牌音效和动作时序', () => {
  it.each([0, 16, 18])('%s碰牌音结束才表演，不播责任鸡语音，不留责标记', async (tile) => {
    let finish!: () => void
    const voice = new Promise<void>((resolve) => {
      finish = resolve
    })
    const playSound = vi.fn(),
      playSoundAndWait = vi.fn((name: string) => (name === 'peng.mp3' ? voice : Promise.resolve()))
    const scope = effectScope()
    try {
      const port = scope.run(() => useYaotongPort({ playSound, playSoundAndWait }))!
      port.local.paused.value = true
      port.local.state.value = peng(tile)
      await vi.advanceTimersByTimeAsync(500)
      expect(port.tableView.value.chickenPerformances).toEqual([])
      finish()
      await vi.advanceTimersByTimeAsync(0)
      expect(port.tableView.value.chickenPerformances).toMatchObject([
        { kind: 'peng', actorSeat: 0, markSeat: 0, tile },
      ])
      triggerRef(port.local.state)
      expect(playSoundAndWait.mock.calls.filter(([name]) => name === 'peng.mp3')).toHaveLength(1)
      expect(
        playSound.mock.calls.some(([name]) => name === 'zerenji.wav' || name === 'chongfengji.wav'),
      ).toBe(false)
      await vi.advanceTimersByTimeAsync(CHICKEN_PERFORMANCE_MS)
      expect(port.tableView.value.chickenPerformances).toEqual([])
      expect(port.tableView.value.seats.every((s) => s.responsibilityCount === 0)).toBe(true)
    } finally {
      scope.stop()
    }
  })
  it.each(['leave', 'settle', 'dispose'] as const)('%s取消尚未播放的碰鸡', async (action) => {
    let finish!: () => void
    const voice = new Promise<void>((resolve) => {
      finish = resolve
    })
    const scope = effectScope()
    const port = scope.run(() =>
      useYaotongPort({ playSoundAndWait: (name) => (name === 'peng.mp3' ? voice : Promise.resolve()) }),
    )!
    port.local.paused.value = true
    port.local.state.value = peng(18)
    if (action === 'leave') port.returnToLobby()
    else if (action === 'dispose') scope.stop()
    else {
      port.local.state.value!.result = settle(port.local.state.value!, { kind: 'draw' })
      triggerRef(port.local.state)
    }
    finish()
    await vi.advanceTimersByTimeAsync(0)
    expect(port.tableView.value.chickenPerformances).toEqual([])
    scope.stop()
  })
})
