import { createApp, h, ref } from 'vue'
import '../../../src/style.css'
import SettlementOverlay from '../../../src/components/settlement/SettlementOverlay.vue'
import YaotongLedger from '../../../src/components/yaotong/YaotongLedger.vue'
import { act } from '../../../src/game/variants/yaotong/engine'
import { table, player } from '../../../src/game/variants/yaotong/auditFixtures'
import { toSharedTile } from '../../../src/game/variants/yaotong/useYaotongPort'
import { makeRoundResult } from '../../../src/game/shared/settlement/roundResult'
import { defaultAvatarForSeat } from '../../../src/game/core/presentation/avatar'
import { themePresentationByName, themePresentationCssVariables } from '../../../src/theme/themePresentation'
import type { GamePlayer } from '../../../src/game/core/contracts/types'
import type { TableThemeName } from '../../../src/components/table/three/tableTheme'

const theme = (new URLSearchParams(location.search).get('theme') ?? 'jade') as TableThemeName
const state = table()
const scoresBefore = [99, -11, 88, -176]
state.current = 3
state.players[3] = player('234567m 567s 22p 789p', { drawn: 16 })
state.players.forEach((p, seat) => { p.name = ['你', '听风', '观山', '望月'][seat]; p.score = scoresBefore[seat] })
act(state, 3, { type: 'hu' })
const players: GamePlayer[] = state.players.map((p, seat) => ({ name: p.name, seat, score: p.score,
  hand: p.hand.map(toSharedTile), melds: [], discards: [], drawnTileIndex: -1, redCount: 0, avatar: defaultAvatarForSeat(seat) }))
const result = makeRoundResult({ players, roundLabel: '东4局', honba: 0 },
  { draw: false, winnerIndex: 3, winner: players[3].name, winType: 'self-draw', points: state.result!.values[3].h }, scoresBefore)
const standings = players.map((p, playerIndex) => ({ ...p, playerIndex, rank: 0 }))
  .sort((a, b) => b.score - a.score).map((p, i) => ({ ...p, rank: i + 1 }))

createApp({ setup() {
  const returned = ref(false)
  return () => returned.value ? h('p', { 'data-testid': 'back-to-lobby' }, '已返回大厅') :
    h('main', { class: 'game-app', 'data-table-theme': theme,
      style: themePresentationCssVariables(themePresentationByName(theme)) }, [
      h(SettlementOverlay, { result, resultVisible: true, matchFinished: true, dealer: 0, waitingNextRound: false,
        gameMode: 'local', continueCountdown: 0, matchName: '东风场', standings, playerId: '', themeName: theme,
        onReturnToLobby: () => { returned.value = true } },
      { summary: () => h(YaotongLedger, { state, players, themeName: theme }) }),
    ])
} }).mount('#app')
