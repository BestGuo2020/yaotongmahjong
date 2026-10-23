import { effectScope, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createGame } from '../engine'
import type { GameEvent } from '../types'
import { useYaotongGame } from '../useYaotongGame'
import { useYaotongPort } from '../useYaotongPort'

const external = {
  send: vi.fn(),
  nextRound: vi.fn(),
  leave: vi.fn(),
  openingDone: vi.fn(),
  auto: vi.fn(),
  hold: vi.fn(),
}

afterEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('useYaotongGame remote authority', () => {
  it('同局快照不会延长等的截止时间，到期发送解除等待', async () => {
    vi.useFakeTimers()
    const scope = effectScope()
    try {
      const game = scope.run(() => useYaotongGame({ externalAuthority: external }))!
      game.mode.value = 'hard'
      const state = createGame({ length: 4 })
      game.acceptRemoteState(state)
      game.startHold()
      await vi.advanceTimersByTimeAsync(6000)
      const updated = structuredClone(state)
      updated.waitRemainingMs[0] = 9000
      game.acceptRemoteState(updated)
      await vi.advanceTimersByTimeAsync(8999)
      expect(game.holding.value).toBe(true)
      await vi.advanceTimersByTimeAsync(1)
      expect(game.holding.value).toBe(false)
      expect(game.waitRemainingMs.value).toBe(0)
      expect(external.hold).toHaveBeenLastCalledWith(false)
    } finally { scope.stop() }
  })

  it('换局快照清掉上一局的等，不占用新局的15秒', async () => {
    vi.useFakeTimers()
    const scope = effectScope()
    try {
      const game = scope.run(() => useYaotongGame({ externalAuthority: external }))!
      game.mode.value = 'hard'
      const state = createGame({ length: 4 })
      game.acceptRemoteState(state)
      game.startHold()
      await vi.advanceTimersByTimeAsync(4000)
      const next = createGame({ length: 4 })
      next.handNumber = state.handNumber + 1
      game.acceptRemoteState(next)
      expect(game.holding.value).toBe(false)
      expect(game.waitRemainingMs.value).toBe(15000)
    } finally { scope.stop() }
  })

  it('does not run the local engine; it sends commands and accepts snapshots', async () => {
    const scope = effectScope()
    const game = scope.run(() => useYaotongGame({
      externalAuthority: external,
    }))!
    expect(game.remote).toBe(true)
    expect(game.state.value).toBeNull()

    // 未收到快照前不发送动作。
    expect(game.dispatch({ type: 'discard', index: 0 })).toBe(false)
    expect(external.send).not.toHaveBeenCalled()

    const state = createGame({ length: 4 })
    game.acceptRemoteState(state)
    expect(game.state.value).toBe(state)
    expect(game.dispatch({ type: 'discard', index: 0 })).toBe(true)
    expect(external.send).toHaveBeenCalledWith({ type: 'discard', index: 0 })

    game.begin(4)
    expect(game.state.value).toBe(state)

    game.next()
    expect(external.nextRound).toHaveBeenCalledTimes(1)

    game.autoplay.value = true
    await nextTick()
    expect(external.auto).toHaveBeenCalledWith(true)
    game.autoplay.value = false
    await nextTick()

    game.mode.value = 'hard'
    game.startHold()
    expect(external.hold).toHaveBeenCalledWith(true)
    game.acceptRemoteState(createGame({ length: 4 }))
    expect(game.holding.value).toBe(true)
    const sentBefore = external.send.mock.calls.length
    expect(game.dispatch({ type: 'discard', index: 0 })).toBe(false)
    expect(external.send).toHaveBeenCalledTimes(sentBefore)
    game.leave()
    expect(external.hold).toHaveBeenLastCalledWith(false)
    expect(external.leave).toHaveBeenCalledTimes(1)
    expect(game.state.value).toBeNull()
    scope.stop()
  })

  it('remote start does not leave the presentation hand in dealing state', async () => {
    const scope = effectScope()
    const game = scope.run(() => useYaotongGame({
      externalAuthority: external,
    }))!
    const port = scope.run(() => useYaotongPort({}, game))!
    game.acceptRemoteState(createGame({ length: 4 }))
    await port.startGame('east', { skipOpening: true })
    expect(port.players[0].hand.length).toBeGreaterThan(0)
    expect(port.phase.value).not.toBe('dealing')
    scope.stop()
  })

  it('remote snapshots feed the shared presentation watcher', async () => {
    const scope = effectScope()
    const game = scope.run(() => useYaotongGame({
      externalAuthority: external,
    }))!
    const port = scope.run(() => useYaotongPort({}, game))!
    const state = createGame({ length: 4 })
    state.serial = 1
    state.events = [{
      id: 1, seat: 1, kind: 'discard', text: '打出五万', tile: 4,
    } as GameEvent]
    game.acceptRemoteState(state)
    await nextTick()
    expect(port.lastDiscard.value).toMatchObject({ tile: 'm5', from: 1 })
    scope.stop()
  })
})
