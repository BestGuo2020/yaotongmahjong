import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import {
  defineGamePort,
  type Announcement,
  type DealAnimation,
  type GamePhase,
  type GameStartOptions,
  type LastDiscard,
  type OpeningStage,
  type RoundResult,
  type WaitInfo,
  type WinEffect,
} from '../../core/contracts/gamePort'
import type {
  GamePlayer,
  MatchType,
  ScoreFlowEvent,
  TableActionEvent,
  TileType,
  WinPresentation,
} from '../../core/contracts/types'
import { defaultAvatarForSeat } from '../../core/presentation/avatar'
import { activeBgmTrackPort, DEFAULT_BGM_FILE } from '../../core/presentation/useAudio'
import { READY_BGM_ASSET } from '../../core/presentation/audioAssets'
import {
  TABLE_ACTION_CUE_DURATION_MS,
  type TableDeclarationEvent,
} from '../../core/presentation/tableActionCue'
import {
  prefersReducedMotion,
  WIN_REVEAL_DURATION,
  REDUCED_WIN_REVEAL_DURATION,
} from '../../core/presentation/winEffect'
import { tileName as sharedTileName } from '../../core/rules/tiles'
import { createLocalTransientEventPresenter } from '../../core/local/localTransientEventPresenter'
import { createPresentationScheduler } from '../../shared/runtime/presentationScheduler'
import { dealInitialHands, playOpeningCue } from '../../shared/runtime/localOpening'
import { playDiscardName } from '../../shared/runtime/discardAudio'
import {
  createSettlementTimeline,
  type SettlementEndOptions,
} from '../../shared/settlement/settlementTimeline'
import { useYaotongGame } from './useYaotongGame'
import { countsOf } from './tiles'
import type { GameEvent, Wait } from './types'
import {
  chickenCue as makeChickenCue,
  settlementTitle,
  winningPattern,
  settlementCue as makeSettlementCue,
  giftAwards,
  type SettlementCue,
  type ChickenCue,
  type YaotongTableView,
} from './presentation'

export const toSharedTile = (tile: number): TileType =>
  `${['m', 'p', 's'][Math.floor(tile / 9)]}${(tile % 9) + 1}` as TileType
export const fromSharedTile = (tile: TileType) => 'mps'.indexOf(tile[0]) * 9 + Number(tile[1]) - 1

