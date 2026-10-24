import type { GameEvent } from './types'

export const KONG_WEATHER_DURATION = 2200
export const REDUCED_KONG_WEATHER_DURATION = 600
export const DEFAULT_KONG_SOUND = 'gang.ogg'
/** 刚摸到第四张当次暗杠。 */
export const TURN_KONG_SOUND = 'zhuanwangang.ogg'
/** 碰出三张后再补第四张。 */
export const ADDED_KONG_SOUND = 'bugang.ogg'
export interface KongWeatherCue {
  id: number
  seat: number
  kind: 'tornado' | 'rain'
  startedAt: number
  duration: number
  reducedMotion: boolean
}

/** Only completed kongs celebrate: an added-kong declaration can still be robbed. */
export function kongWeatherKind(event: GameEvent): KongWeatherCue['kind'] | null {
  if (event.kind !== 'kong') return null
  if (event.text === '明杠' || event.text === '补杠') return 'tornado'
  if (event.text === '转弯杠' || event.text === '存杠') return 'rain'
  return null
}

/**
 * 杠的报牌音效按规则区分：转弯杠（刚摸到第四张当次暗杠）播“转弯杠”，
 * 补杠（碰后补第四张）播“补杠”，明杠与存杠沿用普通杠。
 * 补杠在宣告（kong-intent）时播报，成功事件不再重复播放。
 */
export function kongSoundFile(event: GameEvent): string {
  if (event.kind !== 'kong' && event.kind !== 'kong-intent') return DEFAULT_KONG_SOUND
  if (event.text === '转弯杠') return TURN_KONG_SOUND
  if (event.text === '补杠' || event.text === '宣告补杠') return ADDED_KONG_SOUND
  return DEFAULT_KONG_SOUND
}
