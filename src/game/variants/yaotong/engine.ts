import { discardWaits, huOpportunity, waits, isUntouchedFirstDraw } from './hands'
import { settle, legalHuPlans, huPlanKey, type Ending } from './settlement'
import { breakWall, countsOf, isChicken, isFixed, shuffledWall, sortHand, tileName, YAO } from './tiles'
import type { ActionOptions, Command, GameEvent, GameState, Player, Seat, Tile } from './types'
import { huWindow, retainHuWindow, takeHuWindow } from './huWindow'

type EventObserver = (state: GameState, event: GameEvent) => void
const eventObservers = new WeakMap<GameState, EventObserver>()
/** Recording is optional and failure-isolated; observers must not mutate the live state. */
export function observeGameEvents(state: GameState, observer: EventObserver) {
  eventObservers.set(state, observer)
  return () => { if (eventObservers.get(state) === observer) eventObservers.delete(state) }
}
function notifyEvent(state: GameState, value: GameEvent) {
  try { eventObservers.get(state)?.(state, value) } catch { /* Recording must never interrupt a hand. */ }
}

/** Optional presentation boundaries. Headless rules stay synchronous and deterministic. */
export type FlowStep =
  | 'first-draw'
  | 'next-draw'
  | 'after-peng'
  | 'after-open-kong'
  | 'before-rob'
  | 'between-robbers'
  | 'after-added-kong'
  | 'rob-win'
  | 'before-claim'
export type EngineFlow = (step: FlowStep, resume: () => void) => void
function advance(state: GameState, flow: EngineFlow | undefined, step: FlowStep, resume: () => void) {
  if (!flow) {
    resume()
    return
  }
  state.phase = 'transition'
  flow(step, resume)
}

export function makePlayer(name = '玩家'): Player {
  return {
    name,
    hand: [],
    melds: [],
    river: [],
    score: 0,
    declaration: 'none',
    draws: 0,
    discards: 0,
    drawn: null,
    afterKong: false,
    burned: false,
    passedHu: null,
    passedShape: null,
    chickenPeng: [],
    chickenDiscard: [],
  }
}
export interface StartOptions {
  length?: 4 | 8 | 16
  random?: () => number
  wall?: Tile[]
  dice?: [number, number]
  dealer?: number
}

export function createGame(options: StartOptions = {}): GameState {
  const random = options.random ?? Math.random
  const dice = options.dice ?? [1 + Math.floor(random() * 6), 1 + Math.floor(random() * 6)]
  const dealer = options.dealer ?? Math.floor(random() * 4)
  const input = options.wall ?? shuffledWall(random)
  if (
    input.length !== 108 ||
    countsOf(input).some((n) => n !== 4) ||
    input.some((t) => !Number.isInteger(t) || t < 0 || t > 26)
  )
    throw new Error('牌墙必须是108张三色序数牌，各四张')
  if (!dice.every((n) => Number.isInteger(n) && n >= 1 && n <= 6)) throw new Error('骰子须为1至6')
  const broken = breakWall(input, dice, dealer)
  const players = ['你', '听风', '观山', '望月'].map(makePlayer)
  // 三轮每家四张，再各一张；庄家不跳牌。
  for (let batch = 0; batch < 4; batch++)
    for (let offset = 0; offset < 4; offset++) {
      players[(dealer + offset) % 4].hand.push(...broken.wall.splice(0, batch === 3 ? 1 : 4))
    }
  players.forEach((p) => sortHand(p.hand))
  const state: GameState = {
    players,
    wall: broken.wall,
    dice,
    wallSide: broken.side,
    reservedStacks: broken.reserved,
    dealer,
    current: dealer,
    phase: 'original',
    originalDecisions: [false, false, false, false],
    pending: null,
    result: null,
    firstFixedDiscard: [],
    firstFixedPeng: false,
    firstYaoDiscard: false,
    seenChickenDiscards: [],
    waitRemainingMs: [15000, 15000, 15000, 15000],
    events: [],
    serial: 0,
    matchLength: options.length ?? 4,
    dealerRound: 1,
    handNumber: 1,
    repeats: 0,
  }
  event(state, dealer, 'start', dice[0] === dice[1] ? '同点双倍 · 本局全部分数 ×2' : '新局开桌 · 原报确认')
  return state
}

