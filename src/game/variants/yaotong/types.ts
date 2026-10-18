/** 幺筒 v1.0: 0..8 万、9..17 筒、18..26 条。实体牌最多四张。 */
export type Tile = number
export type Seat = number
export type Declaration = 'none' | 'ready' | 'original'
export type WinKind = 'self' | 'discard' | 'rob' | 'hot' | 'ready'
export type KongKind = 'open' | 'turn' | 'stored' | 'added'

export interface Meld {
  tile: Tile
  kind: 'peng' | KongKind
  from?: Seat
  pre: boolean
  chicken: number
  responsibility: number
}
export interface Discard {
  tile: Tile
  chicken: number
  /** Captured before the discard: a kong rush can also occur inside the first-discard cycle. */
  pre?: boolean
  stage: 'normal' | 'pre' | 'first' | 'later' | 'hot'
  id: number
}
export interface Player {
  name: string
  hand: Tile[]
  melds: Meld[]
  river: Discard[]
  score: number
  declaration: Declaration
  draws: number
  discards: number
  drawn: Tile | null
  afterKong: boolean
  burned: boolean
  passedHu: number | null
  chickenPeng: boolean
  chickenDiscard: boolean
}
export interface Pattern {
  name: string
  points: number
}
export interface HandValue {
  h: number
  patternPoints: number
  patterns: Pattern[]
  naturalYaos: number
  winningYaoNatural: boolean
  wildcards: number
  big: boolean
  structure: 'standard' | 'pairs' | 'earth'
  groups: Tile[][]
}
export interface WinContext {
  kind: WinKind
  tile: Tile
  chicken?: Tile | null
  killsReport?: boolean
}
export interface Wait {
  tile: Tile
  values: HandValue[]
}
export interface ActionOptions {
  hu: boolean
  peng: boolean
  kong: boolean
  restrictedHu: boolean
  restrictedPeng: boolean
  mandatory: boolean
  h: number
}
export type ResponseAction = 'hu' | 'peng' | 'kong' | 'pass'
export interface Pending {
  kind: 'discard' | 'rob' | 'hot'
  tile: Tile
  from: Seat
  discard: Discard | null
  options: Record<Seat, ActionOptions>
  choices: Record<Seat, ResponseAction>
}
export type Account =
  | '胡牌分'
  | '鸡分'
  | '杠分'
  | '幺筒责任分'
  | '见面礼'
  | '杀报加分'
  | '一般包牌赔付'
  | '流局赔听款'
export interface Transfer {
  from: Seat
  to: Seat
  account: Account
  base: number
  multiplier: number
  amount: number
  reason: string
}
export interface Settlement {
  kind: 'win' | 'draw' | 'penalty'
  winners: Seat[]
  source: Seat | null
  winKind?: WinKind
  tile?: Tile
  offender?: Seat
  reason: string
  indicator: Tile | null
  chicken: Tile | null
  values: Record<Seat, HandValue>
  ready: boolean[]
  transfers: Transfer[]
  deltas: number[]
  nextDealer: Seat
  finished: boolean
}
export interface GameEvent {
  id: number
  seat: Seat
  text: string
  kind: 'draw' | 'discard' | 'peng' | 'kong' | 'kong-intent' | 'hu' | 'ready' | 'penalty' | 'start'
  tile?: Tile
}
export interface GameState {
  players: Player[]
  wall: Tile[]
  dice: [number, number]
  wallSide: Seat
  reservedStacks: number
  dealer: Seat
  current: Seat
  phase: 'original' | 'discard' | 'response' | 'transition' | 'settled'
  originalDecisions: boolean[]
  pending: Pending | null
  result: Settlement | null
  firstFixedDiscard: boolean
  firstFixedPeng: boolean
  firstYaoDiscard: boolean
  events: GameEvent[]
  serial: number
  matchLength: 4 | 8 | 16
  dealerRound: number
  handNumber: number
  repeats: number
}
export type Command =
  | { type: 'original'; declare: boolean }
  | { type: 'discard'; index: number; declare?: boolean }
  | { type: 'respond'; action: ResponseAction }
  | { type: 'hu' }
  | { type: 'kong'; tile: Tile }
