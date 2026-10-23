import { effectScope, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createGame } from '../engine'
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
})

describe('useYaotongGame remote authority', () => {
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
    await port.startGame()
    expect(port.players[0].hand.length).toBeGreaterThan(0)
    expect(port.phase.value).not.toBe('dealing')
    scope.stop()
  })
})
