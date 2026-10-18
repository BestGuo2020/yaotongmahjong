import { computed, onScopeDispose, ref, shallowRef, triggerRef, watchEffect } from 'vue'
import { chooseAction } from './ai'
import { act, continueGame, createGame, kongOptions, selfOptions } from './engine'
import { discardWaits, waits } from './hands'
import type { Command, GameState } from './types'

export function useYaotongGame() {
  const state = shallowRef<GameState | null>(null)
  const paused = ref(false)
  const autoplay = ref(false)
  const fast = ref(false)
  const selected = ref(-1)
  const error = ref('')
  const user = computed(() => state.value?.players[0])
  const ownTurn = computed(() => state.value?.phase === 'discard' && state.value.current === 0)
  const response = computed(() =>
    state.value?.phase === 'response' && !state.value.pending?.choices[0]
      ? state.value.pending?.options[0]
      : undefined,
  )
  const self = computed(() => (state.value ? selfOptions(state.value, 0) : null))
  const kongs = computed(() => (state.value ? kongOptions(state.value, 0) : []))
  const waiting = computed(() => (user.value ? waits(user.value) : []))
  const discardOptions = computed(() =>
    ownTurn.value && user.value?.declaration === 'none' ? discardWaits(user.value) : [],
  )
  const selectedWaits = computed(
    () => discardOptions.value.find((o) => o.index === selected.value)?.waits ?? [],
  )
  const canDeclare = computed(
    () =>
      ownTurn.value &&
      user.value?.draws === 1 &&
      user.value?.drawn !== null &&
      user.value?.declaration === 'none' &&
      selectedWaits.value.length > 0,
  )

  function dispatch(command: Command, seat = 0) {
    if (!state.value || paused.value) return
    try {
      if (act(state.value, seat, command)) {
        selected.value = -1
        error.value = ''
        triggerRef(state)
      }
    } catch (cause) {
      paused.value = true
      error.value = cause instanceof Error ? cause.message : '对局出现异常'
    }
  }
  function begin(length: 4 | 8 | 16) {
    state.value = createGame({ length })
    selected.value = -1
    paused.value = false
    autoplay.value = false
    error.value = ''
  }
  function next() {
    if (state.value) state.value = continueGame(state.value)
    selected.value = -1
  }
  function leave() {
    state.value = null
    selected.value = -1
    autoplay.value = false
    paused.value = false
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  watchEffect((cleanup) => {
    const game = state.value
    if (!game || game.phase === 'settled' || paused.value) return
    const seats = autoplay.value ? [0, 1, 2, 3] : [1, 2, 3]
    const nextSeat = seats.find((seat) =>
      game.phase === 'original'
        ? !game.originalDecisions[seat]
        : game.phase === 'response'
          ? game.pending?.options[seat] && !game.pending.choices[seat]
          : game.current === seat,
    )
    if (nextSeat === undefined) return
    timer = setTimeout(
      () => {
        const command = chooseAction(game, nextSeat)
        if (command && state.value === game) dispatch(command, nextSeat)
      },
      game.phase === 'original' ? 180 : fast.value ? 180 : 850,
    )
    cleanup(() => clearTimeout(timer))
  })
  onScopeDispose(() => clearTimeout(timer))
  return {
    state,
    user,
    paused,
    autoplay,
    fast,
    selected,
    error,
    ownTurn,
    response,
    self,
    kongs,
    waiting,
    discardOptions,
    selectedWaits,
    canDeclare,
    dispatch,
    begin,
    next,
    leave,
  }
}
