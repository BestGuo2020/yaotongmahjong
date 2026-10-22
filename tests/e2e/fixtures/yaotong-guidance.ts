import { createApp, h } from 'vue'
import '../../../src/style.css'
import GameTableHud from '../../../src/components/table/GameTableHud.vue'
import YaotongControls from '../../../src/components/yaotong/YaotongControls.vue'
import SettlementOverlay from '../../../src/components/settlement/SettlementOverlay.vue'
import YaotongLedger from '../../../src/components/yaotong/YaotongLedger.vue'
import YaotongRoundOverview from '../../../src/components/yaotong/YaotongRoundOverview.vue'
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
    const hardWait = name.startsWith('hard-wait')
    const hardClaim = name === 'hard-claim'
    game.local.mode.value = name === 'hard' || hardWait || hardClaim ? 'hard' : 'easy'
    if (hardClaim) {
      state.players[0] = player('55m 147m 258p 369s 24s')
      state.current = 1
      state.players[1].hand.push(4)
    } else if (hardWait) {
      state.players[0].hand.push(4); state.players[0].drawn = 4
      if (name === 'hard-wait-flow') {
        state.players[0].hand.pop(); state.players[0].drawn = null
        state.current = 1; state.players[1].hand.push(4); state.players[1].drawn = 4
      }
      if (name === 'hard-wait-legal') {
        state.players[0] = player('2222m 33p 44s 55s 66p 11p', { declaration: 'ready', drawn: 9 })
        state.wall = [17]
      }
      if (name === 'hard-wait-zero') state.waitRemainingMs[0] = 0
      if (name === 'hard-wait-late') {
        state.players[0] = { ...ready(), declaration: 'ready' }
        state.current = 1; state.players[1].hand.push(26)
      }
    } else if (name === 'river' || name === 'river-claimed') {
      state.players[0].river = [
        { tile: 0, chicken: 4, stage: 'normal', id: 1, firstChicken: true },
        { tile: 0, chicken: 4, stage: 'normal', id: 2, firstChicken: false },
        { tile: 9, chicken: 30, stage: 'pre', id: 3, firstChicken: true },
      ]
      state.players[1].river = [{ tile: 16, chicken: 4, stage: 'normal', id: 4, firstChicken: true }]
      state.players[2].river = [{ tile: 18, chicken: 4, stage: 'normal', id: 5, firstChicken: true }]
      state.players[3].river = [
        { tile: 16, chicken: 4, stage: 'normal', id: 6, followChicken: true },
        { tile: 16, chicken: 2, stage: 'normal', id: 7 },
      ]
      state.players[3].melds = [{ kind: 'peng', tile: 4, from: 1, chicken: 0, responsibility: 0, pre: false }]
      if (name === 'river-claimed') state.players[0].river.shift()
    } else if (name === 'hu' || name === 'hu-response') {
      state.wall = query.get('flip') === 'yao' ? [17] : [8]
      state.players[0] = player('2222m 33p 44s 55s 66p 11p', { declaration: 'ready', drawn: 9 })
      if (name === 'hu-response') {
        state.players[0].hand.pop()
        state.current = 1
        state.players[1].hand.push(9)
        act(state, 1, { type: 'discard', index: 13 })
      }
    } else if (name === 'multiple') {
      state.current = 1
      state.players[1] = player('147m 258p 369s 2468s 1m', { declaration: 'ready', drawn: 0 })
      state.players[0] = player('11m 23m 456789m 888m', { chickenDiscard: [0], passedHu: 100 })
      act(state, 1, { type: 'discard', index: 13 })
    } else if (name === 'original') {
      state.phase = 'original'
      state.players[0] = ready()
    } else if (name === 'seat-layout') {
      state.dealer = 1
      state.players.forEach((p, seat) => {
        p.name = ['你', '听风', '观山', '望月'][seat]
        p.score = [-263, 95, 103, 65][seat]
        p.river = Array.from({ length: 9 }, (_, index) => ({
          tile: (seat * 6 + index) % 27, chicken: index === 0 ? 4 : 0,
          stage: 'normal' as const, id: seat * 10 + index + 1,
        }))
      })
      state.players[2].river[1] = { tile: 16, chicken: 4, stage: 'normal', id: 22 }
    } else if (name === 'declare') {
      state.players[0] = player('234567m 234s 66p 78s 9m', { draws: 1, drawn: 8 })
    } else if (name === 'mandatory') {
      state.players[0] = player('234567m 234s 66p 789s', { drawn: 26 })
      state.players[1].declaration = 'ready'
    } else {
      state.players[0] = player('147m 258p 369s 2468s 1p', { chickenPeng: name !== 'clear' ? [9] : [] })
    }
    // Freeze deterministic states while exercising the real port, HUD and controls.
    game.local.paused.value = !name.startsWith('hu') && !hardWait && !hardClaim
    game.local.state.value = state
    if (name === 'hard-wait-late') game.local.dispatch({ type: 'discard', index: 13 }, 1)
    if (hardClaim) game.local.dispatch({ type: 'discard', index: 13 }, 1)
  }
  ;(window as unknown as { setGuidanceScenario: typeof scenario }).setGuidanceScenario = scenario
  ;(window as unknown as { adoptedHu: () => unknown }).adoptedHu = () => game.local.state.value?.result?.values[0]
  ;(window as unknown as { waitState: () => unknown }).waitState = () => ({
    serial: game.local.state.value?.serial, remaining: game.local.state.value?.waitRemainingMs,
    phase: game.local.state.value?.phase, reason: game.local.state.value?.result?.reason,
    source: game.local.state.value?.result?.source, winners: game.local.state.value?.result?.winners,
    tile: game.local.state.value?.result?.tile, melds: game.local.state.value?.players[0].melds.length,
  })
  scenario(query.get('scenario') ?? 'chicken')
  return () => h('main', { class: 'game-app', 'data-table-theme': theme,
    style: themePresentationCssVariables(themePresentationByName(theme)) }, [
    h('div', { class: 'has-three-scene' }, [h(GameTableHud, {
      themeName: theme, players: game.players, user: game.user.value, phase: game.phase.value,
      wall: game.wall.value, wallHeadDrawn: game.wallHeadDrawn.value, wallCount: game.wallCount.value,
      currentPlayer: game.currentPlayer.value, selectedIndex: -1, turnSeconds: 0,
      lastDiscard: null, actionPrompt: game.actionPrompt.value, announcement: null, tableActionEvent: null,
      scoreFlowEvent: null, result: null, winEffect: null, winPresentation: null, revealHands: query.has('reveal'),
      matchFinished: false, winningPlayerIndex: -1, dealer: game.dealer.value, isUserTurn: game.local.ownTurn.value && !game.local.holding.value,
      userCanHu: Boolean(game.local.self.value?.hu && !game.local.protection.value.hu),
      matchName: '东风场', roundLabel: '东1局', dealAnimation: game.dealAnimation.value,
      openingStage: null, diceValues: [2, 3], diceThrowerIndex: 0,
      userCurrentWaits: game.userCurrentWaits.value, userTingOptions: game.userTingOptions.value,
      userDiscardWaits: null, userKongs: game.userKongs.value, userHasWindKong: false,
      rulesetId: 'yaotong', wallTotal: 108, jokerTiles: ['p1'], extraActions: true,
      yaotongView: game.tableView.value,
      blockedDiscardIndices: game.local.protection.value.discards, canPass: !game.local.protection.value.pass,
      onHu: () => game.userHu(),
      onPeng: () => game.userPeng(), onPass: () => game.userPass(),
      onGangFromDiscard: () => game.userGangFromDiscard(),
      autoPlayEnabled: true, autoPlay: false,
    }, { actions: () => h(YaotongControls, { game }) })]),
    game.result.value ? h(SettlementOverlay, {
      resultTitle: game.resultTitle.value,
      result: game.result.value, resultVisible: true, matchFinished: false, dealer: game.dealer.value,
      waitingNextRound: false, gameMode: 'local', continueCountdown: 0, matchName: '东风场',
      standings: game.standings.value, playerId: '', themeName: theme,
    }, { overview: () => h(YaotongRoundOverview, { state: game.local.state.value!, themeName: theme }),
      summary: () => h(YaotongLedger, { state: game.local.state.value!, players: game.players, themeName: theme }),
    }) : null,
  ])
} }).mount('#app')
