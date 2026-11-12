const isAndroidEdge = typeof navigator !== 'undefined' && /\bEdgA\//.test(navigator.userAgent)

export const canUseEdgeFullscreen = isAndroidEdge && typeof document !== 'undefined'
  && document.fullscreenEnabled && typeof document.documentElement.requestFullscreen === 'function'

export function requestPageFullscreen() {
  return document.documentElement.requestFullscreen({ navigationUI: 'hide' })
}
