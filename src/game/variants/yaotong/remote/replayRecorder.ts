import type { ReplayRecorderHooks } from '../../../replay/types'
import type { GameState } from '../types'
import { yaotongReplayFrame, yaotongReplayResult, yaotongReplayStep } from '../replay'

/** 远端以权威快照记录；状态对象的替换和重复广播都不代表新小局。 */
export function createYaotongRemoteRecorder(recorder: ReplayRecorderHooks, characterId?: () => string) {
  let roundKey = ''
  let serial = 0
  let ended = false
  return (state: GameState | null) => {
    if (!state) { roundKey = ''; return }
    const key = `${state.remoteMatchId ?? ''}:${state.handNumber}`
    const frame = yaotongReplayFrame(state, characterId?.())
    try {
      if (key !== roundKey) {
        roundKey = key
        ended = false
        // 重连时只能保证当前快照准确，不把未收到的历史事件伪装成逐帧记录。
        serial = state.serial
        recorder.roundStart(frame)
      } else if (!ended) {
        for (const event of state.events.filter(event => event.id > serial)) {
          recorder.step?.(yaotongReplayStep(state, event), frame)
        }
        serial = Math.max(serial, state.serial)
      }
      if (state.result && !ended) {
        ended = true
        recorder.roundEnd(yaotongReplayResult(state), frame)
      }
    } catch {
      // 回放不可用不得打断牌桌；当前小局停止写入，下一小局可重新尝试。
      ended = true
    }
  }
}