function event(
  state: GameState,
  seat: Seat,
  kind: GameEvent['kind'],
  text: string,
  tile?: Tile,
  details?: Pick<GameEvent, 'chicken' | 'rush' | 'afterKong'>,
  notify = true,
) {
  const value = { id: ++state.serial, seat, kind, text, tile, ...details }
  state.events.push(value)
  if (state.events.length > 80) state.events.shift()
  if (notify) notifyEvent(state, value)
  return value
}

function finish(state: GameState, ending: Ending) {
  state.result = settle(state, ending)
  state.players.forEach((p, i) => (p.score += state.result!.deltas[i]))
  state.phase = 'settled'
  state.pending = null
  event(
    state,
    ending.offender ?? ending.winners?.[0] ?? state.dealer,
    ending.kind === 'penalty' ? 'penalty' : ending.kind === 'win' ? 'hu' : 'start',
    ending.kind === 'penalty'
      ? `包牌 · ${ending.reason}`
      : ending.kind === 'draw'
        ? '荒庄 · 赔听结算'
        : ending.winners!.length > 1
          ? '一炮多响'
          : ending.winKind === 'self'
            ? '自摸'
            : ending.winKind === 'rob'
              ? '抢杠胡'
              : ending.winKind === 'hot'
                ? '接热炮'
                : '胡牌',
    ending.tile,
  )
}
const penalty = (state: GameState, offender: Seat, reason: string) =>
  finish(state, { kind: 'penalty', offender, reason })

function draw(state: GameState, seat: Seat, tail = false) {
  if (!state.wall.length) {
    finish(state, { kind: 'draw' })
    return
  }
  const p = state.players[seat]
  sortHand(p.hand)
  const tile = tail ? state.wall.pop()! : state.wall.shift()!
  p.hand.push(tile)
  p.drawn = tile
  p.draws++
  p.passedHu = null
  p.passedShape = null
  p.chickenPeng = []
  p.chickenDiscard = []
  p.afterKong = tail
  state.current = seat
  state.phase = 'discard'
  event(state, seat, 'draw', tail ? '杠后补摸' : '摸牌')
}

export function selfOptions(state: GameState, seat: Seat): ActionOptions {
  const empty: ActionOptions = {
    hu: false,
    peng: false,
    kong: false,
    restrictedHu: false,
    restrictedPeng: false,
    mandatory: false,
    h: 0,
  }
  if (state.phase !== 'discard' || state.current !== seat) return empty
  const p = state.players[seat]
  // A peng creates a discard turn, not a self-draw win opportunity.
  if (p.drawn === null) return empty
  const killsReport = state.players.some((other, i) => i !== seat && other.declaration !== 'none')
  const opportunity = huOpportunity(p, { kind: 'self', tile: p.drawn, killsReport, isDealer: seat === state.dealer })
  return {
    ...empty,
    hu: opportunity.hu,
    h: opportunity.h,
    shapePoints: opportunity.shapePoints,
    restrictedHu: opportunity.restricted,
    mandatory: opportunity.hu && !opportunity.restricted && killsReport,
  }
}

export function kongOptions(state: GameState, seat: Seat): Tile[] {
  if (state.phase !== 'discard' || state.current !== seat || !state.wall.length) return []
  const p = state.players[seat]
  if (p.declaration !== 'none') return []
  const counts = countsOf(p.hand)
  return counts.flatMap((n, t) =>
    n === 4 || (n > 0 && p.melds.some((m) => m.kind === 'peng' && m.tile === t)) ? [t] : [],
  )
}

function passSelf(state: GameState, seat: Seat): boolean {
  const options = selfOptions(state, seat)
  if (options.mandatory) {
    penalty(state, seat, '可杀报却放弃胡牌')
    return false
  }
  if (options.hu && !options.restrictedHu) {
    state.players[seat].passedHu = Math.max(state.players[seat].passedHu ?? 0, options.h)
    state.players[seat].passedShape = Math.max(state.players[seat].passedShape ?? 0, options.shapePoints ?? 0)
  }
  return true
}

