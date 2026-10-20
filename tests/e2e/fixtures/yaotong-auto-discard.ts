import { createApp, h } from 'vue'
import '../../../src/style.css'
import GameTableHud from '../../../src/components/table/GameTableHud.vue'
import YaotongControls from '../../../src/components/yaotong/YaotongControls.vue'
import { useYaotongPort } from '../../../src/game/variants/yaotong/useYaotongPort'
import { player, ready, table } from '../../../src/game/variants/yaotong/auditFixtures'
import { themePresentationByName, themePresentationCssVariables } from '../../../src/theme/themePresentation'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'ready'
createApp({ setup() {
  const game = useYaotongPort({ playSound: () => {}, playSoundAndWait: async () => {} })
  const state = table()
  state.wall = [4, 5, 6, 7, 8, 0, 1, 2, 3, 4]
  state.players.forEach((_, seat) => {
    state.players[seat] = player('147m 258p 1357s 248s', { name: ['你', '听风', '观山', '望月'][seat] })
  })
  state.players[0] = { ...ready(), name: '你', draws: 1 }
  if (scenario === 'original') {
    state.phase = 'original'
    state.originalDecisions = [false, true, true, true]
    state.players[0].draws = 0
  } else if (scenario === 'hu') {
    state.players[0].hand.push(26)
    state.players[0].drawn = 26
    state.players[0].draws = 2
    state.players[0].declaration = 'ready'
  } else {
    state.players[0].hand.push(8)
    state.players[0].drawn = 8
  }
  game.local.state.value = state
  return () => h('main', { class: 'game-app', 'data-table-theme': 'jade',
    'data-declaration': game.local.user.value?.declaration,
    'data-discards': game.local.user.value?.river.length,
    'data-auto-discard': String(game.local.autoDiscard.value),
    'data-autoplay': String(game.local.autoplay.value),
    'data-result': game.local.state.value?.result?.kind ?? '',
    'data-held': JSON.stringify(game.local.user.value?.hand.filter((_, index) =>
      game.local.user.value?.drawn == null || index !== game.local.user.value.hand.length - 1).sort((a, b) => a - b)),
    style: themePresentationCssVariables(themePresentationByName('jade')) }, [
    h('div', { class: 'has-three-scene' }, [h(GameTableHud, {
      themeName: 'jade', players: game.players, user: game.user.value, phase: game.phase.value,
      wall: game.wall.value, wallHeadDrawn: game.wallHeadDrawn.value, wallCount: game.wallCount.value,
      currentPlayer: game.currentPlayer.value, selectedIndex: game.selectedIndex.value, turnSeconds: 0,
      lastDiscard: game.lastDiscard.value, actionPrompt: game.actionPrompt.value, announcement: null,
      tableActionEvent: null, scoreFlowEvent: null, result: null, winEffect: null, winPresentation: null,
      revealHands: false, matchFinished: false, winningPlayerIndex: -1, dealer: 0,
      isUserTurn: game.isUserTurn.value, userCanHu: game.userCanHu.value,
      matchName: '东风场', roundLabel: '东1局', dealAnimation: game.dealAnimation.value,
      openingStage: null, diceValues: [2, 3], diceThrowerIndex: 0,
      userCurrentWaits: game.userCurrentWaits.value, userTingOptions: game.userTingOptions.value,
      userDiscardWaits: game.userDiscardWaits.value, userKongs: game.userKongs.value, userHasWindKong: false,
      rulesetId: 'yaotong', wallTotal: 108, jokerTiles: ['p1'], extraActions: true,
      autoPlayEnabled: true, autoPlay: game.local.autoplay.value, yaotongView: game.tableView.value,
      lockedHand: game.local.user.value?.declaration !== 'none',
      blockedDiscardIndices: game.local.protection.value.discards, canPass: !game.local.protection.value.pass,
      onDiscard: game.userDiscard, onSelectTile: game.selectTile, onClearSelection: game.clearUserSelection,
      onHu: game.userHu, onPass: game.userPass,
    }, { actions: () => h(YaotongControls, { game }) })]),
  ])
} }).mount('#app')
