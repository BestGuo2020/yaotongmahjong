import { selfOptions } from './engine'
import { isChicken } from './tiles'
import type { Command, GameState } from './types'

export type YaotongMode = 'easy' | 'hard'
export const YAOTONG_MODES = {
  easy: {
    name: '新手模式',
    summary: '系统辅助 · 防止违规',
    description: '系统辅助防违规，安心熟悉规则。',
    detail: '自动拦截过手胡、同巡碰打鸡等违规操作；必须胡牌时，仅保留胡牌选择。',
  },
  hard: {
    name: '老手模式',
    summary: '自主判断 · 违规包牌',
    description: '自主判断操作，违规按规则包牌。',
    detail: '常驻等，每小局累计15秒；暂停后自主选择胡或过，用完后常驻胡。炸胡、过手等违规按规则包牌。',
  },
} as const

export const NO_PROTECTION = { hu: '', peng: '', kong: '', pass: '', discards: [] as number[] }

/** Only assists the human input boundary; scoring and opponent rules remain unchanged. */
export function actionProtection(state: GameState, seat = 0) {
  const player = state.players[seat]
  const response = state.phase === 'response' && !state.pending?.choices[seat]
    ? state.pending?.options[seat] : undefined
  const ownTurn = state.phase === 'discard' && state.current === seat
  const options = response ?? selfOptions(state, seat)
  const mandatory = options.mandatory ? '本次必须胡牌，系统已拦截其他操作' : ''
  let peng = options.restrictedPeng ? '本巡已打鸡，系统已拦截碰鸡' : ''
  if (response?.peng && state.pending) {
    const rest = [...player.hand]
    for (let i = 0; i < 2; i++) rest.splice(rest.indexOf(state.pending.tile), 1)
    if (rest.every(t => player.chickenPeng.includes(t) || (isChicken(state.pending!.tile) && t === state.pending!.tile)))
      peng = '碰牌后将只能打同种鸡，系统已拦截此次碰牌'
  }
  return {
    hu: options.restrictedHu ? '过手胡尚未解除，系统已拦截胡牌' : '',
    peng: mandatory || peng,
    kong: mandatory,
    pass: mandatory,
    discards: ownTurn ? player.hand.flatMap((tile, index) =>
      mandatory || player.chickenPeng.includes(tile) ? [index] : []) : [],
  }
}

export function protectionReason(protection: typeof NO_PROTECTION, command: Command): string {
  if (command.type === 'respond') return protection[command.action]
  if (command.type === 'hu' || command.type === 'kong') return protection[command.type]
  if (command.type === 'discard' && protection.discards.includes(command.index))
    return protection.pass || '本巡已碰鸡，系统已拦截打鸡'
  return ''
}