/** Rules stay deterministic; the original opening, audio, cue and settlement timelines own presentation. */
export function useYaotongPort(
  options: {
    playSound?: (file: string, volume?: number) => unknown
    playSoundAndWait?: (file: string, volume?: number) => Promise<void>
    getCharacterId?: () => string
  } = {},
) {
  const local = useYaotongGame()
  const length = ref<4 | 8 | 16>(4)
  const openingStage = ref<OpeningStage | null>(null)
  const openingActive = ref(false)
  const dealCounts = ref([0, 0, 0, 0])
  const dealAnimation = ref<DealAnimation>({ playerIndex: -1, count: 0, serial: 0 })
  const declarationArmed = ref(false)
  const announcement = shallowRef<Announcement | null>(null)
  const tableActionEvent = shallowRef<TableActionEvent | null>(null)
  const lastDiscard = shallowRef<LastDiscard | null>(null)
  const lastDiscardSound = shallowRef<Promise<void> | null>(null)
  const scoreFlowEvent = shallowRef<ScoreFlowEvent | null>(null)
  const winEffect = shallowRef<WinEffect | null>(null)
  const winPresentation = shallowRef<WinPresentation | null>(null)
  const result = shallowRef<RoundResult | null>(null)
  const revealHands = ref(false)
  const scoresReleased = ref(false)
  const winningDiscardMoved = ref(false)
  const presentationPhase = ref<GamePhase | null>(null)
  const tailDrawn = ref(0)
  const seatCue = shallowRef<ChickenCue | null>(null)
  const declarationCues = shallowRef<TableDeclarationEvent[]>([])
  const settlementCue = shallowRef<SettlementCue | null>(null)
  const gifts = computed(() => giftAwards(local.state.value?.result?.transfers ?? []))
  const winDeclared = ref(false)
  let lastDeclarationSound = -Infinity
  const tableView = computed<YaotongTableView>(() => ({
    seats:
      local.state.value?.players.map((player, seat) => ({
        declaration: player.declaration,
        burned: player.burned && revealHands.value,
        winner: winDeclared.value && Boolean(local.state.value?.result?.winners.includes(seat)),
        winPattern: winDeclared.value ? winningPattern(local.state.value?.result?.values[seat]) : undefined,
        killed:
          revealHands.value &&
          Boolean(
            local.state.value?.result?.transfers.some((t) => t.account === '杀报加分' && t.from === seat),
          ),
        gift: revealHands.value && gifts.value.some((gift) => gift.seat === seat),
        giftAmount: revealHands.value ? gifts.value.find((gift) => gift.seat === seat)?.amount : undefined,
      })) ?? [],
    chickenCue: seatCue.value,
    declarationCues: declarationCues.value,
    settlementCue: settlementCue.value,
  }))
  let generation = 0,
    settlementGeneration = 0,
    seenSerial = 0,
    seenHand = 0,
    eventSequence = 0
  const declaredKongs = new Set<string>()
  const playSound = (name: string, volume?: number) => options.playSound?.(name, volume)
  const playSoundAndWait =
    options.playSoundAndWait ??
    (async (name: string, volume?: number) => {
      playSound(name, volume)
    })
  const scheduler = createPresentationScheduler({
    controllers: [],
    stopCountdown() {},
    cancelOpening() {
      generation++
    },
  })
  const transient = createLocalTransientEventPresenter({
    state: { announcement, tableActionEvent, scoreFlowEvent },
    later: scheduler.later,
  })
  const phase = computed<GamePhase>({
    get() {
      if (!local.state.value) return 'lobby'
      if (presentationPhase.value) return presentationPhase.value
      if (openingActive.value) return 'dealing'
      if (local.state.value.phase === 'transition') {
        return local.flowStep.value === 'next-draw'
          ? 'checking'
          : local.flowStep.value === 'after-peng'
            ? 'thinking'
            : local.flowStep.value === 'first-draw'
              ? 'opening'
              : 'kong'
      }
      return local.state.value.phase === 'response'
        ? 'prompt'
        : local.state.value.phase === 'original'
          ? 'checking'
          : local.state.value.phase === 'settled'
            ? 'settled'
            : 'discard'
    },
    set(value) {
      presentationPhase.value = value
    },
  })
  const players = computed<GamePlayer[]>(
    () =>
      local.state.value?.players.map((p, seat) => {
        const state = local.state.value!,
          outcome = state.result
        const claimWin = outcome?.kind === 'win' && outcome.winKind !== 'self'
        let hand = openingActive.value ? p.hand.slice(0, dealCounts.value[seat]) : p.hand
        if (claimWin && outcome.winners[0] === seat) hand = hand.slice(0, -1)
        const pendingKong =
          state.pending?.kind === 'rob' &&
          state.pending.from === seat &&
          p.hand.includes(state.pending.tile) &&
          !outcome
        if (pendingKong) {
          hand = [...hand]
          hand.splice(hand.indexOf(state.pending!.tile), 1)
        }
        return {
          name: p.name,
          avatar: defaultAvatarForSeat(seat),
          seat,
          // Engine settlement is atomic. Display transfers only when the shared reveal stage finishes.
          score: p.score - (outcome && !scoresReleased.value ? outcome.deltas[seat] : 0),
          redCount: 0,
          playerKind: seat === 0 ? 'human' : 'bot',
          characterId: seat === 0 ? options.getCharacterId?.() : undefined,
          hand: hand.map(toSharedTile),
          drawnTileIndex: p.drawn !== null && !openingActive.value && !pendingKong ? hand.length - 1 : -1,
          discards: [
            ...p.river.map((d) => toSharedTile(d.tile)),
            ...(claimWin && outcome.source === seat && outcome.winKind !== 'rob' && !winningDiscardMoved.value
              ? [toSharedTile(outcome.tile!)]
              : []),
          ],
          melds: p.melds.map((m) => {
            const pending = pendingKong && m.kind === 'peng' && m.tile === state.pending!.tile
            return {
              tile: toSharedTile(m.tile),
              type: pending
                ? 'gang'
                : m.kind === 'peng'
                  ? 'peng'
                  : m.kind === 'stored' || m.kind === 'turn'
                    ? 'angang'
                    : 'gang',
              tiles: Array(pending || m.kind !== 'peng' ? 4 : 3).fill(toSharedTile(m.tile)),
              from: m.from,
              added: m.kind === 'added' || pending,
              pending: Boolean(pending),
            }
          }),
        }
      }) ?? [],
  )
  const visibleCount = computed(() => dealCounts.value.reduce((sum, n) => sum + n, 0))
  const wall = computed(() => {
    const state = local.state.value
    if (!state) return []
    if (openingActive.value)
      return [...state.players.flatMap((p) => p.hand), ...state.wall]
        .slice(visibleCount.value)
        .map(toSharedTile)
    const indicator = state.result?.indicator
    return [...(!scoresReleased.value && indicator != null ? [indicator] : []), ...state.wall].map(
      toSharedTile,
    )
  })
  const wallHeadDrawn = computed(() =>
    openingActive.value
      ? visibleCount.value
      : local.state.value
        ? 108 - wall.value.length - tailDrawn.value
        : 0,
  )
  const publicCounts = computed(() =>
    countsOf(
      local.state.value
        ? [
            ...local.state.value.players[0].hand,
            ...local.state.value.players.flatMap((p) => [
              ...p.river.map((d) => d.tile),
              ...p.melds.flatMap((m) => Array(m.kind === 'peng' ? 3 : 4).fill(m.tile)),
            ]),
          ]
        : [],
    ),
  )
  function waitInfo(waits: Wait[], discard: TileType | null = null): WaitInfo | null {
    if (!waits.length) return null
    const tiles = waits.map((w) => ({
      tile: toSharedTile(w.tile),
      remaining: Math.max(0, 4 - publicCounts.value[w.tile]),
    }))
    return { discard, tiles, any: tiles.length === 27, remaining: tiles.reduce((n, t) => n + t.remaining, 0) }
  }
  const original = computed(
    () =>
      !openingActive.value &&
      local.state.value?.phase === 'original' &&
      !local.state.value.originalDecisions[0],
  )
  const standings = computed(() =>
    players.value
      .map((p, playerIndex) => ({ ...p, playerIndex, rank: 0 }))
      .sort((a, b) => b.score - a.score)
      .map((p, i) => ({ ...p, rank: i + 1 })),
  )
  const matchName = computed(
    () =>
      `幺筒麻将 · ${{ 4: '东风场', 8: '半庄场', 16: '全庄场' }[local.state.value?.matchLength ?? length.value]}`,
  )
  const roundLabel = computed(() =>
    local.state.value
      ? `第${local.state.value.dealerRound}/${local.state.value.matchLength}庄次 · 第${local.state.value.handNumber}小局${local.state.value.repeats ? ` · 连庄${local.state.value.repeats}次` : ''}`
      : '',
  )
  const currentPlayer = computed({
    get: () => (presentationPhase.value ? -1 : (local.state.value?.current ?? 0)),
    set(_value: number) {},
  })
  const winningPlayerIndex = ref(-1)
  const honba = ref(0)
  watch(
    () => local.state.value?.players.some((player) => player.declaration !== 'none') ?? false,
    (hasDeclaration) => {
      activeBgmTrackPort()?.fadeTo(hasDeclaration ? READY_BGM_ASSET : DEFAULT_BGM_FILE)
    },
  )
  watch(
    revealHands,
    (revealed) => {
      if (!revealed) return
      playSound('tuidao.wav', 0.55)
      const cue = makeSettlementCue(local.state.value, ++eventSequence)
      settlementCue.value = cue
      if (cue)
        scheduler.later(
          () => {
            if (settlementCue.value?.id === cue.id) settlementCue.value = null
          },
          prefersReducedMotion() ? REDUCED_WIN_REVEAL_DURATION : WIN_REVEAL_DURATION,
        )
    },
    { flush: 'sync' },
  )

  function finalizeResult(): RoundResult {
    const state = local.state.value!,
      r = state.result!,
      winner = r.winners[0] ?? -1
    scoresReleased.value = true
    transient.showScoreFlow(r.deltas.map((amount, playerIndex) => ({ amount, playerIndex })))
    return {
      draw: r.kind !== 'win',
      winnerIndex: winner,
      winner: state.players[winner]?.name,
      winType: r.winKind === 'self' ? 'self-draw' : r.winKind === 'rob' ? 'robbed-kong' : 'discard',
      robbedKong: r.winKind === 'rob',
      winTile: r.tile === undefined ? undefined : toSharedTile(r.tile),
      points: r.values[winner]?.h ?? 0,
      totalWon: r.deltas[winner] ?? 0,
      multiplier: state.dice[0] === state.dice[1] ? 2 : 1,
      tenpai: r.ready.flatMap((ready, i) => (ready ? [i] : [])),
      details: r.values[winner]?.patterns.map((p) => ({ label: p.name, points: p.points })),
    }
  }
  function createTimeline() {
    const token = settlementGeneration
    return createSettlementTimeline<SettlementEndOptions>({
      state: {
        phase,
        get players() {
          return players.value
        },
        wall,
        wallHeadDrawn,
        currentPlayer,
        userDrewThisTurn: ref(false),
        actionPrompt: ref(null),
        pendingKong: ref(null),
        announcement,
        openingStage,
        scoreFlowEvent,
        tableActionEvent,
        lastDiscardSound,
        result,
        winEffect,
        winPresentation,
        revealHands,
        winningPlayerIndex,
        honba,
      },
      clearTimers: scheduler.clear,
      later(callback, delay) {
        if (token !== settlementGeneration) return 0
        return scheduler.later(() => {
          if (token === settlementGeneration) callback()
        }, delay)
      },
      playSound,
      playSoundAndWait,
      showTableAction(...args) {
        winDeclared.value = true
        transient.showTableAction(...args)
      },
      getRoundLabel: () => roundLabel.value,
      getSourceIndex: ({ winnerIndex, endOptions }) =>
        endOptions.selfDraw ? local.state.value!.players[winnerIndex].hand.length - 1 : -1,
      getTableAction: ({ endOptions }) => ({
        type: endOptions.robbedKong ? 'robbed-kong-win' : endOptions.selfDraw ? 'self-draw' : 'discard-win',
        sourceIndex: endOptions.sourceFrom ?? endOptions.robbedKongPlayerIndex ?? null,
      }),
      settleWinningDiscard() {
        winningDiscardMoved.value = true
        lastDiscard.value = null
      },
      takeRobbedKongTile(seat, tile) {
        return local.state.value!.players[seat!].melds.findIndex((m) => toSharedTile(m.tile) === tile)
      },
      finalizeWin: finalizeResult,
      endDraw: finalizeResult,
    })
  }
  function present(event: GameEvent) {
    if (event.kind === 'draw') {
      if (event.text === '杠后补摸') tailDrawn.value++
      playSound('give.mp3', 0.7)
      return
    }
    if (event.kind === 'hu') return // Shared settlement timeline owns the voice, cue, effect and reveal sequence.
    if (event.kind === 'discard') {
      lastDiscard.value = { tile: toSharedTile(event.tile!), from: event.seat, id: ++eventSequence }
      playSound('dapai.mp3', 0.8)
      const game = local.state.value
      lastDiscardSound.value = playDiscardName(toSharedTile(event.tile!), {
        playSound,
        playSoundAndWait,
        current: () => local.state.value === game,
      })
    }
    if (event.kind === 'peng') {
      lastDiscard.value = null
      seatCue.value = null
    }
    if (event.kind === 'ready') {
      const cue: TableDeclarationEvent = {
        id: ++eventSequence,
        actorIndex: event.seat,
        type: local.state.value!.players[event.seat].declaration === 'original' ? 'original-ready' : 'ready',
      }
      declarationCues.value = [...declarationCues.value.filter((item) => item.actorIndex !== event.seat), cue]
      scheduler.later(() => {
        declarationCues.value = declarationCues.value.filter((item) => item.id !== cue.id)
      }, TABLE_ACTION_CUE_DURATION_MS)
      if (Date.now() - lastDeclarationSound > 100) {
        lastDeclarationSound = Date.now()
        playSound('ting.wav', 0.7)
      }
    }
    if (event.kind === 'penalty') playSound('didu.ogg')
    const cue = makeChickenCue(event, local.state.value!)
    if (cue) {
      seatCue.value = cue
      scheduler.later(() => {
        if (seatCue.value === cue) seatCue.value = null
      }, 1050)
      const game = local.state.value
      void lastDiscardSound.value?.then(() => {
        if (
          local.state.value === game &&
          !game?.result &&
          game?.players[event.seat].river.some((d) => d.id === event.id)
        )
          playSound('chongfengji.wav', 0.3)
      })
    }
    if (event.kind === 'kong')
      playSound(
        event.text === '转弯杠' || event.text === '存杠' ? 'angang_rainy.wav' : 'mingang_windy.wav',
        0.28,
      )
    const kongKey = `${event.seat}/${event.tile}`
    if (event.kind === 'kong-intent') declaredKongs.add(kongKey)
    if (event.kind === 'kong' && event.text === '补杠' && declaredKongs.delete(kongKey)) return
    const type: TableActionEvent['type'] | null =
      event.kind === 'peng'
        ? 'peng'
        : event.kind === 'kong-intent'
          ? 'added-gang'
          : event.kind === 'kong'
            ? event.text === '补杠'
              ? 'added-gang'
              : event.text === '明杠'
                ? 'discard-gang'
                : 'concealed-gang'
            : null
    if (type) {
      transient.showTableAction(
        type,
        event.seat,
        local.state.value!.players[event.seat].melds.at(-1)?.from ?? null,
        toSharedTile(event.tile!),
        Math.max(0, local.state.value!.players[event.seat].melds.length - 1),
      )
      playSound(event.kind === 'peng' ? 'peng.mp3' : 'gang.mp3')
    }
  }
  watch(
    local.state,
    (state) => {
      if (!state) return
      if (seenHand !== state.handNumber) {
        seenHand = state.handNumber
        seenSerial = 0
        tailDrawn.value = 0
      }
      for (const event of state.events.filter((e) => e.id > seenSerial)) present(event)
      seenSerial = state.serial
      if (!state.result || result.value || presentationPhase.value) return
      seatCue.value = null
      declarationCues.value = []
      const r = state.result
      // The headless rules have finished; the display has not. Enter the shared timeline from a live phase.
      presentationPhase.value = 'checking'
      const timeline = createTimeline()
      if (r.kind === 'win')
        timeline.endGame(r.winners[0], {
          winTile: toSharedTile(r.tile!),
          selfDraw: r.winKind === 'self',
          robbedKong: r.winKind === 'rob',
          robbedKongPlayerIndex: r.winKind === 'rob' ? r.source! : undefined,
          sourceFrom: r.winKind === 'discard' || r.winKind === 'hot' ? r.source! : undefined,
        })
      else timeline.endDraw()
    },
    { flush: 'sync' },
  )

  function resetPresentation() {
    settlementGeneration++
    scheduler.clear()
    openingStage.value = null
    presentationPhase.value = null
    openingActive.value = true
    result.value = null
    winEffect.value = null
    winPresentation.value = null
    revealHands.value = false
    scoresReleased.value = false
    winningDiscardMoved.value = false
    winningPlayerIndex.value = -1
    winDeclared.value = false
    tableActionEvent.value = null
    scoreFlowEvent.value = null
    lastDiscard.value = null
    lastDiscardSound.value = null
    announcement.value = null
    declarationArmed.value = false
    dealCounts.value = [0, 0, 0, 0]
    declaredKongs.clear()
    seatCue.value = null
    declarationCues.value = []
    lastDeclarationSound = -Infinity
    settlementCue.value = null
  }
  async function opening(startOptions?: GameStartOptions) {
    local.paused.value = true
    const token = generation
    await startOptions?.waitForTableReady?.()
    if (token !== generation) return
    openingStage.value = 'start'
    await playOpeningCue('start', { wait: scheduler.wait, playSoundAndWait })
    if (token !== generation) return
    openingStage.value = 'dice'
    await playOpeningCue('dice', { wait: scheduler.wait, playSoundAndWait })
    if (token !== generation) return
    const state = local.state.value!
    const dealQueue: TileType[] = []
    for (let batch = 0; batch < 4; batch++)
      for (let offset = 0; offset < 4; offset++) {
        const hand = state.players[(state.dealer + offset) % 4].hand
        dealQueue.push(
          ...(batch === 3 ? hand.slice(12) : hand.slice(batch * 4, batch * 4 + 4)).map(toSharedTile),
        )
      }
    const dealtPlayers = players.value.map((p) => ({ ...p, hand: [] as TileType[] }))
    const dealt = await dealInitialHands({
      state: {
        players: dealtPlayers,
        dealer: ref(state.dealer),
        openingStage,
        dealAnimation: {
          get value() {
            return dealAnimation.value
          },
          set value(value) {
            dealAnimation.value = { ...value, serial: ++eventSequence }
            dealCounts.value = dealtPlayers.map((p) => p.hand.length)
          },
        },
      },
      takeTile: () => dealQueue.shift() ?? null,
      wait: scheduler.wait,
      playSound,
      isCancelled: () => token !== generation,
      sortHand: (hand) => hand,
      dealerJump: false,
    })
    if (!dealt || token !== generation) return
    openingStage.value = null
    dealAnimation.value = { playerIndex: -1, count: 0, serial: ++eventSequence }
    await startOptions?.waitForOpeningReady?.()
    if (token !== generation) return
    openingActive.value = false
    local.paused.value = false
  }
  const risk = computed(() =>
    local.response.value?.mandatory || local.self.value?.mandatory
      ? '本次必须胡牌，选择其他操作将包牌'
      : local.response.value?.restrictedHu || local.self.value?.restrictedHu
        ? '过手胡尚未解除，选择胡将包牌'
        : local.response.value?.restrictedPeng
          ? '本巡已打鸡，碰鸡将包牌'
          : local.ownTurn.value && local.user.value?.chickenPeng
            ? '本巡已碰鸡，不可再打鸡'
            : '',
  )
  const port = defineGamePort({
    phase,
    get players() {
      return players.value
    },
    wall,
    wallHeadDrawn,
    wallCount: computed(() => wall.value.length),
    currentPlayer,
    selectedIndex: local.selected,
    turnSeconds: ref(0),
    lastDiscard,
    actionPrompt: computed(() =>
      local.response.value && !local.autoplay.value
        ? {
            type: 'claim',
            tile: toSharedTile(local.state.value!.pending!.tile),
            from: local.state.value!.pending!.from,
            canHu: local.response.value.hu,
            canPeng: local.response.value.peng,
            canGang: local.response.value.kong,
          }
        : null,
    ),
    announcement,
    tableActionEvent,
    scoreFlowEvent,
    result,
    winEffect,
    winPresentation,
    revealHands,
    winningPlayerIndex,
    round: computed(() => local.state.value?.dealerRound ?? 1),
    dealer: computed(() => local.state.value?.dealer ?? 0),
    user: computed(() => players.value[0]),
    isUserTurn: computed(() => local.ownTurn.value && !local.paused.value && !local.autoplay.value),
    userCanHu: computed(() => Boolean(local.self.value?.hu && !local.paused.value && !local.autoplay.value)),
    matchType: computed<MatchType>(() => (length.value === 4 ? 'east' : 'hanchan')),
    matchName,
    matchFinished: computed(() => Boolean(result.value && local.state.value?.result?.finished)),
    honba,
    roundLabel,
    standings,
    dealAnimation,
    openingStage,
    diceValues: computed(() => local.state.value?.dice ?? [1, 1]),
    diceThrowerIndex: computed(() => local.state.value?.dealer ?? 0),
    userCurrentWaits: computed(() => waitInfo(local.waiting.value)),
    userTingOptions: computed(() =>
      local.discardOptions.value.map(
        (w) => waitInfo(w.waits, toSharedTile(local.user.value!.hand[w.index]))!,
      ),
    ),
    userDiscardWaits: computed(() =>
      waitInfo(
        local.selectedWaits.value,
        local.selected.value < 0 ? null : toSharedTile(local.user.value!.hand[local.selected.value]),
      ),
    ),
    userKongs: computed(() => local.kongs.value.map(toSharedTile)),
    capabilities: computed(() => ({})),
    startGame(_mode?: MatchType, startOptions?: GameStartOptions) {
      resetPresentation()
      seenHand = 0
      seenSerial = 0
      local.begin(length.value, {
        wall: startOptions?.initialWall?.map(fromSharedTile),
        dice: startOptions?.openingDice,
        dealer: startOptions?.dealer,
      })
      return opening(startOptions)
    },
    selectTile(index: number) {
      local.selected.value = index
    },
    clearUserSelection() {
      local.selected.value = -1
    },
    userDiscard(index = local.selected.value) {
      if (declarationArmed.value && !local.discardOptions.value.some((o) => o.index === index)) {
        transient.announce('请打出带听牌提示的牌，再声明报听')
        return
      }
      local.dispatch({ type: 'discard', index, declare: declarationArmed.value })
      declarationArmed.value = false
    },
    userPass() {
      local.dispatch({ type: 'respond', action: 'pass' })
    },
    userPeng() {
      local.dispatch({ type: 'respond', action: 'peng' })
    },
    userGangFromDiscard() {
      local.dispatch({ type: 'respond', action: 'kong' })
    },
    userGang(tile?: TileType) {
      const target = tile ? fromSharedTile(tile) : local.kongs.value[0]
      if (target !== undefined) local.dispatch({ type: 'kong', tile: target })
    },
    userHu() {
      local.dispatch(local.response.value ? { type: 'respond', action: 'hu' } : { type: 'hu' })
    },
    nextRound() {
      if (!result.value || local.state.value?.result?.finished) return
      resetPresentation()
      local.next()
      return opening()
    },
    returnToLobby() {
      settlementGeneration++
      scheduler.clear()
      declarationCues.value = []
      settlementCue.value = null
      openingActive.value = false
      openingStage.value = null
      result.value = null
      local.leave()
      winEffect.value = null
      winPresentation.value = null
      presentationPhase.value = null
    },
    tileName: sharedTileName,
  })
  onScopeDispose(() => {
    settlementGeneration++
    scheduler.clear()
  })
  return Object.assign(port, {
    local,
    length,
    original,
    risk,
    tableView,
    resultTitle: computed(() => settlementTitle(local.state.value?.result ?? null)),
    declarationArmed,
    openingActive,
    canArmDeclaration: computed(
      () =>
        local.ownTurn.value &&
        local.user.value?.draws === 1 &&
        local.user.value.drawn !== null &&
        local.user.value.declaration === 'none' &&
        local.discardOptions.value.length > 0,
    ),
  })
}
