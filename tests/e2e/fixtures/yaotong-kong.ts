import { createApp, h, ref, shallowRef, watch } from 'vue'
import '../../../src/style.css'
import GameTableHud from '../../../src/components/table/GameTableHud.vue'
import { useYaotongPort } from '../../../src/game/variants/yaotong/useYaotongPort'
import { table, player, meld } from '../../../src/game/variants/yaotong/auditFixtures'
import type { KongWeatherCue } from '../../../src/game/variants/yaotong/kongPresentation'
import { themePresentationByName, themePresentationCssVariables } from '../../../src/theme/themePresentation'
import type { TableThemeName } from '../../../src/components/table/three/tableTheme'

const theme = (new URLSearchParams(location.search).get('theme') ?? 'happyMahjong') as TableThemeName
createApp({ setup() {
  const game = useYaotongPort()
  const hold = ref(false), seat = ref(0), ready = ref(false)
  const captured = shallowRef<KongWeatherCue[]>([])
  let hand = 0
  function prepare(kind: string) {
    game.returnToLobby()
    captured.value = []
    const state = table()
    state.handNumber = ++hand
    state.current = seat.value
    state.wall = Array.from({ length: 28 }, (_, i) => i % 27)
    state.players.forEach((p, i) => {
      p.name = ['你', '听风', '观山', '望月'][i]
      p.river = [0, 6, 14, 24, 8, 19].map((tile, id) => ({ tile, id, chicken: 0, stage: 'normal' }))
    })
    // The robbing player is a bot so this scenario also completes when seat 3 is selected.
    const from = kind === '抢杠' ? ((seat.value + 1) % 4 || (seat.value + 2) % 4) : (seat.value + 1) % 4
    const name = state.players[seat.value].name
    if (kind === '明杠') {
      state.current = from
      state.players[from].hand.push(4)
      state.players[seat.value] = player('555m 147s 258p 369s 2p', { name })
    } else if (kind === '补杠' || kind === '抢杠') {
      state.players[seat.value] = player('5m 147s 258p 369s 2p', { name, drawn: 4, melds: [meld(4, { from })] })
      if (kind === '抢杠') state.players[from] = player('234567m 234s 66p 34m', { name: state.players[from].name })
    } else state.players[seat.value] = player('5555m 147s 258p 369s 2p', { name, drawn: kind === '转弯杠' ? 4 : 10 })
    game.local.state.value = state
    game.local.paused.value = kind === 'idle'
    if (kind === 'idle') return
    if (kind === '明杠') {
      game.local.dispatch({ type: 'discard', index: 13 }, from)
      game.local.dispatch({ type: 'respond', action: 'kong' }, seat.value)
    } else game.local.dispatch({ type: 'kong', tile: 4 }, seat.value)
  }
  watch(() => game.tableView.value.kongWeather, cues => {
    if (hold.value && cues?.length) {
      captured.value = cues.map(cue => ({ ...cue, startedAt: performance.now() - 10000, duration: 60000 }))
      game.local.paused.value = true
    }
  })
  prepare('idle')
  return () => h('main', { class: 'game-app', 'data-table-theme': theme, style: themePresentationCssVariables(themePresentationByName(theme)) }, [
    h('nav', { style: 'position:fixed;left:10px;top:8px;z-index:90;display:flex;gap:6px;align-items:center' }, [
      h('select', { 'aria-label': '开杠玩家', value: seat.value, onChange: (event: Event) => { seat.value = Number((event.target as HTMLSelectElement).value) } },
        ['你', '听风', '观山', '望月'].map((name, value) => h('option', { value }, name))),
      ...['明杠', '补杠', '转弯杠', '存杠', '抢杠'].map(kind => h('button', { disabled: !ready.value, onClick: () => prepare(kind) }, kind)),
      h('label', [h('input', { type: 'checkbox', checked: hold.value, onChange: (event: Event) => { hold.value = (event.target as HTMLInputElement).checked; if (!hold.value) captured.value = [] } }), '保留验收画面']),
      h('button', { onClick: () => prepare('idle') }, '清除'),
    ]),
    h('div', { class: 'has-three-scene' }, [h(GameTableHud, {
      themeName: theme, players: game.players, user: game.user.value, phase: game.phase.value,
      wall: game.wall.value, wallCount: game.wallCount.value, wallHeadDrawn: game.wallHeadDrawn.value,
      currentPlayer: game.currentPlayer.value, selectedIndex: -1, turnSeconds: 0,
      lastDiscard: game.lastDiscard.value, actionPrompt: null, announcement: null,
      tableActionEvent: game.tableActionEvent.value, scoreFlowEvent: game.scoreFlowEvent.value,
      result: game.result.value, winEffect: game.winEffect.value, winPresentation: game.winPresentation.value,
      revealHands: game.revealHands.value, winningPlayerIndex: game.winningPlayerIndex.value,
      matchFinished: false, dealer: 0, isUserTurn: false, userCanHu: false,
      matchName: '东风场', roundLabel: '东1局', dealAnimation: game.dealAnimation.value, openingStage: null,
      diceValues: [2, 3], diceThrowerIndex: 0, userCurrentWaits: null, userTingOptions: [], userDiscardWaits: null,
      userKongs: [], userHasWindKong: false, rulesetId: 'yaotong', wallTotal: 108, jokerTiles: ['p1'],
      yaotongView: { ...game.tableView.value, kongWeather: captured.value.length ? captured.value : game.tableView.value.kongWeather },
      onReady: () => { ready.value = true },
    })]),
  ])
} }).mount('#app')
