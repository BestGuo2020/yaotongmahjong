import type { GameEvent, KongKind } from './types'

export const KONG_WEATHER_DURATION = 2200
export const REDUCED_KONG_WEATHER_DURATION = 600
export const DEFAULT_KONG_SOUND = 'gang.ogg'
/** 当次暗杠与碰后加第四张统一播报转弯杠。 */
export const TURN_KONG_SOUND = 'zhuanwangang.ogg'
export interface KongWeatherCue {
  id: number
  seat: number
  kind: 'tornado' | 'rain'
  startedAt: number
  duration: number
  reducedMotion: boolean
}

export function eventKongKind(event: Pick<GameEvent, 'kind' | 'text' | 'kongKind'>): KongKind | null {
  if (event.kind !== 'kong' && event.kind !== 'kong-intent') return null
  if (event.kongKind) return event.kongKind
  // 兼容尚未携带杠型的旧事件及联机快照。
  if (event.kind === 'kong-intent' || event.text === '补杠') return 'added'
  if (event.text === '明杠') return 'open'
  if (event.text === '转弯杠') return 'turn'
  if (event.text === '存杠') return 'stored'
  return null
}

/** Only completed kongs celebrate: an added-kong declaration can still be robbed. */
export function kongWeatherKind(event: GameEvent): KongWeatherCue['kind'] | null {
  if (event.kind !== 'kong') return null
  const kind = eventKongKind(event)
  if (kind === 'open' || kind === 'added') return 'tornado'
  if (kind === 'turn' || kind === 'stored') return 'rain'
  return null
}

/**
 * 转弯杠统一播“转弯杠”，明杠与存杠沿用普通杠。
 * 碰后加第四张在宣告（kong-intent）时播报，成功事件不再重复播放。
 */
export function kongSoundFile(event: GameEvent): string {
  const kind = eventKongKind(event)
  if (kind === 'turn' || kind === 'added') return TURN_KONG_SOUND
  return DEFAULT_KONG_SOUND
}
