import { evaluateHand, passAllows, waits } from './hands'
import { countsOf, isFixed, nextTile, tileName, YAO } from './tiles'
import type {
  Account,
  GameState,
  HandValue,
  Player,
  Seat,
  Settlement,
  Tile,
  Transfer,
  WinKind,
} from './types'

export interface Ending {
  kind: Settlement['kind']
  winners?: Seat[]
  source?: Seat | null
  winKind?: WinKind
  tile?: Tile
  offender?: Seat
  reason?: string
  responsibility?: number
}

export function readyInfo(player: Player) {
  const options = waits(player)
  let values = options.flatMap((w) =>
    w.values.map((value) => ({
      value,
      natural: value.naturalYaos - +(w.tile === YAO && value.winningYaoNatural),
    })),
  )
  if (player.hand.length === 14 - player.melds.length * 3) {
    values = evaluateHand(player, { kind: 'ready', tile: player.drawn ?? player.hand.at(-1)! }).map(
      (value) => ({ value, natural: value.naturalYaos }),
    )
  }
  return {
    ready: values.length > 0,
    price: Math.max(5, ...values.map(({ value }) => value.patternPoints)),
    natural: Math.max(0, ...values.map((v) => v.natural)),
    values: values.map((v) => v.value),
  }
}

/** All entries retain their payer and account. Dice are applied exactly once at this boundary. */
export function ledger(dice: [number, number]) {
  const transfers: Transfer[] = []
  const multiplier = dice[0] === dice[1] ? 2 : 1
  const add = (from: Seat, to: Seat, account: Account, base: number, reason: string) => {
    if (base > 0 && from !== to)
      transfers.push({ from, to, account, base, multiplier, amount: base * multiplier, reason })
  }
  return { transfers, add }
}

export function ownedTiles(player: Player, exposedOnly = false): Tile[] {
  return [
    ...(exposedOnly ? [] : player.hand),
    ...player.melds.flatMap((m) => Array(m.kind === 'peng' ? 3 : 4).fill(m.tile)),
    ...player.river.map((d) => d.tile),
  ]
}

/** A meld/discard uses one tariff, never base + peng + kong piled onto the same tiles. */
export function chickenValue(
  player: Player,
  naturalYaos: number,
  flipped: Tile | null,
  exposedOnly = false,
): number {
  const valueByTile = Array<number>(27).fill(0)
  if (!exposedOnly) {
    for (const tile of player.hand) {
      if (isFixed(tile)) valueByTile[tile] += 2
      else if (tile === flipped && tile !== YAO) valueByTile[tile]++
    }
    valueByTile[YAO] += naturalYaos * 10
  }
  for (const d of player.river)
    valueByTile[d.tile] += isFixed(d.tile) || d.tile === YAO ? d.chicken : +(d.tile === flipped)
  for (const m of player.melds)
    valueByTile[m.tile] +=
      isFixed(m.tile) || m.tile === YAO ? m.chicken : m.tile === flipped ? (m.kind === 'peng' ? 3 : 4) : 0
  if (flipped !== null) {
    if (countsOf(ownedTiles(player, exposedOnly))[flipped] === 4)
      valueByTile[flipped] += flipped === YAO ? 10 : isFixed(flipped) ? 2 : 1
    if (flipped === YAO || isFixed(flipped)) valueByTile[flipped] *= 3
  }
  return valueByTile.reduce((a, b) => a + b, 0)
}

export function nextDealer(
  state: GameState,
  result: Pick<Settlement, 'kind' | 'winners' | 'source' | 'ready'>,
) {
  if (result.kind === 'penalty') return state.dealer
  if (result.winners.length === 1) return result.winners[0]
  if (result.winners.length > 1) return result.source!
  const notReady = result.ready.flatMap((ready, i) => (ready ? [] : [i]))
  return notReady.length === 1 ? notReady[0] : state.dealer
}

