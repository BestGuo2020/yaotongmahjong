import type { GameEvent } from './types'

export const KONG_WEATHER_DURATION = 2200
export const REDUCED_KONG_WEATHER_DURATION = 600
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
