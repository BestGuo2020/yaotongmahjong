import type { NO_PROTECTION } from './mode'
import type { GameState } from './types'

export interface YaotongHint {
  id: string
  protection: boolean
  summary: string
  reason: string
  action: string
  release?: string
}

/** Explain current choices only; never infer advice from opponents' concealed hands. */
export function yaotongGuidance(
  state: GameState,
  protection: typeof NO_PROTECTION,
  options: { original: boolean; canDeclare: boolean; declarationArmed: boolean },
): YaotongHint[] {
  const hints: YaotongHint[] = []
  const player = state.players[0]
  const ownTurn = state.phase === 'discard' && state.current === 0
  if (player.followDealer && state.phase !== 'settled') hints.push({
    id: 'follow-dealer', protection: false, summary: '跟庄成立，已取得胡牌通行证',
    reason: '首圈四家跟打同牌，庄家承担跟庄赔付；这四张跟牌不再参与结算计分。',
    action: '本局鸡胡也可接普通点炮，仍须成胡并遵守过手规则。',
  })
  const response = state.phase === 'response' && !state.pending?.choices[0]
    ? state.pending?.options[0] : undefined
  if (protection.pass) {
    const killsReport = response
      ? state.players[state.pending!.from].declaration !== 'none'
      : state.players.some((other, seat) => seat !== 0 && other.declaration !== 'none')
    hints.push({
      id: killsReport ? 'must-kill' : `must-${state.pending!.kind}`,
      protection: true,
      summary: killsReport ? '可杀报，本次必须胡牌' : state.pending?.kind === 'rob' ? '持幺筒，必须抢杠胡' : '持幺筒，必须接热炮',
      reason: killsReport
        ? '已有玩家原报或报听，你本次合法胡牌可以完成「杀报」。按规则必须胡牌，放弃会被判包牌。'
        : `你手中有幺筒，且本次可以合法${state.pending?.kind === 'rob' ? '抢杠胡' : '接热炮'}。按规则不能放弃，否则会被判包牌。`,
      action: '请点击「胡」确认。系统已拦截其他操作，不会替你自动胡牌。',
    })
  } else {
    if (protection.hu) hints.push({
      id: 'passed-hu', protection: true, summary: '过手中，暂时不能胡',
      reason: '你此前放弃过合法胡牌，现在仍受过手限制；本次尚不满足变大牌例外。',
      action: '请继续选择当前可用的操作，系统已拦截这次胡牌。',
      release: '下次实际摸牌后解除。若此前牌型变大，胡牌总分达到45分且高于上次可胡分数，系统也会按规则恢复胡牌选择。',
    })
    if (protection.peng) hints.push(response?.restrictedPeng ? {
      id: 'chicken-discard', protection: true, summary: '本巡已打鸡，不能碰鸡',
      reason: '你本巡已经打出鸡牌，同一巡内不能再碰鸡牌；只限制同一种鸡牌，其他种类可以正常操作。',
      action: '请选择「过」或其他仍可用的操作，系统已拦截碰鸡。',
      release: '下次实际摸牌后解除。这里的鸡牌指一万、一条、八筒和幺筒。',
    } : {
      id: 'no-safe-discard', protection: true, summary: '碰后没有安全弃牌',
      reason: '本次碰牌后只剩同种鸡牌可直接打出，会碰到同巡碰鸡后不能打鸡的限制。',
      action: '请选择「过」或其他仍可用的操作，系统已提前拦截这次碰牌。',
    })
    if (protection.discards.length) hints.push({
      id: 'chicken-peng', protection: true, summary: '本巡已碰鸡，请打其他牌',
      reason: '你本巡已经碰过鸡牌，同一巡内不能再打出鸡牌；只限制同一种鸡牌，其他种类可以正常操作。',
      action: '请选择未变灰的牌打出。系统只禁用与本巡碰牌同种的鸡牌。',
      release: '下次实际摸牌后解除。',
    })
  }

  if (options.original) hints.push({
    id: 'original', protection: false, summary: '起手已听，可选择原报',
    reason: '你的起手牌已经听牌，现在是庄家第一次摸牌前的原报窗口。',
    action: '选择「原报」可获得原报计分，此后系统自动摸切，不能碰杠；也可以选择「不原报」继续正常出牌。',
  })
  if (options.canDeclare && !protection.pass) hints.push({
    id: options.declarationArmed ? 'declare-armed' : 'can-declare', protection: false,
    summary: options.declarationArmed ? '报听已选，请打带箭头的牌' : '可报听：先点报听，再出牌',
    reason: '这是你的首次摸牌，打出带听牌箭头的牌后可以声明报听。',
    action: options.declarationArmed
      ? '请打出带听牌箭头的牌完成报听；想正常出牌，可先点「取消报听」。'
      : '想报听时，先点「报听」，再打出带听牌箭头的牌。直接出牌不会自动替你报听。',
    release: '声明后系统自动摸切，不能碰杠；本局结束后恢复。',
  })
  if (ownTurn && player.declaration !== 'none' && !protection.pass) hints.push({
    id: 'locked-hand', protection: false, summary: '已声明听牌，系统自动摸切',
    reason: `你已${player.declaration === 'original' ? '原报' : '报听'}，手牌和听口已经锁定，不能再碰杠或换牌。`,
    action: '系统会自动摸牌并打出刚摸到的那张牌，无需点击出牌；出现合法胡牌机会时会暂停摸切，请点击「胡」确认。',
    release: '本局结束后恢复。',
  })
  return hints
}
