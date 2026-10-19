import { createApp, h } from 'vue'
import '../../../src/style.css'
import GameTableHud from '../../../src/components/table/GameTableHud.vue'
import YaotongControls from '../../../src/components/yaotong/YaotongControls.vue'
import { useYaotongPort } from '../../../src/game/variants/yaotong/useYaotongPort'
import { act } from '../../../src/game/variants/yaotong/engine'
import { player, ready, table } from '../../../src/game/variants/yaotong/auditFixtures'
import { themePresentationByName, themePresentationCssVariables } from '../../../src/theme/themePresentation'
import type { TableThemeName } from '../../../src/components/table/three/tableTheme'

const query = new URLSearchParams(location.search)
const theme = (query.get('theme') ?? 'jade') as TableThemeName
createApp({ setup() {
  const game = useYaotongPort()
  function scenario(name: string) {
    const state = table()
    game.declarationArmed.value = false
    game.local.mode.value = name === 'hard' ? 'hard' : 'easy'
    if (name === 'multiple') {
      state.current = 1
      state.players[1] = player('147m 258p 369s 2468s 1m', { declaration: 'ready', drawn: 0 })
      state.players[0] = player('11m 23m 456789m 888m', { chickenDiscard: true, passedHu: 100 })
      act(state, 1, { type: 'discard', index: 13 })
    } else if (name === 'original') {
      state.phase = 'original'
      state.players[0] = ready()
    } else if (name === 'declare') {
      state.players[0] = player('234567m 234s 66p 78s 9m', { draws: 1, drawn: 8 })
    } else if (name === 'mandatory') {
      state.players[0] = player('234567m 234s 66p 789s', { drawn: 26 })
      state.players[1].declaration = 'ready'
    } else {
      state.players[0] = player('147m 258p 369s 2468s 1p', { chickenPeng: name !== 'clear' })
    }
    // Freeze deterministic states while exercising the real port, HUD and controls.
    game.local.paused.value = true
    game.local.state.value = state
  }
  ;(window as unknown as { setGuidanceScenario: typeof scenario }).setGuidanceScenario = scenario
  scenario(query.get('scenario') ?? 'chicken')
  return () => h('main', { class: 'game-app', 'data-table-theme': theme,
    style: themePresentationCssVariables(themePresentationByName(theme)) }, [
    h('div', { class: 'has-three-scene' }, [h(GameTableHud, {
      themeName: theme, players: game.players, user: game.user.value, phase: game.phase.value,
      wall: game.wall.value, wallHeadDrawn: game.wallHeadDrawn.value, wallCount: game.wallCount.value,
      currentPlayer: game.currentPlayer.value, selectedIndex: -1, turnSeconds: 0,
      lastDiscard: null, actionPrompt: game.actionPrompt.value, announcement: null, tableActionEvent: null,
      scoreFlowEvent: null, result: null, winEffect: null, winPresentation: null, revealHands: false,
      matchFinished: false, winningPlayerIndex: -1, dealer: 0, isUserTurn: game.local.ownTurn.value,
      userCanHu: Boolean(game.local.self.value?.hu && !game.local.protection.value.hu),
      matchName: '东风场', roundLabel: '东1局', dealAnimation: game.dealAnimation.value,
      openingStage: null, diceValues: [2, 3], diceThrowerIndex: 0,
      userCurrentWaits: game.userCurrentWaits.value, userTingOptions: game.userTingOptions.value,
      userDiscardWaits: null, userKongs: game.userKongs.value, userHasWindKong: false,
      rulesetId: 'yaotong', wallTotal: 108, jokerTiles: ['p1'], extraActions: true,
      blockedDiscardIndices: game.local.protection.value.discards, canPass: !game.local.protection.value.pass,
    }, { actions: () => h(YaotongControls, { game }) })]),
  ])
} }).mount('#app')
