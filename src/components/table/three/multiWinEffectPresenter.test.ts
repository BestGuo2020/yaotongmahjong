import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMultiWinEffectPresenter } from './multiWinEffectPresenter'
import { createWinEffectPresenter, type WinEffectPresenterOptions } from './winEffectPresenter'

vi.mock('./winEffectPresenter', () => ({
  createWinEffectPresenter: vi.fn(() => ({
    addWinEffect: vi.fn(), addWinningDisplayTile: vi.fn(), reset: vi.fn(), animate: vi.fn(() => null),
  })),
}))
const create = vi.mocked(createWinEffectPresenter)
beforeEach(() => create.mockClear())
function setup(winners = [0, 2]) {
  const effect = { id: 1, winnerIndex: winners[0], winnerIndices: winners, tile: 's9',
    duration: 2600, reducedMotion: false, robbedKong: false, robbedKongPlayerIndex: -1, robbedKongMeldIndex: -1 }
  const options = { props: { players: [], revealHands: false, winEffect: effect,
    winPresentation: { ...effect, sourceIndex: -1, discardWin: true } } } as unknown as WinEffectPresenterOptions
  const props = options.props as { -readonly [K in keyof WinEffectPresenterOptions['props']]: WinEffectPresenterOptions['props'][K] }
  return { options, props, presenter: createMultiWinEffectPresenter(options) }
}

describe('多赢家共用胡牌窗口', () => {
  it.each([[0, 2], [1, 2, 3]])('每个赢家独立建特效，共用同一开始时间：%j', (...winners) => {
    const { presenter } = setup(winners)
    presenter.addWinEffect()
    expect(create).toHaveBeenCalledTimes(winners.length)
    expect(create.mock.calls.map(([options]) => options.props.winEffect!.winnerIndex)).toEqual(winners)
    const starts = create.mock.results.map(result => vi.mocked(result.value.addWinEffect).mock.calls[0][0])
    expect(new Set(starts).size).toBe(1)
    for (const [options] of create.mock.calls) {
      expect(options.props.winEffect).toMatchObject({ tile: 's9', duration: 2600 })
      expect(options.props.winPresentation!.winnerIndex).toBe(options.props.winEffect!.winnerIndex)
    }
  })
  it('单家和减少动态效果沿用原始光效参数', () => {
    const { options, presenter } = setup([3])
    delete options.props.winEffect!.winnerIndices
    options.props.winEffect!.duration = 420
    options.props.winEffect!.reducedMotion = true
    presenter.addWinEffect()
    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0][0].props.winEffect).toMatchObject({ winnerIndex: 3, duration: 420, reducedMotion: true })
  })
  it('只取最强镜头反馈，不叠加多人的震屏和曝光', () => {
    const { presenter } = setup()
    presenter.addWinEffect()
    vi.mocked(create.mock.results[0].value.animate).mockReturnValue({ exposure: 1.1, shakeX: .1, shakeZ: .2 })
    vi.mocked(create.mock.results[1].value.animate).mockReturnValue({ exposure: 1.3, shakeX: .3, shakeZ: .4 })
    expect(presenter.animate(100)).toEqual({ exposure: 1.3, shakeX: .3, shakeZ: .4 })
    presenter.reset()
    expect(presenter.animate(101)).toBeNull()
    for (const result of create.mock.results) expect(result.value.reset).toHaveBeenCalledOnce()
  })
  it('亮牌时每位赢家都有独立展示牌，复用已有资源并更新新一局的牌', () => {
    const { options, props, presenter } = setup([1, 3])
    presenter.addWinEffect()
    presenter.reset()
    props.revealHands = true
    props.winEffect = null
    presenter.addWinningDisplayTile()
    expect(create).toHaveBeenCalledTimes(2)
    for (const result of create.mock.results) expect(result.value.addWinningDisplayTile).toHaveBeenCalledOnce()
    expect(presenter.animate(100)).toBeNull()
    props.winEffect = { ...options.props.winPresentation!, id: 2, tile: 'p5', duration: 2600, reducedMotion: false }
    presenter.addWinEffect()
    expect(create).toHaveBeenCalledTimes(2)
    expect(create.mock.calls.map(([options]) => options.props.winEffect!.tile)).toEqual(['p5', 'p5'])
  })
  it('没有演出或展示时不创建特效，重复赢家只渲染一次', () => {
    const { props, presenter } = setup([0, 0, 2])
    presenter.addWinEffect()
    expect(create).toHaveBeenCalledTimes(2)
    presenter.reset()
    props.winEffect = null
    presenter.addWinEffect()
    presenter.addWinningDisplayTile()
    expect(create).toHaveBeenCalledTimes(2)
    expect(presenter.animate(200)).toBeNull()
  })
})
