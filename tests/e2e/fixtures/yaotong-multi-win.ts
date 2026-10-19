import { createApp, h } from 'vue'
import '../../../src/style.css'
import GameTableHud from '../../../src/components/table/GameTableHud.vue'
import { useYaotongPort } from '../../../src/game/variants/yaotong/useYaotongPort'
import { player, table } from '../../../src/game/variants/yaotong/auditFixtures'
import { themePresentationByName, themePresentationCssVariables } from '../../../src/theme/themePresentation'
import type { TableThemeName } from '../../../src/components/table/three/tableTheme'

const query = new URLSearchParams(location.search)
const theme = (query.get('theme') ?? 'jade') as TableThemeName
const source = Number(query.get('source') ?? 0)
const count = Number(query.get('winners') ?? 2)
const patterns = query.has('patterns')
createApp({ setup() {
  const game = useYaotongPort()
  let hand = 0
  function prepare() {
    const state = table()
    state.handNumber = ++hand
    state.current = source
    state.players[source] = player(`147m 258p 369s 2468s ${patterns ? '9m' : '9s'}`, { drawn: patterns ? 8 : 26, afterKong: query.has('hot') })
    const winners = query.has('self') ? [source] : [0, 1, 2, 3].filter(seat => seat !== source).slice(0, count)
    winners.forEach((seat, i) => {
      state.players[seat] = patterns
        ? player(['111222333456m 9m', '1122m 3344p 5566s 9m', '111m 222p 333444s 9m'][i]!)
        : player('234567m 234s 66p 78s', { declaration: 'ready' })
      if (query.has('self')) {
        state.players[seat].hand.push(patterns ? 8 : 26)
        state.players[seat].drawn = patterns ? 8 : 26
      }
    })
    state.players.forEach((player, seat) => { player.name = ['你', '听风', '观山', '望月'][seat]! })
    game.local.paused.value = true
    game.local.state.value = state
    return winners
  }
  function play() {
    game.returnToLobby()
    const winners = prepare()
    game.local.paused.value = false
    if (query.has('self')) game.local.dispatch({ type: 'hu' }, source)
    else {
      game.local.dispatch({ type: 'discard', index: 13 }, source)
      for (const seat of winners) game.local.dispatch({ type: 'respond', action: 'hu' }, seat)
    }
  }
  prepare()
  return () => h('main', { class: 'game-app', 'data-table-theme': theme,
    'data-intro': Boolean(game.tableView.value.multiWinIntro), 'data-action': Boolean(game.tableActionEvent.value),
    'data-effect': Boolean(game.winEffect.value), 'data-reveal': game.revealHands.value, 'data-result': Boolean(game.result.value),
    style: themePresentationCssVariables(themePresentationByName(theme)) }, [
    h('button', { onClick: play, style: 'position:absolute;left:12px;top:12px;z-index:150' }, '播放结算'),
    h('div', { class: 'has-three-scene' }, [h(GameTableHud, {
      themeName: theme, players: game.players, user: game.user.value, phase: game.phase.value,
      wall: game.wall.value, wallHeadDrawn: game.wallHeadDrawn.value, wallCount: game.wallCount.value,
      currentPlayer: game.currentPlayer.value, selectedIndex: -1, turnSeconds: 0,
      lastDiscard: game.lastDiscard.value, actionPrompt: null, announcement: null,
      tableActionEvent: game.tableActionEvent.value, scoreFlowEvent: game.scoreFlowEvent.value,
      result: game.result.value, winEffect: game.winEffect.value, winPresentation: game.winPresentation.value,
      revealHands: game.revealHands.value, matchFinished: false, winningPlayerIndex: game.winningPlayerIndex.value,
      dealer: 0, isUserTurn: false, userCanHu: false, matchName: '东风场', roundLabel: '东3局',
      dealAnimation: game.dealAnimation.value, openingStage: null, diceValues: [2, 3], diceThrowerIndex: 0,
      userCurrentWaits: null, userTingOptions: [], userDiscardWaits: null, userKongs: [], userHasWindKong: false,
      rulesetId: 'yaotong', wallTotal: 108, jokerTiles: ['p1'], yaotongView: game.tableView.value,
    })]),
  ])
} }).mount('#app')
