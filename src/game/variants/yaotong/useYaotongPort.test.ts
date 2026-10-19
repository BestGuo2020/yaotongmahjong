import { effectScope, isRef, nextTick, triggerRef } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GAME_PORT_ACTION_KEYS, GAME_PORT_STATE_KEYS } from '../../core/contracts/gamePort'
import { wallStackSlot, wallTilePlacement } from '../../core/rules/wallLayout'
import { tileMarkerFor } from '../../../components/table/three/tileMarker'
import { createGame } from './engine'
import { fromSharedTile, toSharedTile, useYaotongPort } from './useYaotongPort'
import { meld, player, table } from './auditFixtures'
import * as audioPresentation from '../../core/presentation/useAudio'

beforeEach(() => vi.stubGlobal('window', globalThis))
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('幺筒复用原版GamePort与3D表现', () => {
  it('减少动态效果仍提供准确礼金，沿用360ms亮牌窗口并及时清除', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const scope = effectScope()
    try {
      const port = scope.run(() => useYaotongPort())!
      const state = table()
      state.players[0] = player('234567m 66p 789s', { drawn: 26, melds: [meld(9, { kind: 'turn', chicken: 60 })] })
      port.local.state.value = state
      port.userHu()
      await vi.advanceTimersByTimeAsync(870)
      expect(port.tableView.value.settlementCue?.gifts).toEqual([{ seat: 0, amount: 300 }])
      expect(port.announcement.value).toBeNull()
      await vi.advanceTimersByTimeAsync(359)
      expect(port.result.value).toBeNull()
      await vi.advanceTimersByTimeAsync(1)
      expect(port.result.value).not.toBeNull()
      expect(port.tableView.value.settlementCue).toBeNull()
    } finally { scope.stop() }
  })
  it.each([false, true])('见面礼在原版亮牌阶段飞分，双倍=%s，积分不提前入账、不延后结算', async (double) => {
    vi.useFakeTimers()
    const scope = effectScope()
    try {
      const port = scope.run(() => useYaotongPort())!
      const state = table()
      if (double) state.dice = [4, 4]
      state.players[0] = player('234567m 66p 789s', { drawn: 26,
        melds: [meld(9, { kind: 'turn', chicken: 60 })] })
      port.local.state.value = state
      port.userHu()
      await vi.advanceTimersByTimeAsync(4599)
      expect(port.tableView.value.settlementCue).toBeNull()
      expect(port.tableView.value.seats[0].gift).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      expect(port.tableView.value.settlementCue?.gifts).toEqual([{ seat: 0, amount: double ? 600 : 300 }])
      expect(port.tableView.value.settlementCue?.payments.map((t) => [t.from, t.to, t.amount])).toEqual(
        [1, 2, 3].map((from) => [from, 0, double ? 200 : 100]),
      )
      expect(port.players.every((p) => p.score === 0)).toBe(true)
      expect(port.tableView.value.seats[0].giftAmount).toBe(double ? 600 : 300)
      await vi.advanceTimersByTimeAsync(1499)
      expect(port.result.value).toBeNull()
      await vi.advanceTimersByTimeAsync(1)
      expect(port.tableView.value.settlementCue).toBeNull()
      expect(port.result.value).not.toBeNull()
      expect(port.players[0].score).toBe(state.result!.deltas[0])
    } finally { scope.stop() }
  })
  it('热炮烧鸡绑定放炮人，亮牌前不出现；离桌清除特效与旧回调', async () => {
    vi.useFakeTimers()
    const scope = effectScope()
    try {
      const port = scope.run(() => useYaotongPort())!
      const state = table()
      state.current = 1
      state.players[1] = player('147m 258p 369s 2468s 6p', { afterKong: true, drawn: 14 })
      state.players[0] = player('234m 456789s 6p 45p 1p')
      port.local.state.value = state
      port.local.dispatch({ type: 'discard', index: 13 }, 1)
      port.userHu()
      await vi.advanceTimersByTimeAsync(5179)
      expect(port.tableView.value.settlementCue).toBeNull()
      await vi.advanceTimersByTimeAsync(1)
      expect(port.tableView.value.settlementCue).toMatchObject({ burned: [1], payments: [], gifts: [] })
      expect(port.tableView.value.seats[1].burned).toBe(true)
      expect(port.tableView.value.seats[0].burned).toBe(false)
      port.returnToLobby()
      await vi.runAllTimersAsync()
      expect(port.tableView.value.settlementCue).toBeNull()
      expect(port.result.value).toBeNull()
    } finally { scope.stop() }
  })
  it('放炮包见面礼只从放炮者飞出300，另外两家不重复支付', async () => {
    vi.useFakeTimers()
    const scope = effectScope()
    try {
      const port = scope.run(() => useYaotongPort())!
      const state = table()
      state.current = 1
      state.players[1] = player('147m 258p 369s 2468s 1p', { drawn: 9 })
      state.players[0] = player('234m 567s 22p 45s', { declaration: 'ready',
        melds: [meld(9, { from: 2, chicken: 45, responsibility: 20 })] })
      port.local.state.value = state
      port.local.dispatch({ type: 'discard', index: 13 }, 1)
      port.userHu()
      await vi.advanceTimersByTimeAsync(5180)
      expect(port.tableView.value.settlementCue?.payments.map((t) => [t.from, t.to, t.amount])).toEqual([[1, 0, 300]])
    } finally { scope.stop() }
  })
  it.each([0, 1, 2, 3].flatMap((seat) => (['ready', 'original'] as const).map((declaration) => ({ seat, declaration }))))(
    '$seat号位$declaration后切听牌BGM，后续声明不重播，新局与离桌恢复默认', async ({ seat, declaration }) => {
      vi.useFakeTimers()
      const fadeTo = vi.fn()
      vi.spyOn(audioPresentation, 'activeBgmTrackPort').mockReturnValue({ fadeTo })
      const scope = effectScope()
      try {
        const port = scope.run(() => useYaotongPort())!
        const state = createGame({ dealer: 0, dice: [2, 3] })
        state.players[seat] = player('234567m 234s 66p 78s', { draws: 0 })
        port.local.state.value = state
        await nextTick()
        expect(fadeTo).not.toHaveBeenCalled() // 普通听牌尚未主动报听。
        if (declaration === 'original') port.local.dispatch({ type: 'original', declare: true }, seat)
        else {
          state.phase = 'discard'; state.current = seat
          state.players[seat].hand.push(8)
          state.players[seat].drawn = 8
          state.players[seat].draws = 1
          port.local.dispatch({ type: 'discard', index: 13, declare: true }, seat)
        }
        await nextTick()
        expect(state.players[seat].declaration).toBe(declaration)
        expect(port.tableView.value.declarationCues).toEqual([
          expect.objectContaining({ actorIndex: seat, type: declaration === 'original' ? 'original-ready' : 'ready' }),
        ])
        expect(port.tableActionEvent.value).toBeNull() // 声明不伪造碰牌事件或移动牌张。
        expect(fadeTo).toHaveBeenCalledExactlyOnceWith('bgm/ting_bgm.wav')
        state.players[(seat + 1) % 4].declaration = 'ready'
        triggerRef(port.local.state)
        await nextTick()
        expect(fadeTo).toHaveBeenCalledTimes(1)
        port.local.begin(4)
        await nextTick()
        expect(fadeTo).toHaveBeenLastCalledWith('bgm/bgm.wav')
        port.local.state.value!.players[seat].declaration = declaration
        triggerRef(port.local.state)
        await nextTick()
        expect(fadeTo).toHaveBeenLastCalledWith('bgm/ting_bgm.wav')
        port.returnToLobby()
        await nextTick()
        expect(port.tableView.value.declarationCues).toEqual([])
        expect(fadeTo).toHaveBeenLastCalledWith('bgm/bgm.wav')
      } finally { scope.stop() }
    },
  )
  it('多人同时原报，各座位动作字保留两秒后消失，常驻标记继续保留', async () => {
    vi.useFakeTimers()
    const scope = effectScope(), playSound = vi.fn()
    const port = scope.run(() => useYaotongPort({ playSound }))!
    const state = createGame({ dealer: 0, dice: [2, 3] })
    state.players[1] = player('234567m 234s 66p 78s', { draws: 0 })
    state.players[2] = player('234567m 234s 66p 78s', { draws: 0 })
    port.local.state.value = state
    port.local.dispatch({ type: 'original', declare: true }, 1)
    port.local.dispatch({ type: 'original', declare: true }, 2)
    port.local.paused.value = true
    expect(port.tableView.value.seats.map((s) => s.declaration)).toEqual(['none', 'original', 'original', 'none'])
    expect(port.announcement.value).toBeNull()
    expect(playSound.mock.calls.filter(([file]) => file === 'ting.wav')).toHaveLength(1)
    expect(port.tableView.value.declarationCues.map((cue) => [cue.actorIndex, cue.type])).toEqual([
      [1, 'original-ready'], [2, 'original-ready'],
    ])
    await vi.advanceTimersByTimeAsync(1999)
    expect(port.tableView.value.declarationCues).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(port.tableView.value.declarationCues).toHaveLength(0)
    expect(port.tableView.value.seats[1].declaration).toBe('original')
    scope.stop()
  })
  it('立即胡牌时清除声明动作字，避免遮住胡牌演出', () => {
    vi.useFakeTimers()
    const scope = effectScope()
    try {
      const port = scope.run(() => useYaotongPort())!
      const state = createGame({ dealer: 0, dice: [2, 3] })
      state.players[0] = player('234567m 234s 66p 78s', { draws: 0 })
      port.local.state.value = state
      port.local.dispatch({ type: 'original', declare: true })
      expect(port.tableView.value.declarationCues).toHaveLength(1)
      state.players[0].hand.push(26)
      state.players[0].drawn = 26
      state.players[0].draws = 1
      state.phase = 'discard'
      port.local.dispatch({ type: 'hu' })
      expect(port.tableView.value.declarationCues).toEqual([])
      expect(port.tableActionEvent.value?.type).toBe('self-draw')
    } finally { scope.stop() }
  })
  it('幺筒冲分浮标跟随出牌者，报牌完成后衔接短音，到时自动消失', async () => {
    vi.useFakeTimers()
    const scope = effectScope(), playSound = vi.fn()
    let finish!: () => void
    const port = scope.run(() => useYaotongPort({ playSound, playSoundAndWait: () => new Promise<void>((resolve) => { finish = resolve }) }))!
    const state = table()
    state.players[0] = player('147m 258p 369s 2468s 1p')
    port.local.state.value = state
    port.userDiscard(13)
    expect(port.tableView.value.chickenCue).toMatchObject({ seat: 0, label: '预冲', points: 30 })
    expect(port.announcement.value).toBeNull()
    await vi.advanceTimersByTimeAsync(80)
    expect(playSound.mock.calls.some(([file]) => file === 'chongfengji.wav')).toBe(false)
    finish(); await Promise.resolve(); await Promise.resolve()
    expect(playSound.mock.calls.some(([file]) => file === 'chongfengji.wav')).toBe(true)
    await vi.advanceTimersByTimeAsync(970)
    expect(port.tableView.value.chickenCue).toBeNull()
    scope.stop()
  })
  it('无人响应的出牌保留3D飞牌事件，450ms后才摸下一张', async () => {
    vi.useFakeTimers()
    const scope = effectScope()
    const port = scope.run(() => useYaotongPort())!
    const state = createGame({ dealer: 0, dice: [2, 3] })
    state.phase = 'discard'
    state.current = 0
    for (const player of state.players) {
      player.hand = [0, 3, 6, 10, 13, 16, 20, 23, 26, 19, 21, 23, 25]
      player.draws = 2
    }
    state.players[0].hand.push(4)
    state.players[0].drawn = 4
    port.local.state.value = state
    port.userDiscard(13)
    expect(port.lastDiscard.value).toMatchObject({ tile: 'm5', from: 0 })
    expect(state.phase).toBe('transition')
    expect(state.current).toBe(0)
    await vi.advanceTimersByTimeAsync(450)
    expect(state.current).toBe(1)
    expect(state.phase).toBe('discard')
    scope.stop()
  })
  it('提供完整GamePort契约，玩家数组始终读取实时投影', async () => {
    vi.useFakeTimers()
    const scope = effectScope()
    const port = scope.run(() => useYaotongPort())!
    for (const key of GAME_PORT_STATE_KEYS) {
      expect(port).toHaveProperty(key)
      if (key !== 'players') expect(isRef(port[key]), key).toBe(true)
    }
    for (const key of GAME_PORT_ACTION_KEYS) expect(typeof port[key]).toBe('function')
    expect(port.players).toHaveLength(0)
    const opening = port.startGame('east', { dealer: 0, openingDice: [2, 3] })
    port.local.state.value!.players[0].hand = player('234567m 234s 66p 78s').hand
    expect(port.players).toHaveLength(4)
    expect(port.players[0].avatar).toContain('avatars/lotus.svg')
    expect(port.wall.value).toHaveLength(108)
    expect(port.players.map((p) => p.hand.length)).toEqual([0, 0, 0, 0])
    await vi.runAllTimersAsync()
    await opening
    expect(port.wall.value).toHaveLength(56)
    expect(port.wallHeadDrawn.value).toBe(52)
    expect(port.players.map((p) => p.hand.length)).toEqual([13, 13, 13, 13])
    expect(port.phase.value).toBe('checking')
    expect(port.original.value).toBe(true)
    port.returnToLobby()
    expect(port.players).toHaveLength(0)
    scope.stop()
  })
  it('3D未就绪时不开局，取消旧开局不会复活旧计时器', async () => {
    vi.useFakeTimers()
    const scope = effectScope()
    const port = scope.run(() => useYaotongPort())!
    let ready!: () => void
    const loading = port.startGame('east', {
      waitForTableReady: () => new Promise<void>((resolve) => (ready = resolve)),
    })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(port.wall.value).toHaveLength(108)
    expect(port.local.state.value!.players.every((p) => p.draws === 0)).toBe(true)
    port.returnToLobby()
    ready()
    await loading
    expect(port.phase.value).toBe('lobby')
    scope.stop()
  })
  it('胡牌先走原版动作与3D演出，再向原版结算提供分数', async () => {
    vi.useFakeTimers()
    const scope = effectScope()
    const port = scope.run(() => useYaotongPort())!
    const state = createGame({ dealer: 0, dice: [2, 3] })
    state.phase = 'discard'
    state.current = 0
    state.players[0].hand = [
      'm2',
      'm3',
      'm4',
      'm5',
      'm6',
      'm7',
      's2',
      's3',
      's4',
      'p6',
      'p6',
      's7',
      's8',
      's9',
    ].map((t) => fromSharedTile(t as any))
    state.players[0].drawn = 26
    state.players[0].draws = 2
    port.local.state.value = state
    port.userHu()
    expect(port.phase.value).toBe('win-effect')
    expect(port.tableActionEvent.value?.type).toBe('self-draw')
    expect(port.result.value).toBeNull()
    await vi.advanceTimersByTimeAsync(2100)
    expect(port.winEffect.value?.winnerIndex).toBe(0)
    expect(port.winPresentation.value?.sourceIndex).toBe(13)
    await vi.advanceTimersByTimeAsync(2500)
    expect(port.phase.value).toBe('revealing')
    expect(port.result.value).toBeNull()
    expect(port.players.every((p) => p.score === 0)).toBe(true)
    await vi.advanceTimersByTimeAsync(1500)
    expect(port.phase.value).toBe('settled')
    expect(port.result.value?.scoreChanges.reduce((sum, p) => sum + p.delta, 0)).toBe(0)
    expect(port.revealHands.value).toBe(true)
    scope.stop()
  })
  it('原报锁手通过共同入口保护，幺筒以癞标记而不是翻精', () => {
    expect(toSharedTile(9)).toBe('p1')
    expect(fromSharedTile('s9')).toBe(26)
    expect(tileMarkerFor('p1', ['p1'], [], true)).toBe('laizi')
    expect(tileMarkerFor('p1', ['p1'])).toBe('joker')
    expect(tileMarkerFor('white', ['white'])).toBe('laizi')
  })
  it('108张墙只有54墩，14/13/14/13分布且补尾不回绕136槽', () => {
    const positions = Array.from({ length: 108 }, (_, i) => wallTilePlacement(i, 0, 108, 0, 108))
    expect(new Set(positions.map((p) => `${p.stackIndex}/${p.layer}`)).size).toBe(108)
    expect(Math.max(...positions.map((p) => p.stackIndex))).toBe(53)
    expect(wallTilePlacement(0, 108, 1, 107, 108).stackIndex).toBe(0)
    const slots = Array.from({ length: 54 }, (_, i) => wallStackSlot(i, 108))
    expect(slots.filter((s) => s.z === slots[0].z)).toHaveLength(14)
    expect(slots.filter((s) => s.x === slots[14].x)).toHaveLength(13)
    expect(slots.filter((s) => s.z === slots[27].z)).toHaveLength(14)
    expect(slots.filter((s) => s.x === slots[41].x)).toHaveLength(13)
  })
})