function closeHuWindow(state: GameState) {
  const entry = takeHuWindow(state)
  if (!entry) return true
  const pending = entry.snapshot.pending!
  if (state.pending?.deferredHu === entry.seat) delete state.pending.deferredHu
  const options = pending.options[entry.seat]
  if (options.mandatory) {
    penalty(state, entry.seat, state.players[pending.from].declaration !== 'none'
      ? '可杀报却放弃胡牌' : '手中有幺筒却未抢杠／接热炮')
    return false
  }
  const p = state.players[entry.seat]
  // A real draw has already cleared the previous turn's restriction.
  if (!options.restrictedHu && p.draws === entry.snapshot.players[entry.seat].draws) {
    p.passedHu = Math.max(p.passedHu ?? 0, options.h)
    p.passedShape = Math.max(p.passedShape ?? 0, options.shapePoints ?? 0)
  }
  return true
}

function offerResponses(state: GameState, flow?: EngineFlow) {
  const pending = state.pending!
  for (let offset = 1; offset < 4; offset++) {
    const seat = (pending.from + offset) % 4
    const p = state.players[seat]
    const n = p.hand.filter((t) => t === pending.tile).length
    const killsReport = state.players[pending.from].declaration !== 'none'
    const opportunity = huOpportunity(
      { ...p, hand: [...p.hand, pending.tile] },
      { kind: pending.kind, tile: pending.tile, killsReport },
    )
    const h = opportunity.h
    const peng = pending.kind !== 'rob' && p.declaration === 'none' && n >= 2
    const kong = pending.kind !== 'rob' && p.declaration === 'none' && n >= 3 && state.wall.length > 0
    const restrictedHu = opportunity.restricted
    if (h || peng || kong)
      pending.options[seat] = {
        hu: h > 0,
        peng,
        kong,
        h,
        shapePoints: opportunity.shapePoints,
        restrictedHu,
        restrictedPeng: peng && p.chickenDiscard.includes(pending.tile),
        mandatory:
          h > 0 &&
          !restrictedHu &&
          (killsReport || ((pending.kind === 'rob' || pending.kind === 'hot') && p.hand.includes(YAO))),
      }
  }
  state.phase = 'response'
  if (!Object.keys(pending.options).length) resolveResponses(state, flow)
}

function removeTiles(p: Player, tile: Tile, count: number) {
  for (let n = 0; n < count; n++) {
    const index = p.hand.indexOf(tile)
    if (index < 0) throw new Error('内部牌张数量错误')
    p.hand.splice(index, 1)
  }
}

function resolveResponses(state: GameState, flow?: EngineFlow) {
  const pending = state.pending!
  const winners = Object.entries(pending.choices)
    .filter(([, c]) => c === 'hu')
    .map(([seat]) => Number(seat))
  if (winners.length) {
    const end = () => {
      if (pending.kind === 'rob') removeTiles(state.players[pending.from], pending.tile, 1)
      else state.players[pending.from].river.pop()
      for (const seat of winners) state.players[seat].hand.push(pending.tile)
      if (pending.kind === 'hot' || pending.kind === 'rob') state.players[pending.from].burned = true
      finish(state, {
        kind: 'win',
        winners,
        source: pending.from,
        winKind: pending.kind,
        tile: pending.tile,
        responsibility: pending.tile === YAO ? (pending.discard?.chicken ?? 0) : 0,
        huPlans: pending.huPlans,
      })
    }
    if (pending.kind === 'rob') advance(state, flow, 'rob-win', end)
    else end()
    return
  }
  if (pending.deferredHu !== undefined) retainHuWindow(state, pending.deferredHu)
  if (pending.kind === 'rob') {
    const p = state.players[pending.from]
    removeTiles(p, pending.tile, 1)
    const meld = p.melds.find((m) => m.tile === pending.tile && m.kind === 'peng')!
    meld.kind = 'added'
    meld.chicken = pending.tile === YAO ? (meld.pre ? 120 : 60) : isFixed(pending.tile) ? 10 : 0
    state.pending = null
    event(state, pending.from, 'kong', '补杠', pending.tile)
    advance(state, flow, 'after-added-kong', () => draw(state, pending.from, true))
    return
  }
  const claimant = [1, 2, 3]
    .map((i) => (pending.from + i) % 4)
    .find((seat) => ['peng', 'kong'].includes(pending.choices[seat]))
  state.pending = null
  if (claimant !== undefined) {
    const p = state.players[claimant]
    const kong = pending.choices[claimant] === 'kong'
    removeTiles(p, pending.tile, kong ? 3 : 2)
    state.players[pending.from].river.pop()
    const pre = pending.discard!.pre ?? pending.discard!.stage === 'pre'
    const chicken =
      pending.tile === YAO
        ? (pre ? 30 : 15) * (kong ? 4 : 3)
        : isFixed(pending.tile)
          ? kong
            ? 10
            : state.firstFixedPeng
              ? 6
              : 8
          : 0
    p.melds.push({
      tile: pending.tile,
      kind: kong ? 'open' : 'peng',
      from: pending.from,
      pre,
      chicken,
      responsibility: pending.tile === YAO ? (pre ? 30 : 20) : 0,
    })
    if (!kong && isFixed(pending.tile)) state.firstFixedPeng = true
    p.drawn = null
    p.afterKong = false
    if (!kong && isChicken(pending.tile)) p.chickenPeng.push(pending.tile)
    state.current = claimant
    state.phase = 'discard'
    event(state, claimant, kong ? 'kong' : 'peng', kong ? '明杠' : '碰', pending.tile)
    if (kong) advance(state, flow, 'after-open-kong', () => draw(state, claimant, true))
    else
      advance(state, flow, 'after-peng', () => {
        state.phase = 'discard'
      })
  } else advance(state, flow, 'next-draw', () => draw(state, (pending.from + 1) % 4))
}

