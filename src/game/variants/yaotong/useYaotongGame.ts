import { computed, onScopeDispose, ref, shallowRef, triggerRef, watch, watchEffect } from 'vue'
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
import { discardWaits, waits, isUntouchedFirstDraw } from './hands'
import type { Command, GameState } from './types'
import { actionProtection, NO_PROTECTION, protectionReason, type YaotongMode } from './mode'
import { YAO } from './tiles'

export const YAOTONG_AI_DISCARD_MS = 1000
/** 杠后补摸的出牌间隔：开杠的天气/播报约 2.2s，沿用 1000ms 会让「杠 → 打一张」连成一拍，
 *  牌被特效盖住、应牌窗口也被吃掉；这里拉到 2000ms，让杠结束再落牌。 */
export const YAOTONG_AI_KONG_DISCARD_MS = 2000
export const YAOTONG_REACTION_MS = 1000
export const YAOTONG_EXTENDED_REACTION_MS = 2000
export const YAOTONG_WAIT_BUDGET_MS = 15000

export interface YaotongExternalAuthority {
  send(command: Command): void
  nextRound(): void
  leave(): void
  openingDone(round: number): void
  auto(enabled: boolean): void
  /** 老手“等”开始/结束；服务端按实际等待时长扣每小局 15 秒额度。 */
  hold(holding: boolean): void
}

