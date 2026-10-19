import { createApp, h, ref } from 'vue'
import '../../../src/style.css'
import SettlementOverlay from '../../../src/components/settlement/SettlementOverlay.vue'
import YaotongLedger from '../../../src/components/yaotong/YaotongLedger.vue'
import YaotongRoundOverview from '../../../src/components/yaotong/YaotongRoundOverview.vue'
import { act } from '../../../src/game/variants/yaotong/engine'
import { settle } from '../../../src/game/variants/yaotong/settlement'
import { table, player } from '../../../src/game/variants/yaotong/auditFixtures'
import { toSharedTile } from '../../../src/game/variants/yaotong/useYaotongPort'
import { makeRoundResult } from '../../../src/game/shared/settlement/roundResult'
import { defaultAvatarForSeat } from '../../../src/game/core/presentation/avatar'
import { themePresentationByName, themePresentationCssVariables } from '../../../src/theme/themePresentation'
import type { GamePlayer } from '../../../src/game/core/contracts/types'
import type { TableThemeName } from '../../../src/components/table/three/tableTheme'

const params = new URLSearchParams(location.search)
const theme = (params.get('theme') ?? 'jade') as TableThemeName
const roundView = params.has('round')
const winner = params.has('self') ? 0 : 3
const reportWin = params.has('report')
const state = table()
if (params.has('double')) state.dice = [2, 2]
const scoresBefore = [99, -11, 88, -176]
state.current = winner
state.players[winner] = player(reportWin ? '23456m 567s 122p 789p' : '234567m 567s 22p 789p', {
  drawn: 16, declaration: reportWin ? 'ready' : 'none',
})
state.players.forEach((p, seat) => { p.name = ['你', '听风', '观山', '望月'][seat]; p.score = scoresBefore[seat] })
if (reportWin) {
  state.result = settle(state, { kind: 'win', winKind: 'discard', winners: [winner], source: 1, tile: 16 })
  state.players.forEach((p, seat) => { p.score += state.result!.deltas[seat]! })
} else act(state, winner, { type: 'hu' })
const players: GamePlayer[] = state.players.map((p, seat) => ({ name: p.name, seat, score: p.score,
  hand: p.hand.map(toSharedTile), melds: [], discards: [], drawnTileIndex: -1, redCount: 0, avatar: defaultAvatarForSeat(seat) }))
const result = makeRoundResult({ players, roundLabel: '东4局', honba: 0 },
  { draw: false, winnerIndex: winner, winner: players[winner].name, winType: reportWin ? 'discard' : 'self-draw', points: state.result!.values[winner].h }, scoresBefore)
const standings = players.map((p, playerIndex) => ({ ...p, playerIndex, rank: 0 }))
  .sort((a, b) => b.score - a.score).map((p, i) => ({ ...p, rank: i + 1 }))

createApp({ setup() {
  const returned = ref(false)
  const visible = ref(!params.has('closed'))
  return () => returned.value ? h('p', { 'data-testid': 'back-to-lobby' }, '已返回大厅') :
    h('main', { class: 'game-app', 'data-table-theme': theme,
      style: themePresentationCssVariables(themePresentationByName(theme)) }, [
      h(SettlementOverlay, { result, resultVisible: visible.value, matchFinished: !roundView, dealer: 0, waitingNextRound: false,
        gameMode: 'local', continueCountdown: 0, matchName: '东风场', standings, playerId: '', themeName: theme,
        'onUpdate:resultVisible': (value: boolean) => { visible.value = value },
        onNextRound: () => { returned.value = true },
        onReturnToLobby: () => { returned.value = true } },
      { overview: () => h(YaotongRoundOverview, { state, themeName: theme }),
        summary: () => h(YaotongLedger, { state, players, themeName: theme }) }),
    ])
} }).mount('#app')
