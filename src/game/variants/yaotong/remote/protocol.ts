// 幺筒联机协议 v0：服务端 yt_snapshot → 本地 GameState（本家固定为 players[0]）。
//
// 服务端按绝对座位下发；前端演出层（useYaotongPort）一直假设本家是 0 号位，
// 所以这里统一做座位旋转。他人手牌不下发，只保留 concealedTileCount。
import type {
  ActionOptions,
  Command,
  Discard,
  GameEvent,
  GameState,
  HandValue,
  Meld,
  Pending,
  Player,
  Settlement,
  Tile,
  WinKind,
} from '../types'
import { fromSharedTile } from '../sharedTile'
import { retainHuWindow } from '../huWindow'

export interface YtMeldView {
  tile: string
  kind: Meld['kind']
  from: number | null
  pre: boolean
  chicken: number
  responsibility: number
}

export interface YtDiscardView {
  tile: string
  chicken: number
  stage: Discard['stage']
  id: number
  firstChicken: boolean
  followChicken: boolean
  pre: boolean
}

export interface YtPlayerView {
  seat: number
  name: string
  avatar: string
  characterId: string
  playerKind: 'human' | 'llm' | 'bot'
  isLlm: boolean
  score: number
  hand: string[]
  concealedTileCount: number
  melds: YtMeldView[]
  river: YtDiscardView[]
  declaration: Player['declaration']
  draws: number
  discards: number
  drawn: string | null
  afterKong: boolean
  burned: boolean
  passedHu: number | null
  passedShape?: number | null
  chickenPeng: string[]
  chickenDiscard: string[]
}

export interface YtPendingView {
  kind: Pending['kind']
  tile: string
  from: number
  discard: YtDiscardView | null
  choices: Record<string, string>
  waitingSeats: number[]
}

export interface YtHandValueView {
  h: number
  patternPoints: number
  patterns: Array<{ name: string; points: number }>
  naturalYaos: number
  winningYaoNatural: boolean
  wildcards: number
  big: boolean
  structure: HandValue['structure']
  groups: string[][]
  resolvedHand: string[] | null
}

export interface YtSettlementView {
  kind: Settlement['kind']
  winners: number[]
  source: number | null
  winKind: WinKind | null
  tile: string | null
  offender: number | null
  reason: string
  indicator: string | null
  chicken: string | null
  ready: boolean[]
  deltas: number[]
  nextDealer: number
  finished: boolean
  transfers: Array<{
    from: number
    to: number
    account: string
    base: number
    multiplier: number
    amount: number
    reason: string
  }>
  values: Record<string, YtHandValueView>
}

export interface YtEventView {
  id: number
  seat: number
  kind: GameEvent['kind']
  text: string
  afterKong: boolean
  tile: string | null
  chicken: number | null
  rush: Discard['stage'] | null
}

export interface YtView {
  seat: number
  phase: GameState['phase'] | 'lobby' | 'transition'
  dealer: number
  current: number
  serial: number
  wallCount: number
  dice: [number, number]
  wallSide: number
  reservedStacks: number
  matchLength: 4 | 8 | 16
  dealerRound: number
  handNumber: number
  repeats: number
  players: YtPlayerView[]
  originalDecisions: boolean[]
  ownOriginalPending: boolean
  pending: YtPendingView | null
  ownOptions: ActionOptions | null
  events: YtEventView[]
  firstFixedDiscard: string[]
  firstFixedPeng: boolean
  firstYaoDiscard: boolean
  seenChickenDiscards: string[]
  waitRemainingMs: number[]
}

export interface YtSnapshot {
  kind: 'yt_snapshot'
  roomId: string
  matchId: string | null
  rulesetId: 'yaotong'
  seat: number
  round: number
  dealer: number
  matchLength: 4 | 8 | 16
  yaotongMode?: 'easy' | 'hard'
  /** 当前正在“等”的座位（服务端权威，用于牌桌暂停提示）。 */
  holdSeats?: number[]
  /** 老手模式当前决策的墙钟截止（毫秒时间戳）；0/缺失表示无读秒。 */
  decisionDeadlineAt?: number
  matchFinished: boolean
  opening: { dice: [number, number]; wallSide: number; reservedStacks: number } | null
  roundResult: YtSettlementView | null
  continuation?: { requiredSeats: number[]; readySeats: number[] }
  view: YtView
  huWindow?: YtView | null
}

