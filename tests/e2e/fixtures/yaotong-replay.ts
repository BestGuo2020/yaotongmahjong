import { createGame, continueGame, act } from '../../../src/game/variants/yaotong/engine'
import { chooseAction } from '../../../src/game/variants/yaotong/ai'
import { recordYaotongRound } from '../../../src/game/variants/yaotong/replay'
import { useReplayRecorder } from '../../../src/game/replay/useReplayRecorder'
import type { TableThemeName } from '../../../src/components/table/three/tableTheme'

const query = new URLSearchParams(location.search)
const length = Number(query.get('length') ?? 4) as 4 | 8 | 16
const replay = useReplayRecorder({ meta: () => ({ rulesetId: 'yaotong', rulesetName: '幺筒麻将',
  themeName: (query.get('theme') ?? 'llm') as TableThemeName, humanSeat: 0,
  yaotongMode: length === 16 ? 'hard' : 'easy' }) })
try {
  let seed = 123
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
  let state = createGame({ length, random, dealer: 0, dice: [2, 3] })
  for (let hand = 0; hand < 160; hand++) {
    const stop = recordYaotongRound(state, replay.hooks)
    for (let step = 0; step < 1000 && !state.result; step++) {
      for (let seat = 0; seat < 4 && !state.result; seat++) {
        const command = chooseAction(state, seat)
        if (command && !act(state, seat, command)) throw new Error('幺筒动作执行失败')
      }
    }
    stop()
    if (!state.result) throw new Error('本局未结束')
    if (state.result.finished) break
    state = continueGame(state, { random })
  }
  if (!state.result?.finished) throw new Error('场次未完成')
  const match = replay.finishAuto()!
  await replay.flush()
  const rounds = await replay.storage.loadRounds(match.id)
  if (query.has('limited')) {
    match.gameMode = 'remote'
    await replay.storage.saveMatch(match)
    for (const round of rounds) {
      const hideOthers = (anchor: typeof round.anchor) => {
        anchor.concealedTileCounts = anchor.hands.map((hand, seat) => anchor.concealedTileCounts?.[seat] ?? hand.length)
        anchor.hands = anchor.hands.map((hand, seat) => seat === 0 ? hand : [])
        anchor.drawnTileIndex = anchor.drawnTileIndex.map((index, seat) => seat === 0 ? index : -1)
      }
      hideOthers(round.anchor)
      for (const step of round.steps) {
        if (step.snapshot) hideOthers(step.snapshot)
        if (step.seat !== 0 && step.snapshot) delete step.state
        if (step.seat !== 0 && step.t === 'draw') { delete step.tile; step.text = '摸牌' }
      }
      await replay.storage.saveRound(round)
    }
  }
  ;(window as unknown as { yaotongReplayFixture: unknown }).yaotongReplayFixture = {
    id: match.id, roundCount: rounds.length, finalScores: rounds.at(-1)!.final!.scores,
  }
  document.body.dataset.fixture = 'ready'
  document.querySelector('p')!.textContent = `已保存${match.matchName}，共${rounds.length}局`
} catch (error) {
  document.body.dataset.fixture = 'error'
  document.querySelector('p')!.textContent = String(error)
}
