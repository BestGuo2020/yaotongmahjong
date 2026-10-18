// @ts-expect-error Node APIs exist in Vitest; the app tsconfig intentionally excludes Node globals.
import { readFileSync, readdirSync } from 'node:fs'
// @ts-expect-error Node APIs exist in Vitest; the app tsconfig intentionally excludes Node globals.
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AUDIO_ASSETS, resolveAudioAsset, resolveBgmAsset } from './audioAssets'

describe('updated WAV library', () => {
  it('every registered asset exists and is a real RIFF/WAVE file; no supplied WAV is omitted', () => {
    const root = resolve('public/audio')
    const supplied = ['sounds', 'bgm'].flatMap((dir) =>
      readdirSync(resolve(root, dir))
        .filter((name) => name.endsWith('.wav'))
        .map((name) => `${dir}/${name}`),
    )
    expect([...AUDIO_ASSETS].sort()).toEqual(supplied.sort())
    for (const file of AUDIO_ASSETS) {
      const bytes = readFileSync(resolve(root, file))
      expect(bytes.subarray(0, 4).toString(), file).toBe('RIFF')
      expect(bytes.subarray(8, 12).toString(), file).toBe('WAVE')
      expect(bytes.length, file).toBeGreaterThan(44)
    }
  })
  it.each([
    ['1p.mp3', 'sounds/1p.wav'],
    ['peng.wav', 'sounds/peng.wav'],
    ['dice.mp3', 'sounds/touzi.wav'],
    ['deal.mp3', 'sounds/fapai.wav'],
    ['hu.mp3', 'sounds/chihu.wav'],
    ['hu_effect_sound.mp3', 'sounds/hu_effecct_sound.wav'],
    ['hufangmj.ogg', 'sounds/tuidao.wav'],
    ['HuMusic.ogg', 'bgm/ting_bgm.wav'],
  ])('legacy %s resolves to actual %s', (logical, file) => expect(resolveAudioAsset(logical)).toBe(file))
  it('missing old sounds do not produce broken URLs or masquerade as a BGM track', () => {
    for (const file of ['click.mp3', 'game_start.mp3', '1z.mp3', '../secret.wav', 'unknown.wav'])
      expect(resolveAudioAsset(file)).toBeNull()
    expect(resolveBgmAsset('peng.wav')).toBeNull()
    expect(resolveBgmAsset('bg.ogg')).toBe('bgm/bgm.wav')
  })
})
