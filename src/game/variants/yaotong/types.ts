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
  /** 全场第一次打出的该种鸡，横放标记。 */
  firstChicken?: boolean
  /** 本家首张跟冲的固定鸡（4分档），与首张一样横放。 */
  followChicken?: boolean
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
  /** 联机快照里他人手牌不透明时，仍用于 3D 牌背数量。 */
  concealedTileCount?: number
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
  /** Actual structural value at the last legal pass; scene bonuses alone cannot make a bigger hand. */
  passedShape?: number | null
  chickenPeng: Tile[]
  chickenDiscard: Tile[]
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
  /** Concealed tiles after the selected wildcard substitution (earth includes its fourth tile). */
  resolvedHand?: Tile[]
}
export interface WinContext {
  kind: WinKind
  tile: Tile
  chicken?: Tile | null
  killsReport?: boolean
  /** Required to distinguish first-draw 天胡 (dealer) from 地胡 (non-dealer). */
  isDealer?: boolean
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
  shapePoints?: number
}
export type ResponseAction = 'hu' | 'peng' | 'kong' | 'pass'
export interface Pending {
  kind: 'discard' | 'rob' | 'hot'
  tile: Tile
  from: Seat
  discard: Discard | null
  options: Record<Seat, ActionOptions>
  choices: Record<Seat, ResponseAction>
  huPlans?: Record<Seat, string>
  /** Expert seats that let play advance without explicitly declining this discard. */
  deferredHu?: Seat
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
  afterKong?: boolean
  id: number
  seat: Seat
  text: string
  kind: 'draw' | 'discard' | 'peng' | 'kong' | 'kong-intent' | 'hu' | 'ready' | 'penalty' | 'start'
  tile?: Tile
  chicken?: number
  rush?: Discard['stage']
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
  firstFixedDiscard: Tile[]
  firstFixedPeng: boolean
  firstYaoDiscard: boolean
  seenChickenDiscards: Tile[]
  waitRemainingMs: number[]
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
  | { type: 'respond'; action: ResponseAction; plan?: string; deferHu?: boolean }
  | { type: 'hu'; plan?: string }
  | { type: 'declareHu'; plan?: string }
  | { type: 'passHu' }
  | { type: 'kong'; tile: Tile }