export function useYaotongGame(options: {
  externalAuthority?: YaotongExternalAuthority
} = {}) {
  const external = options.externalAuthority
  const remote = Boolean(external)
  const state = shallowRef<GameState | null>(null)
  const paused = ref(false)
  const autoplay = ref(false)
  const mode = ref<YaotongMode>('easy')
  const protection = computed(() => mode.value === 'easy' && state.value
    ? actionProtection(state.value) : NO_PROTECTION)
  const protectionNotice = ref('')
  const pendingTransition = shallowRef<{ state: GameState; step: FlowStep; resume: () => void; readyAt: number } | null>(null)
  const flowStep = computed(() => pendingTransition.value?.step ?? null)
  const selected = ref(-1)
  const error = ref('')
  const hold = shallowRef<{ game: GameState; seat: number; startedAt: number; initial: number } | null>(null)
  const holdNow = ref(Date.now())
  const holding = computed(() => hold.value?.seat === 0)
  const hardControls = computed(() => Boolean(state.value &&
    state.value.phase !== 'settled' &&
    mode.value === 'hard' && !paused.value && !autoplay.value))
  const waitRemainingMs = computed(() => hold.value?.seat === 0
    ? Math.max(0, hold.value.initial - (holdNow.value - hold.value.startedAt))
    : state.value?.waitRemainingMs?.[0] ?? YAOTONG_WAIT_BUDGET_MS)
  const reactionClocks = new WeakMap<GameState, { id: number; until: number }>()
  function reactionDeadline(game: GameState) {
    const event = [...game.events].reverse().find(e => e.kind === 'discard' || e.kind === 'kong-intent')
    if (!event) return 0
    const cached = reactionClocks.get(game)
    if (cached?.id === event.id) return cached.until
    const extended = event.kind === 'kong-intent' || event.tile === YAO || event.afterKong
    const until = Date.now() + (extended ? YAOTONG_EXTENDED_REACTION_MS : YAOTONG_REACTION_MS)
    reactionClocks.set(game, { id: event.id, until })
    return until
  }
  function endHold(sendRelease = false) {
    const entry = hold.value
    if (!entry) return
    entry.game.waitRemainingMs[entry.seat] = Math.max(0, entry.initial - (Date.now() - entry.startedAt))
    hold.value = null
    if (state.value === entry.game) triggerRef(state)
    if (remote && sendRelease) external!.hold(false)
  }
  function startHold(seat = 0) {
    const game = state.value
    if (!game || !hardControls.value || hold.value || !Number.isInteger(seat) || seat < 0 || seat > 3) return
    const budget = game.waitRemainingMs[seat]
    if (budget <= 0) return
    holdNow.value = Date.now()
    hold.value = { game, seat, startedAt: holdNow.value, initial: budget }
    if (remote) external!.hold(true)
  }
  const user = computed(() => state.value?.players[0])
  const ownTurn = computed(() => state.value?.phase === 'discard' && state.value.current === 0)
  const response = computed(() =>
    state.value?.phase === 'response' && !state.value.pending?.choices[0]
      ? state.value.pending?.options[0]
      : undefined,
  )
  const self = computed(() => (state.value ? selfOptions(state.value, 0) : null))
  const kongs = computed(() => (state.value ? kongOptions(state.value, 0) : []))
  const autoDiscard = computed(() =>
    ownTurn.value && user.value?.declaration !== 'none' && user.value?.drawn != null &&
    (!self.value?.hu || self.value.restrictedHu) &&
    !protection.value.discards.includes(user.value.hand.length - 1),
  )
  const waiting = computed(() => (user.value ? waits(user.value) : []))
  const discardOptions = computed(() =>
    ownTurn.value && user.value?.declaration === 'none'
      ? discardWaits(user.value).filter((option) => !protection.value.discards.includes(option.index)) : [],
  )
  const selectedWaits = computed(
    () => discardOptions.value.find((o) => o.index === selected.value)?.waits ?? [],
  )
  const canDeclare = computed(
    () =>
      ownTurn.value &&
      Boolean(user.value && isUntouchedFirstDraw(user.value)) &&
      user.value?.declaration === 'none' &&
      selectedWaits.value.length > 0,
  )

  const flow: EngineFlow = (step, resume) => {
    // AI peng uses the same one-second decision buffer as a normal discard.
    if (step === 'after-peng' && (state.value!.current !== 0 || autoplay.value)) {
      resume()
      return
    }
    const game = state.value!
    const reactionLeft = Math.max(0, reactionDeadline(game) - Date.now())
    const delays: Record<FlowStep, number> = {
      'first-draw': OPENING_PACE_MS.firstTurn,
      'next-draw': Math.max(reactionLeft, PACE_MS.afterDiscardToNextTurn),
      'before-claim': reactionLeft,
      'after-peng': PACE_MS.skipDrawPengDelay,
      'after-open-kong': PACE_MS.afterClaimGang,
      'before-rob': Math.max(reactionLeft, YAOTONG_EXTENDED_REACTION_MS),
      'between-robbers': PACE_MS.betweenRobKongs,
      'after-added-kong': PACE_MS.afterKongSettle,
      'rob-win': PACE_MS.betweenRobKongs,
    }
    if (step === 'before-claim' && delays[step] === 0) { resume(); return }
    pendingTransition.value = { state: game, step, resume, readyAt: Date.now() + delays[step] }
  }
  function dispatch(command: Command, seat = 0) {
    if (!state.value || paused.value) return false
    if (remote) {
      // 服务端权威：只发意图，本地不推进引擎。
      external!.send(command)
      selected.value = -1
      protectionNotice.value = ''
      error.value = ''
      return true
    }
    if (mode.value !== 'hard' && (command.type === 'declareHu' || command.type === 'passHu')) return false
    if (hold.value && (hold.value.seat !== seat || (command.type !== 'declareHu' && command.type !== 'passHu'))) return false
    try {
      const reason = seat === 0 ? protectionReason(protection.value, command) : ''
      if (reason) {
        protectionNotice.value = reason
        return false
      }
      if (act(state.value, seat, command, flow)) {
        reactionDeadline(state.value)
        protectionNotice.value = ''
        selected.value = -1
        error.value = ''
        triggerRef(state)
        return true
      }
    } catch (cause) {
      paused.value = true
      error.value = cause instanceof Error ? cause.message : '对局出现异常'
    }
    return false
  }
  function holdDecision(command: 'declareHu' | 'passHu', plan?: string) {
    if (mode.value !== 'hard') return
    const seat = hold.value?.seat ?? 0
    endHold()
    const previous = pendingTransition.value
    const accepted = dispatch(command === 'declareHu' ? { type: 'declareHu', plan } : { type: 'passHu' }, seat)
    if (accepted && pendingTransition.value === previous && state.value?.phase !== 'transition') pendingTransition.value = null
  }
  function begin(length: 4 | 8 | 16, options: Omit<StartOptions, 'length'> = {}) {
    if (remote) return
    endHold()
    pendingTransition.value = null
    state.value = createGame({ ...options, length })
    selected.value = -1
    paused.value = false
    autoplay.value = false
    error.value = ''
    protectionNotice.value = ''
  }
  function next() {
    if (remote) {
      endHold(true)
      external!.nextRound()
      return
    }
    endHold()
    protectionNotice.value = ''
    pendingTransition.value = null
    if (state.value) state.value = continueGame(state.value)
    selected.value = -1
  }
  function leave() {
    if (remote) {
      endHold(true)
      external!.leave()
      state.value = null
      selected.value = -1
      autoplay.value = false
      paused.value = false
      return
    }
    endHold()
    protectionNotice.value = ''
    pendingTransition.value = null
    state.value = null
    selected.value = -1
    autoplay.value = false
    paused.value = false
  }

  /** 联机快照落地：远端模式唯一的 state 写入口。 */
  function acceptRemoteState(next: GameState) {
    // 服务端额度耗尽/本局结束会释放等；本地别让倒计时继续跑。
    if (hold.value) {
      if (next.phase === 'settled'
          || (next.waitRemainingMs?.[0] ?? YAOTONG_WAIT_BUDGET_MS) <= 0) {
        hold.value = null
      } else {
        // 联机快照会换 GameState 对象；保持等状态跨快照，否则 watchdog 会把等误判为结束。
        hold.value = { ...hold.value, game: next }
      }
    }
    state.value = next
    selected.value = -1
    paused.value = false
    pendingTransition.value = null
    error.value = ''
    protectionNotice.value = ''
    triggerRef(state)
  }

  watch(autoplay, (enabled) => {
    if (remote) external!.auto(enabled)
  })

  let timer: ReturnType<typeof setTimeout> | undefined
  watchEffect(cleanup => {
    const entry = hold.value
    if (!entry) return
    const tick = () => { holdNow.value = Date.now() }
    tick()
    const interval = setInterval(tick, 50)
    const expiry = setTimeout(() => { if (hold.value === entry) endHold() }, entry.initial)
    cleanup(() => { clearInterval(interval); clearTimeout(expiry) })
  })
  watchEffect(() => {
    if (hold.value && (state.value !== hold.value.game || paused.value || autoplay.value || mode.value !== 'hard' || state.value?.phase === 'settled')) endHold(true)
  })
  watchEffect((cleanup) => {
    if (remote) return
    const game = state.value
    if (!game || game.phase === 'settled' || paused.value || hold.value) return
    const transition = pendingTransition.value
    if (transition?.state === game) {
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
      }, Math.max(0, transition.readyAt - Date.now()))
      cleanup(() => clearTimeout(timer))
      return
    }
    if (game.phase === 'transition') return
    if (!autoplay.value && autoDiscard.value) {
      timer = setTimeout(() => {
        if (state.value === game && !paused.value && !autoplay.value && autoDiscard.value)
          dispatch({ type: 'discard', index: game.players[0].hand.length - 1 })
      }, AI_DELAYS.turn)
      cleanup(() => clearTimeout(timer))
      return
    }
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
    // Expert players own their peng/kong decisions: keep those buttons until they choose.
    // Only a hu-only window may move on by itself (the discard's hu opportunity is retained).
    const humanClaim = game.phase === 'response' ? game.pending?.options[0] : undefined
    const autoDeferHu = mode.value === 'hard' && !autoplay.value &&
      Boolean(humanClaim?.hu) && !humanClaim?.peng && !humanClaim?.kong
    const responseSeats = autoDeferHu ? [...seats, 0] : seats
    const nextSeat = (game.phase === 'response' ? responseSeats : seats).find((seat) =>
      game.phase === 'response'
        ? game.pending?.options[seat] && !game.pending.choices[seat]
        : game.current === seat,
    )
    if (nextSeat === undefined) return
    const delay = game.phase === 'response'
      ? nextSeat === 0 && !autoplay.value
        ? Math.max(0, reactionDeadline(game) - Date.now())
        : game.pending?.kind === 'rob'
        ? 0
        : AI_DELAYS.claim
      : game.players[nextSeat]?.afterKong
        ? YAOTONG_AI_KONG_DISCARD_MS
        : YAOTONG_AI_DISCARD_MS
    timer = setTimeout(
      () => {
        const command: Command | null = nextSeat === 0 && !autoplay.value && game.phase === 'response'
          ? { type: 'respond', action: 'pass', deferHu: true } : chooseAction(game, nextSeat)
        if (command && state.value === game) dispatch(command, nextSeat)
      },
      delay,
    )
    cleanup(() => clearTimeout(timer))
  })
  onScopeDispose(() => { clearTimeout(timer); endHold(true) })
  return {
    state,
    user,
    paused,
    autoplay,
    mode,
    remote,
    acceptRemoteState,
    protection,
    protectionNotice,
    flowStep,
    selected,
    error,
    holding, hardControls, waitRemainingMs, startHold,
    declareHu: (plan?: string) => holdDecision('declareHu', plan),
    passHold: () => holdDecision('passHu'),
    ownTurn,
    autoDiscard,
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