export const toLocalSeat = (serverSeat: number, mySeat: number) =>
  ((serverSeat - mySeat + 4) % 4 + 4) % 4

const tile = (value: string | null | undefined): Tile | null =>
  value == null ? null : fromSharedTile(value as never)

const tileRequired = (value: string): Tile => fromSharedTile(value as never)

const rotate = <T>(values: T[], mySeat: number): T[] =>
  [0, 1, 2, 3].map((local) => values[(mySeat + local) % 4])

function convertMeld(meld: YtMeldView, mySeat: number): Meld {
  return {
    tile: tileRequired(meld.tile),
    kind: meld.kind,
    ...(meld.from == null ? {} : { from: toLocalSeat(meld.from, mySeat) }),
    pre: meld.pre,
    chicken: meld.chicken,
    responsibility: meld.responsibility,
  }
}

function convertDiscard(discard: YtDiscardView): Discard {
  return {
    tile: tileRequired(discard.tile),
    chicken: discard.chicken,
    stage: discard.stage,
    id: discard.id,
    firstChicken: discard.firstChicken,
    followChicken: discard.followChicken,
    pre: discard.pre,
  }
}

function convertPlayer(view: YtPlayerView, mySeat: number, reveal: boolean): Player {
  const localSeat = toLocalSeat(view.seat, mySeat)
  const isSelf = localSeat === 0
  return {
    name: view.name,
    avatar: view.avatar,
    characterId: view.characterId,
    playerKind: view.playerKind,
    hand: isSelf || reveal ? view.hand.map(tileRequired) : [],
    concealedTileCount: view.concealedTileCount,
    melds: view.melds.map((meld) => convertMeld(meld, mySeat)),
    river: view.river.map(convertDiscard),
    score: view.score,
    declaration: view.declaration,
    draws: view.draws,
    discards: view.discards,
    drawn: isSelf || reveal ? tile(view.drawn) : null,
    afterKong: view.afterKong,
    burned: view.burned,
    passedHu: isSelf ? view.passedHu : null,
    passedShape: isSelf ? view.passedShape ?? null : null,
    chickenPeng: isSelf ? view.chickenPeng.map(tileRequired) : [],
    chickenDiscard: isSelf ? view.chickenDiscard.map(tileRequired) : [],
  }
}

function convertOptions(options: ActionOptions): ActionOptions {
  return { ...options }
}

function convertPending(
  pending: YtPendingView,
  mySeat: number,
  ownOptions: ActionOptions | null,
): Pending {
  return {
    kind: pending.kind,
    tile: tileRequired(pending.tile),
    from: toLocalSeat(pending.from, mySeat),
    discard: pending.discard ? convertDiscard(pending.discard) : null,
    options: ownOptions ? { 0: convertOptions(ownOptions) } : {},
    choices: Object.fromEntries(
      Object.entries(pending.choices).map(([seat, choice]) => [
        toLocalSeat(Number(seat), mySeat), choice,
      ]),
    ) as Pending['choices'],
    huPlans: {},
  }
}

function convertHandValue(value: YtHandValueView): HandValue {
  return {
    h: value.h,
    patternPoints: value.patternPoints,
    patterns: value.patterns,
    naturalYaos: value.naturalYaos,
    winningYaoNatural: value.winningYaoNatural,
    wildcards: value.wildcards,
    big: value.big,
    structure: value.structure,
    groups: value.groups.map((group) => group.map(tileRequired)),
    resolvedHand: value.resolvedHand
      ? value.resolvedHand.map(tileRequired) : undefined,
  }
}

