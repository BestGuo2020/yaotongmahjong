import { createWinEffectPresenter, type WinEffectPresenterOptions } from './winEffectPresenter'
import type { ResolvedTableProps } from './tableRenderTypes'

/** Reuse each seat's ordinary win effect, without extending or duplicating settlement. */
export function createMultiWinEffectPresenter(options: WinEffectPresenterOptions) {
  const cached = new Map<number, { props: ResolvedTableProps; presenter: ReturnType<typeof createWinEffectPresenter> }>()
  let active: ReturnType<typeof createWinEffectPresenter>[] = []
  function seats(presentation: { winnerIndex: number; winnerIndices?: number[] }) {
    return [...new Set(presentation.winnerIndices ?? [presentation.winnerIndex])]
  }
  function forSeat(seat: number) {
    const props: ResolvedTableProps = {
      ...options.props,
      winEffect: options.props.winEffect ? { ...options.props.winEffect, winnerIndex: seat } : null,
      winPresentation: options.props.winPresentation ? { ...options.props.winPresentation, winnerIndex: seat } : null,
    }
    let entry = cached.get(seat)
    if (entry) Object.assign(entry.props, props)
    else {
      entry = { props, presenter: createWinEffectPresenter({ ...options, props }) }
      cached.set(seat, entry)
    }
    return entry.presenter
  }
  function addWinEffect() {
    active = []
    if (!options.props.winEffect) return
    const startedAt = options.startedAt ?? performance.now()
    for (const seat of seats(options.props.winEffect)) {
      const presenter = forSeat(seat)
      presenter.addWinEffect(startedAt)
      active.push(presenter)
    }
  }
  function addWinningDisplayTile() {
    if (!options.props.revealHands || !options.props.winPresentation) return
    for (const seat of seats(options.props.winPresentation)) forSeat(seat).addWinningDisplayTile()
  }
  function animate(time: number) {
    let strongest: ReturnType<ReturnType<typeof createWinEffectPresenter>['animate']> = null
    for (const presenter of active) {
      const frame = presenter.animate(time)
      if (frame && (!strongest || frame.exposure > strongest.exposure)) strongest = frame
    }
    return strongest
  }
  function reset() {
    cached.forEach(entry => entry.presenter.reset())
    active = []
  }
  return { addWinEffect, addWinningDisplayTile, animate, reset }
}