export function settle(state: GameState, ending: Ending): Settlement {
  const { players } = state
  const winners = ending.winners ?? []
  const source = ending.source ?? null
  // Flipping consumes the actual head tile, and can never fabricate a tile from a river.
  const indicator = ending.kind === 'win' && state.wall.length ? state.wall.shift()! : null
  const chicken = indicator === null ? null : nextTile(indicator)
  const info = players.map(readyInfo)
  const ready = info.map((i, seat) => i.ready || winners.includes(seat))
  const values: Record<number, HandValue> = {}
  const { transfers, add } = ledger(state.dice)
  const others = (seat: Seat) => [0, 1, 2, 3].filter((i) => i !== seat)

  if (ending.kind === 'penalty') {
    const b = Math.max(45, ...info.filter((i) => i.ready).map((i) => i.price))
    for (const to of others(ending.offender!))
      add(ending.offender!, to, '一般包牌赔付', b, ending.reason ?? '违反行为规则')
  } else {
    for (const winner of winners) {
      const candidates = evaluateHand(players[winner], {
        kind: ending.winKind!,
        tile: ending.tile!,
        chicken,
        killsReport: (ending.winKind === 'self' ? others(winner) : [source!]).some(
          (seat) => players[seat].declaration !== 'none',
        ),
      }).filter((v) => passAllows(players[winner], v.h))
      const fan = chicken === YAO ? 3 : 1
      const payers = ending.winKind === 'self' ? others(winner) : [source!]
      // High-point selection includes chicken and the winning tile's individual responsibility.
      const gain = (v: HandValue) =>
        v.h * payers.length +
        v.naturalYaos * 10 * fan * 3 +
        (v.winningYaoNatural ? (ending.responsibility ?? 0) * (fan - 1) : 0)
      const value = candidates.sort((a, b) => gain(b) - gain(a) || b.h - a.h)[0]
      if (!value) throw new Error('结算收到不合法的胡牌方案')
      values[winner] = value
      info[winner].natural = value.naturalYaos
      for (const from of payers) {
        add(from, winner, '胡牌分', value.h, value.patterns.map((p) => p.name).join('＋') || '鸡胡')
        if (players[from].declaration !== 'none')
          add(
            from,
            winner,
            '杀报加分',
            players[from].declaration === 'original' ? 40 : 20,
            players[from].declaration === 'original' ? '杀原报' : '杀报听',
          )
      }
      if (ending.tile === YAO && source !== null && ending.responsibility) {
        add(
          source,
          winner,
          '幺筒责任分',
          ending.responsibility * (value.winningYaoNatural ? fan : 1),
          value.winningYaoNatural ? '胡入幺筒作本牌' : '胡入幺筒作癞子',
        )
      }
    }

    const exposed = players.map((p) => chickenValue(p, 0, chicken, true))
    if (ending.kind === 'draw') {
      for (let from = 0; from < 4; from++)
        if (!ready[from]) {
          for (let to = 0; to < 4; to++)
            if (ready[to]) {
              add(from, to, '流局赔听款', info[to].price, '赔听牌型价（不加基础5）')
              add(from, to, '鸡分', exposed[from], '未听者赔露出鸡')
            }
        }
    } else {
      const collected = players.map((p, i) => (p.burned ? 0 : chickenValue(p, info[i].natural, chicken)))
      for (let owner = 0; owner < 4; owner++) {
        for (const other of others(owner)) {
          if (ready[owner])
            add(
              other,
              owner,
              '鸡分',
              collected[owner],
              `${players[owner].name}的鸡分${players[owner].burned ? '（烧鸡）' : ''}`,
            )
          else if (ready[other])
            add(owner, other, '鸡分', exposed[owner], `${players[owner].name}未听，赔露出鸡`)
        }
      }
    }

    for (let owner = 0; owner < 4; owner++) {
      const p = players[owner]
      for (const m of p.melds) {
        if (ending.kind === 'win' && m.responsibility && m.from !== undefined) {
          const amount = m.responsibility * (chicken === YAO ? 3 : 1)
          if (ready[owner]) add(m.from, owner, '幺筒责任分', amount, '碰杠责任继承')
          else if (!ready[owner] && ready[m.from])
            add(owner, m.from, '幺筒责任分', amount, '未听，反赔对应责任家')
        }
        if (m.kind === 'peng' || m.kind === 'stored') continue
        for (const from of m.kind === 'open' ? [m.from!] : others(owner)) {
          add(
            from,
            owner,
            '杠分',
            m.tile === YAO ? 20 : 5,
            `${tileName(m.tile)}${({ open: '明杠', turn: '转弯杠', added: '补杠' } as const)[m.kind]}`,
          )
        }
      }
      if (countsOf(ownedTiles(p))[YAO] === 4) {
        const bao =
          winners.includes(owner) &&
          source !== null &&
          ending.tile === YAO &&
          p.melds.some((m) => m.tile === YAO && m.kind === 'peng')
        if (bao) add(source!, owner, '见面礼', 300, '放炮家包三份见面礼')
        else for (const from of others(owner)) add(from, owner, '见面礼', 100, '结算仍归本人四张幺筒')
      }
    }
  }
  const deltas = [0, 0, 0, 0]
  for (const t of transfers) {
    deltas[t.from] -= t.amount
    deltas[t.to] += t.amount
  }
  const result: Settlement = {
    ...ending,
    winners,
    source,
    reason: ending.reason ?? (ending.kind === 'draw' ? '牌墙摸空，荒庄赔听' : '胡牌结算'),
    indicator,
    chicken,
    values,
    ready,
    transfers,
    deltas,
    nextDealer: state.dealer,
    finished: false,
  }
  result.nextDealer = nextDealer(state, result)
  result.finished = result.nextDealer !== state.dealer && state.dealerRound === state.matchLength
  return result
}
