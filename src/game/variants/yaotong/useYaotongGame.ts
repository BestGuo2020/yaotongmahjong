import { computed, onScopeDispose, ref, shallowRef, triggerRef, watchEffect } from 'vue'
import { chooseAction } from './ai'
import {
  act,
  continueGame,
  createGame,
  kongOptions,
  selfOptions,
  type EngineFlow,
  type FlowStep,
  type StartOptions,
} from './engine'
import { AI_DELAYS } from '../../core/controllers/playerController'
import { PACE_MS } from '../../core/local/localGameConfig'
import { OPENING_PACE_MS } from '../../shared/runtime/localOpening'
import { discardWaits, waits } from './hands'
import type { Command, GameState } from './types'

export function useYaotongGame() {
  const state = shallowRef<GameState | null>(null)
  const paused = ref(false)
  const autoplay = ref(false)
  const pendingTransition = shallowRef<{ state: GameState; step: FlowStep; resume: () => void } | null>(null)
  const flowStep = computed(() => pendingTransition.value?.step ?? null)
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

  const flow: EngineFlow = (step, resume) => {
    // AI peng already has its single 650ms discard delay; do not insert another turn/timer before it.
    if (step === 'after-peng' && (state.value!.current !== 0 || autoplay.value)) {
      resume()
      return
    }
    pendingTransition.value = { state: state.value!, step, resume }
  }
  function dispatch(command: Command, seat = 0) {
    if (!state.value || paused.value) return
    try {
      if (act(state.value, seat, command, flow)) {
        selected.value = -1
        error.value = ''
        triggerRef(state)
      }
    } catch (cause) {
      paused.value = true
      error.value = cause instanceof Error ? cause.message : '对局出现异常'
    }
  }
  function begin(length: 4 | 8 | 16, options: Omit<StartOptions, 'length'> = {}) {
    pendingTransition.value = null
    state.value = createGame({ ...options, length })
    selected.value = -1
    paused.value = false
    autoplay.value = false
    error.value = ''
  }
  function next() {
    pendingTransition.value = null
    if (state.value) state.value = continueGame(state.value)
    selected.value = -1
  }
  function leave() {
    pendingTransition.value = null
    state.value = null
    selected.value = -1
    autoplay.value = false
    paused.value = false
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  watchEffect((cleanup) => {
    const game = state.value
    if (!game || game.phase === 'settled' || paused.value) return
    const transition = pendingTransition.value
    if (transition?.state === game) {
      const stepDelay: Record<FlowStep, number> = {
        'first-draw': OPENING_PACE_MS.firstTurn,
        'next-draw': PACE_MS.afterDiscardToNextTurn,
        'after-peng': game.current === 0 && !autoplay.value ? PACE_MS.skipDrawPengDelay : 0,
        'after-open-kong': PACE_MS.afterClaimGang,
        'before-rob': PACE_MS.beforeRobKong,
        'between-robbers': PACE_MS.betweenRobKongs,
        'after-added-kong': PACE_MS.afterKongSettle,
        'rob-win': PACE_MS.betweenRobKongs,
      }
      timer = setTimeout(() => {
        if (state.value !== game || pendingTransition.value !== transition) return
        pendingTransition.value = null
        try {
          transition.resume()
          triggerRef(state)
        } catch (cause) {
          error.value = cause instanceof Error ? cause.message : '对局推进异常'
          paused.value = true
        }
      }, stepDelay[transition.step])
      cleanup(() => clearTimeout(timer))
      return
    }
    if (game.phase === 'transition') return
    const seats = autoplay.value ? [0, 1, 2, 3] : [1, 2, 3]
    // Resolve the original-report window together. Humans without a legal declaration need no confirmation.
    if (game.phase === 'original') {
      const automaticSeats = !autoplay.value && !waiting.value.length ? [0, ...seats] : seats
      const awaiting = automaticSeats.filter((seat) => !game.originalDecisions[seat])
      if (!awaiting.length) return
      timer = setTimeout(() => {
        for (const seat of awaiting) {
          if (state.value !== game || game.phase !== 'original') break
          const command = chooseAction(game, seat)
          if (command) dispatch(command, seat)
        }
      }, AI_DELAYS.claim)
      cleanup(() => clearTimeout(timer))
      return
    }
    const nextSeat = seats.find((seat) =>
      game.phase === 'response'
        ? game.pending?.options[seat] && !game.pending.choices[seat]
        : game.current === seat,
    )
    if (nextSeat === undefined) return
    timer = setTimeout(
      () => {
        const command = chooseAction(game, nextSeat)
        if (command && state.value === game) dispatch(command, nextSeat)
      },
      game.phase === 'response'
        ? game.pending?.kind === 'rob'
          ? 0
          : AI_DELAYS.claim
        : game.players[nextSeat].afterKong
          ? AI_DELAYS.afterKong
          : game.players[nextSeat].drawn === null
            ? PACE_MS.afterClaimPeng
            : AI_DELAYS.turn,
    )
    cleanup(() => clearTimeout(timer))
  })
  onScopeDispose(() => clearTimeout(timer))
  return {
    state,
    user,
    paused,
    autoplay,
    flowStep,
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
