import { effectScope, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createGame } from '../engine'
import { useYaotongGame } from '../useYaotongGame'

const external = {
  send: vi.fn(),
  nextRound: vi.fn(),
  leave: vi.fn(),
  openingDone: vi.fn(),
  auto: vi.fn(),
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

    game.leave()
    expect(external.leave).toHaveBeenCalledTimes(1)
    expect(game.state.value).toBeNull()
    scope.stop()
  })
})