/** Invalid basic inputs do not mutate state; explicit expert declarations are judged for penalties. */
export function act(state: GameState, seat: Seat, command: Command, flow?: EngineFlow): boolean {
  if (!Number.isInteger(seat) || seat < 0 || seat > 3 || state.phase === 'settled') return false
  const p = state.players[seat]
  if (command.type === 'declareHu' || command.type === 'passHu') {
    const previous = huWindow(state, seat)
    if (previous) {
      if (command.type === 'passHu') { closeHuWindow(state); return true }
      const old = previous.pending!
      if (command.plan && !legalHuPlans({ ...previous.players[seat], hand: [...previous.players[seat].hand, old.tile] }, {
        kind: old.kind, tile: old.tile, isDealer: seat === previous.dealer,
        killsReport: previous.players[old.from].declaration !== 'none',
      }).some(value => huPlanKey(value) === command.plan)) return false
      // Hu outranks a provisional draw/peng. Restore the exact pre-claim hands and
      // wall, while preserving the spent wait budget and the event sequence.
      takeHuWindow(state)
      const { events, serial, waitRemainingMs } = state
      Object.assign(state, previous, { events, serial, waitRemainingMs })
      return act(state, seat, { type: 'respond', action: 'hu', plan: command.plan }, flow)
    }
    if (state.phase === 'discard' && state.current === seat) {
      if (command.type === 'passHu') { passSelf(state, seat); return true }
      if (selfOptions(state, seat).hu) return act(state, seat, { type: 'hu', plan: command.plan }, flow)
    }
    const pending = state.pending
    if (pending && pending.from !== seat && (state.phase === 'response' || state.phase === 'transition')) {
      if (pending.choices[seat] === 'hu') return false // Ignore a repeated tap on the same declaration.
      if (state.phase === 'transition' && !pending.choices[seat]) {
        const opportunity = huOpportunity({ ...p, hand: [...p.hand, pending.tile] }, {
          kind: pending.kind, tile: pending.tile, killsReport: state.players[pending.from].declaration !== 'none',
        })
        if (opportunity.hu) offerResponses(state, flow)
      }
      if (state.phase === 'response' && pending.options[seat] && !pending.choices[seat]) {
        if (command.type === 'passHu') return act(state, seat, { type: 'respond', action: 'pass' }, flow)
        if (pending.options[seat].hu) return act(state, seat, { type: 'respond', action: 'hu', plan: command.plan }, flow)
      }
    }
    if (command.type === 'passHu') return false // Cancelling 等 without a legal opportunity is not a foul.
    penalty(state, seat, '炸胡：当前没有可声明的胡牌机会')
    return true
  }
  if (command.type === 'original') {
    if (state.phase !== 'original' || state.originalDecisions[seat]) return false
    if (command.declare && !waits(p).length) return false
    state.originalDecisions[seat] = true
    if (command.declare) {
      p.declaration = 'original'
      event(state, seat, 'ready', '原报 · 锁定听口')
    }
    if (state.originalDecisions.every(Boolean))
      advance(state, flow, 'first-draw', () => draw(state, state.dealer))
    return true
  }
  if (command.type === 'respond') {
    const pending = state.pending
    if (state.phase !== 'response' || !pending || pending.choices[seat]) return false
    const options = pending.options[seat]
    if (!options || (command.action !== 'pass' && !options[command.action])) return false
    if (command.action === 'hu' && command.plan && !legalHuPlans({ ...p, hand: [...p.hand, pending.tile] }, {
      kind: pending.kind, tile: pending.tile, isDealer: seat === state.dealer,
      killsReport: state.players[pending.from].declaration !== 'none',
    }).some(v => huPlanKey(v) === command.plan)) return false
    if (command.action === 'hu' && options.restrictedHu) {
      penalty(state, seat, '违反过手胡限制')
      return true
    }
    const defer = command.action === 'pass' && command.deferHu && pending.kind !== 'rob' && options.hu
    if (command.action !== 'hu' && options.mandatory && !defer) {
      penalty(
        state,
        seat,
        state.players[pending.from].declaration !== 'none'
          ? '可杀报却放弃胡牌'
          : '手中有幺筒却未抢杠／接热炮',
      )
      return true
    }
    if (command.action === 'peng' && options.restrictedPeng) {
      penalty(state, seat, '同巡打鸡后碰鸡')
      return true
    }
    if (command.action !== 'hu' && options.hu && !options.restrictedHu && !defer) {
      p.passedHu = Math.max(p.passedHu ?? 0, options.h)
      p.passedShape = Math.max(p.passedShape ?? 0, options.shapePoints ?? 0)
    }
    pending.choices[seat] = command.action
    if (defer) { pending.deferredHu = seat; retainHuWindow(state, seat) }
    if (command.action === 'hu' && command.plan) (pending.huPlans ??= {})[seat] = command.plan
    if (Object.keys(pending.options).every((i) => pending.choices[Number(i)])) {
      const choices = Object.values(pending.choices)
      if (!choices.includes('hu') && (pending.kind === 'rob' || choices.some(choice => choice === 'peng' || choice === 'kong')))
        advance(state, flow, 'before-claim', () => resolveResponses(state, flow))
      else resolveResponses(state, flow)
    }
    else if (pending.kind === 'rob')
      advance(state, flow, 'between-robbers', () => {
        state.phase = 'response'
      })
    return true
  }
  if (state.phase !== 'discard' || state.current !== seat) return false
  if (command.type === 'hu') {
    const options = selfOptions(state, seat)
    if (!options.hu) return false
    if (command.plan && !legalHuPlans(p, { kind: 'self', tile: p.drawn!, isDealer: seat === state.dealer,
      killsReport: state.players.some((other, i) => i !== seat && other.declaration !== 'none'),
    }).some(v => huPlanKey(v) === command.plan)) return false
    if (options.restrictedHu) penalty(state, seat, '违反过手胡限制')
    else finish(state, { kind: 'win', winners: [seat], winKind: 'self', tile: p.drawn!,
      huPlans: command.plan ? { [seat]: command.plan } : undefined })
    return true
  }
  if (command.type === 'kong') {
    if (!kongOptions(state, seat).includes(command.tile)) return false
    if (!passSelf(state, seat)) return true
    const meld = p.melds.find((m) => m.kind === 'peng' && m.tile === command.tile)
    if (meld) {
      if (!closeHuWindow(state)) return true
      state.pending = { kind: 'rob', tile: command.tile, from: seat, discard: null, options: {}, choices: {} }
      if (flow) event(state, seat, 'kong-intent', '宣告补杠', command.tile)
      advance(state, flow, 'before-rob', () => offerResponses(state, flow))
    } else {
      const kind = p.drawn === command.tile ? 'turn' : 'stored'
      removeTiles(p, command.tile, 4)
      p.melds.push({
        tile: command.tile,
        kind,
        pre: false,
        responsibility: 0,
        chicken: command.tile === YAO ? 60 : isFixed(command.tile) ? 10 : 0,
      })
      event(state, seat, 'kong', kind === 'turn' ? '转弯杠' : '存杠', command.tile)
      draw(state, seat, true)
    }
    return true
  }
  if (
    command.type !== 'discard' ||
    !Number.isInteger(command.index) ||
    command.index < 0 ||
    command.index >= p.hand.length
  )
    return false
  if (p.declaration !== 'none' && (p.drawn === null || command.index !== p.hand.length - 1)) return false
  if (
    command.declare &&
    (p.declaration !== 'none' ||
      !isUntouchedFirstDraw(p) ||
      !discardWaits(p).some((o) => o.index === command.index))
  )
    return false
  if (!closeHuWindow(state) || !passSelf(state, seat)) return true
  const tile = p.hand[command.index]
  const illegalChickenDiscard = p.chickenPeng.includes(tile)
  const pre = state.players.some((player) => player.discards === 0)
  let chicken = 0
  let stage: 'normal' | 'pre' | 'first' | 'later' | 'hot' = 'normal'
  if (tile === YAO) {
    stage = p.afterKong ? 'hot' : pre ? 'pre' : state.firstYaoDiscard ? 'later' : 'first'
    chicken = { hot: 100, pre: 30, first: 20, later: 15, normal: 0 }[stage]
    if (stage === 'first') state.firstYaoDiscard = true
  } else if (isFixed(tile)) {
    chicken = !state.firstFixedDiscard.includes(tile) || p.discards === 0 ? 4 : 2
    if (!state.firstFixedDiscard.includes(tile)) state.firstFixedDiscard.push(tile)
  }
  const hot = p.afterKong
  p.hand.splice(command.index, 1)
  sortHand(p.hand)
  p.discards++
  p.drawn = null
  p.afterKong = false
  if (isChicken(tile)) p.chickenDiscard.push(tile)
  const discardedEvent = event(
    state,
    seat,
    'discard',
    tile === YAO
      ? `${{ pre: '预冲', first: '首冲', later: '后冲', hot: '杠冲', normal: '' }[stage]}幺筒 · ${chicken}`
      : `打出${tileName(tile)}`,
    tile,
    { chicken, rush: stage, afterKong: hot },
    false,
  )
  const firstChicken = isChicken(tile) && !state.seenChickenDiscards.includes(tile)
  if (firstChicken) state.seenChickenDiscards.push(tile)
  // The player's first fixed-chicken discard on an already-chonged kind also scores 4; mark it
  // separately so the river can show it sideways without pretending the global first tile returned.
  const followChicken = isFixed(tile) && chicken === 4 && !firstChicken
  const discard = { tile, chicken, stage, pre, id: state.serial, firstChicken, followChicken }
  p.river.push(discard)
  notifyEvent(state, discardedEvent)
  // Judge the actual discard before opening responses. Listening status for B is now unambiguous.
  if (illegalChickenDiscard) {
    penalty(state, seat, '同巡碰鸡后打鸡')
    return true
  }
  if (command.declare) {
    p.declaration = 'ready'
    event(state, seat, 'ready', '报听 · 锁定听口')
  }
  state.pending = { kind: hot ? 'hot' : 'discard', tile, from: seat, discard, options: {}, choices: {} }
  offerResponses(state, flow)
  return true
}

export function continueGame(
  state: GameState,
  options: Pick<StartOptions, 'random' | 'wall' | 'dice'> = {},
): GameState {
  if (!state.result || state.result.finished) return state
  const next = createGame({ ...options, length: state.matchLength, dealer: state.result.nextDealer })
  const same = next.dealer === state.dealer
  next.dealerRound = state.dealerRound + +!same
  next.repeats = same ? state.repeats + 1 : 0
  next.handNumber = state.handNumber + 1
  next.players.forEach((p, i) => {
    p.score = state.players[i].score
    p.name = state.players[i].name
  })
  return next
}
