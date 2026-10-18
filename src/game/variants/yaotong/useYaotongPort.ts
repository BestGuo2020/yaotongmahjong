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
import { tileName as sharedTileName } from '../../core/rules/tiles'
import { useYaotongGame } from './useYaotongGame'
import { countsOf, tileFile } from './tiles'
import type { GameEvent, Wait } from './types'

export const toSharedTile = (tile: number): TileType =>
  `${['m', 'p', 's'][Math.floor(tile / 9)]}${(tile % 9) + 1}` as TileType
export const fromSharedTile = (tile: TileType) => 'mps'.indexOf(tile[0]) * 9 + Number(tile[1]) - 1

/** The existing GamePort is the only boundary between the new rules and the original table. */
export function useYaotongPort(
  options: { playSound?: (file: string) => unknown; getCharacterId?: () => string } = {},
) {
  const local = useYaotongGame()
  const length = ref<4 | 8 | 16>(4)
  const openingStage = ref<OpeningStage | null>(null)
  const dealCounts = ref([0, 0, 0, 0])
  const dealAnimation = ref<DealAnimation>({ playerIndex: -1, count: 0, serial: 0 })
  const declarationArmed = ref(false)
  const announcement = shallowRef<Announcement | null>(null)
  const tableActionEvent = shallowRef<TableActionEvent | null>(null)
  const lastDiscard = shallowRef<LastDiscard | null>(null)
  const scoreFlowEvent = shallowRef<ScoreFlowEvent | null>(null)
  const winEffect = shallowRef<WinEffect | null>(null)
  const winPresentation = shallowRef<WinPresentation | null>(null)
  const result = shallowRef<RoundResult | null>(null)
  const celebrating = ref(false)
  const tailDrawn = ref(0)
  let generation = 0,
    seenSerial = 0,
    seenHand = 0,
    presentationId = 0
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const schedule = (fn: () => void, delay: number) => {
    const timer = setTimeout(() => {
      timers.delete(timer)
      fn()
    }, delay)
    timers.add(timer)
    return timer
  }
  const pause = (delay: number) => new Promise<void>((resolve) => schedule(resolve, delay))
  const reducedMotion = () =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const phase = computed<GamePhase>(() =>
    !local.state.value
      ? 'lobby'
      : openingStage.value
        ? 'opening'
        : celebrating.value
          ? 'win-effect'
          : local.state.value.phase === 'settled'
            ? 'settled'
            : local.state.value.phase === 'response'
              ? 'prompt'
              : local.state.value.phase === 'original'
                ? 'checking'
                : 'discard',
  )
  const players = computed<GamePlayer[]>(
    () =>
      local.state.value?.players.map((p, seat) => ({
        name: p.name,
        avatar: defaultAvatarForSeat(seat),
        seat,
        score: p.score,
        redCount: 0,
        playerKind: seat === 0 ? 'human' : 'bot',
        characterId: seat === 0 ? options.getCharacterId?.() : undefined,
        hand: (openingStage.value
          ? p.hand.slice(0, dealCounts.value[seat])
          : winPresentation.value?.winnerIndex === seat && winPresentation.value.discardWin
            ? p.hand.slice(0, -1)
            : p.hand
        ).map(toSharedTile),
        drawnTileIndex: p.drawn !== null && !openingStage.value ? p.hand.length - 1 : -1,
        discards: p.river.map((d) => toSharedTile(d.tile)),
        melds: p.melds.map((m) => ({
          tile: toSharedTile(m.tile),
          type: m.kind === 'peng' ? 'peng' : m.kind === 'stored' || m.kind === 'turn' ? 'angang' : 'gang',
          tiles: Array(m.kind === 'peng' ? 3 : 4).fill(toSharedTile(m.tile)),
          from: m.from,
          added: m.kind === 'added',
        })),
      })) ?? [],
  )
  const visibleCount = computed(() => dealCounts.value.reduce((sum, n) => sum + n, 0))
  const wall = computed(() => {
    const state = local.state.value
    if (!state) return []
    return (
      openingStage.value
        ? [...state.players.flatMap((p) => p.hand), ...state.wall].slice(visibleCount.value)
        : state.wall
    ).map(toSharedTile)
  })
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
      !openingStage.value &&
      local.state.value?.phase === 'original' &&
      !local.state.value.originalDecisions[0],
  )
  const announce = (text: string, tone = 'gold') => {
    const value = { id: ++presentationId, text, tone }
    announcement.value = value
    schedule(() => {
      if (announcement.value === value) announcement.value = null
    }, 2200)
  }
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

  function present(event: GameEvent) {
    if (event.kind === 'draw') {
      if (event.text === '杠后补摸') tailDrawn.value++
      return
    }
    if (event.kind === 'discard')
      lastDiscard.value = { tile: toSharedTile(event.tile!), from: event.seat, id: ++presentationId }
    if (event.kind === 'peng' || event.kind === 'kong' || event.kind === 'hu') lastDiscard.value = null
    const sound = {
      start: '',
      peng: 'peng.mp3',
      kong: 'gang.mp3',
      discard: 'dapai.mp3',
      ready: 'give.mp3',
      penalty: 'didu.ogg',
      hu: 'hu.mp3',
    }[event.kind]
    if (sound) options.playSound?.(sound)
    if (event.kind === 'discard' && event.tile !== undefined)
      options.playSound?.(tileFile(event.tile).replace('.png', '.mp3'))
    if (event.kind === 'ready' || event.kind === 'penalty' || event.text.includes('冲幺筒'))
      announce(`${local.state.value!.players[event.seat].name} · ${event.text}`)
    const type: TableActionEvent['type'] | null =
      event.kind === 'peng'
        ? 'peng'
        : event.kind === 'kong'
          ? event.text === '补杠'
            ? 'added-gang'
            : event.text === '明杠'
              ? 'discard-gang'
              : 'concealed-gang'
          : event.kind === 'hu'
            ? local.state.value?.result?.winKind === 'self'
              ? 'self-draw'
              : local.state.value?.result?.winKind === 'rob'
                ? 'robbed-kong-win'
                : 'discard-win'
            : null
    if (type) {
      const action: TableActionEvent = {
        id: ++presentationId,
        type,
        actorIndex: event.seat,
        sourceIndex:
          local.state.value?.result?.source ??
          local.state.value?.players[event.seat].melds.at(-1)?.from ??
          null,
        tile: toSharedTile(event.tile ?? 9),
        meldIndex: Math.max(0, local.state.value!.players[event.seat].melds.length - 1),
      }
      tableActionEvent.value = action
      schedule(
        () => {
          if (tableActionEvent.value === action) tableActionEvent.value = null
        },
        event.kind === 'hu' ? 2000 : 1400,
      )
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
      if (!state.result || result.value || celebrating.value) return
      const r = state.result,
        winner = r.winners[0] ?? -1
      celebrating.value = true
      if (r.kind === 'win') {
        winPresentation.value = {
          winnerIndex: winner,
          tile: toSharedTile(r.tile!),
          sourceIndex: r.winKind === 'self' ? state.players[winner].hand.length - 1 : r.source!,
          robbedKong: r.winKind === 'rob',
          discardWin: r.winKind !== 'self',
          robbedKongPlayerIndex: r.source ?? -1,
          robbedKongMeldIndex: -1,
        }
        const effect: WinEffect = {
          id: ++presentationId,
          winnerIndex: winner,
          tile: toSharedTile(r.tile!),
          robbedKong: r.winKind === 'rob',
          robbedKongPlayerIndex: r.source ?? -1,
          robbedKongMeldIndex: -1,
          duration: 2600,
          reducedMotion: Boolean(reducedMotion()),
        }
        const effectGeneration = generation
        schedule(
          () => {
            if (effectGeneration === generation) winEffect.value = effect
          },
          reducedMotion() ? 0 : 2000,
        )
        options.playSound?.('hu_effect_sound.mp3')
      }
      const token = generation
      schedule(
        () => {
          if (token !== generation) return
          celebrating.value = false
          winEffect.value = null
          scoreFlowEvent.value = {
            id: ++presentationId,
            deltas: r.deltas.map((amount, playerIndex) => ({ amount, playerIndex })),
          }
          const scoreEvent = scoreFlowEvent.value
          schedule(() => {
            if (scoreFlowEvent.value === scoreEvent) scoreFlowEvent.value = null
          }, 1800)
          result.value = {
            draw: r.kind !== 'win',
            winnerIndex: winner,
            winner: players.value[winner]?.name,
            roundLabel: roundLabel.value,
            winType: r.winKind === 'self' ? 'self-draw' : r.winKind === 'rob' ? 'robbed-kong' : 'discard',
            robbedKong: r.winKind === 'rob',
            winTile: r.tile === undefined ? undefined : toSharedTile(r.tile),
            points: r.values[winner]?.h ?? 0,
            totalWon: r.deltas[winner] ?? 0,
            multiplier: state.dice[0] === state.dice[1] ? 2 : 1,
            tenpai: r.ready.flatMap((ready, i) => (ready ? [i] : [])),
            details: r.values[winner]?.patterns.map((p) => ({ label: p.name, points: p.points })),
            scoreChanges: standings.value.map((p) => ({ ...p, delta: r.deltas[p.playerIndex] })),
          }
        },
        reducedMotion() ? 500 : r.kind === 'win' ? 4900 : 1600,
      )
    },
    { flush: 'sync' },
  )

  async function opening(startOptions?: GameStartOptions) {
    const token = ++generation
    local.paused.value = true
    result.value = null
    celebrating.value = false
    winEffect.value = null
    winPresentation.value = null
    tableActionEvent.value = null
    scoreFlowEvent.value = null
    lastDiscard.value = null
    declarationArmed.value = false
    dealCounts.value = [0, 0, 0, 0]
    openingStage.value = 'start'
    await startOptions?.waitForTableReady?.()
    if (token !== generation) return
    options.playSound?.('game_start.mp3')
    await pause(reducedMotion() ? 0 : 450)
    if (token !== generation) return
    openingStage.value = 'dice'
    options.playSound?.('dice.mp3')
    await pause(reducedMotion() ? 0 : 1200)
    if (token !== generation) return
    openingStage.value = 'deal'
    for (let batch = 0; batch < 4; batch++)
      for (let offset = 0; offset < 4; offset++) {
        if (token !== generation) return
        const seat = (local.state.value!.dealer + offset) % 4
        const count = batch === 3 ? 1 : 4
        dealCounts.value[seat] += count
        dealAnimation.value = { playerIndex: seat, count, serial: ++presentationId }
        options.playSound?.('deal.mp3')
        await pause(reducedMotion() ? 0 : 90)
      }
    if (token !== generation) return
    openingStage.value = null
    local.paused.value = false
    if (local.state.value!.dice[0] === local.state.value!.dice[1]) announce('同点双倍 · 本局全部分数 ×2')
  }
  const risk = computed(() =>
    local.response.value?.mandatory
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
    wallHeadDrawn: computed(() =>
      openingStage.value
        ? visibleCount.value
        : local.state.value
          ? 108 - wall.value.length - tailDrawn.value
          : 0,
    ),
    wallCount: computed(() => wall.value.length),
    currentPlayer: computed(() => local.state.value?.current ?? 0),
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
    revealHands: computed(() => Boolean(result.value)),
    winningPlayerIndex: computed(() => local.state.value?.result?.winners[0] ?? -1),
    round: computed(() => local.state.value?.dealerRound ?? 1),
    dealer: computed(() => local.state.value?.dealer ?? 0),
    user: computed(() => players.value[0]),
    isUserTurn: computed(() => local.ownTurn.value && !local.paused.value && !local.autoplay.value),
    userCanHu: computed(() => Boolean(local.self.value?.hu && !local.paused.value && !local.autoplay.value)),
    matchType: computed<MatchType>(() => (length.value === 4 ? 'east' : 'hanchan')),
    matchName,
    matchFinished: computed(() => Boolean(result.value && local.state.value?.result?.finished)),
    honba: ref(0),
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
      seenHand = 0
      seenSerial = 0
      local.begin(length.value)
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
        announce('请打出带听牌提示的牌，再声明报听')
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
      if (local.state.value?.result?.finished) return
      local.next()
      return opening()
    },
    returnToLobby() {
      generation++
      openingStage.value = null
      result.value = null
      local.leave()
      winEffect.value = null
      celebrating.value = false
    },
    tileName: sharedTileName,
  })
  onScopeDispose(() => {
    generation++
    timers.forEach(clearTimeout)
    timers.clear()
  })
  return Object.assign(port, {
    local,
    length,
    original,
    risk,
    declarationArmed,
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