function convertSettlement(
  result: YtSettlementView,
  mySeat: number,
): Settlement {
  return {
    kind: result.kind,
    winners: result.winners.map((seat) => toLocalSeat(seat, mySeat)),
    source: result.source == null ? null : toLocalSeat(result.source, mySeat),
    winKind: result.winKind ?? undefined,
    tile: tile(result.tile) ?? undefined,
    offender: result.offender == null ? undefined : toLocalSeat(result.offender, mySeat),
    reason: result.reason,
    indicator: tile(result.indicator),
    chicken: tile(result.chicken),
    ready: rotate(result.ready, mySeat),
    deltas: rotate(result.deltas, mySeat),
    nextDealer: toLocalSeat(result.nextDealer, mySeat),
    finished: result.finished,
    transfers: result.transfers.map((transfer) => ({
      from: toLocalSeat(transfer.from, mySeat),
      to: toLocalSeat(transfer.to, mySeat),
      account: transfer.account as never,
      base: transfer.base,
      multiplier: transfer.multiplier,
      amount: transfer.amount,
      reason: transfer.reason,
    })),
    values: Object.fromEntries(
      Object.entries(result.values).map(([seat, value]) => [
        toLocalSeat(Number(seat), mySeat), convertHandValue(value),
      ]),
    ),
  }
}

function convertEvent(event: YtEventView, mySeat: number): GameEvent {
  return {
    id: event.id,
    seat: toLocalSeat(event.seat, mySeat),
    kind: event.kind,
    text: event.text,
    afterKong: event.afterKong,
    tile: tile(event.tile) ?? undefined,
    chicken: event.chicken ?? undefined,
    rush: event.rush ?? undefined,
  }
}

export function convertSnapshot(snapshot: YtSnapshot): GameState {
  const mySeat = snapshot.seat
  const view = snapshot.view
  const bySeat = new Map(view.players.map((player) => [player.seat, player]))
  const players: Player[] = [0, 1, 2, 3].map((localSeat) => {
    const serverSeat = (mySeat + localSeat) % 4
    const player = bySeat.get(serverSeat)
    if (!player) {
      return {
        name: `玩家${serverSeat + 1}`, hand: [], concealedTileCount: 0,
        melds: [], river: [], score: 0, declaration: 'none',
        draws: 0, discards: 0, drawn: null, afterKong: false,
        burned: false, passedHu: null, passedShape: null,
        chickenPeng: [], chickenDiscard: [],
      }
    }
    return convertPlayer(player, mySeat, Boolean(snapshot.roundResult))
  })
  const result = snapshot.roundResult
    ? convertSettlement(snapshot.roundResult, mySeat) : null
  const state: GameState = {
    remoteMatchId: snapshot.matchId ?? snapshot.roomId,
    players,
    wall: Array.from({ length: view.wallCount }, () => 0),
    dice: view.dice,
    wallSide: toLocalSeat(view.wallSide, mySeat),
    reservedStacks: view.reservedStacks,
    dealer: toLocalSeat(view.dealer, mySeat),
    current: toLocalSeat(view.current, mySeat),
    phase: view.phase === 'lobby' ? 'original' : view.phase,
    originalDecisions: rotate(view.originalDecisions, mySeat),
    pending: view.pending
      ? convertPending(view.pending, mySeat, view.ownOptions) : null,
    result,
    firstFixedDiscard: view.firstFixedDiscard.map(tileRequired),
    firstFixedPeng: view.firstFixedPeng,
    firstYaoDiscard: view.firstYaoDiscard,
    seenChickenDiscards: view.seenChickenDiscards.map(tileRequired),
    waitRemainingMs: rotate(view.waitRemainingMs, mySeat),
    events: view.events.map((event) => convertEvent(event, mySeat)),
    serial: view.serial,
    matchLength: view.matchLength,
    dealerRound: view.dealerRound,
    handNumber: view.handNumber,
    repeats: view.repeats,
  }
  if (snapshot.huWindow && !result) {
    retainHuWindow(state, 0, convertSnapshot({ ...snapshot, view: snapshot.huWindow, huWindow: null, roundResult: null }))
  }
  return state
}

/** 本地 Command → 服务端 action；座位由 WS 连接决定，不需要传 seat。 */
export function toActionPayload(command: Command): Record<string, unknown> {
  const value = command as {
    type: string
    index?: number
    declare?: boolean
    action?: string
    plan?: string
    deferHu?: boolean
    tile?: number
  }
  return {
    type: value.type,
    ...(value.index === undefined ? {} : { index: value.index }),
    ...(value.declare === undefined ? {} : { declare: value.declare }),
    ...(value.action === undefined ? {} : { action: value.action }),
    ...(value.plan === undefined ? {} : { plan: value.plan }),
    ...(value.deferHu === undefined ? {} : { deferHu: value.deferHu }),
    ...(value.tile === undefined ? {} : { tile: value.tile }),
  }
}
