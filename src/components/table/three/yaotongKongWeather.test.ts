import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { createYaotongKongWeather, kongWeatherAnchor } from './yaotongKongWeather'
import type { KongWeatherCue } from '../../../game/variants/yaotong/kongPresentation'
import { parseWeatherMesh, WEATHER_MESH_FILES, WEATHER_TEXTURE_FILES, type WeatherAssets } from './yaotongWeatherAssets'
// @ts-expect-error Node APIs are used only by Vitest, not the browser application.
import { readFileSync } from 'node:fs'

const assets: WeatherAssets = {
  textures: Object.fromEntries(Object.entries(WEATHER_TEXTURE_FILES).map(([key, file]) => {
    const texture = new THREE.Texture(); texture.name = file
    return [key, texture]
  })) as WeatherAssets['textures'],
  meshes: Object.fromEntries(Object.entries(WEATHER_MESH_FILES).map(([key, file]) =>
    [key, parseWeatherMesh(readFileSync(`public/effects/yaotong-weather/${file}`, 'utf8'))],
  )) as WeatherAssets['meshes'],
}

const cue = (kind: KongWeatherCue['kind'], seat = 0): KongWeatherCue => ({ id: seat + 1, seat, kind, startedAt: 100, duration: 2200, reducedMotion: false })
describe('3D开杠天气', () => {
  it.each(['tornado', 'rain'] as const)('%s只建一次，牌桌刷新不重播，到期释放GPU资源', kind => {
    const scene = new THREE.Scene(), input = [cue(kind)]
    const weather = createYaotongKongWeather({ scene, assets, cues: () => input, localSeat: () => 0 })
    expect(weather.animate(0)).toBe(false)
    expect(weather.animate(600)).toBe(true)
    const root = scene.children[0]
    expect(root.position.toArray()).toEqual(Object.values(kongWeatherAnchor(0)))
    expect(weather.visibleCues).toEqual([{ seat: 0, kind }])
    const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>()
    root.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
        if (object instanceof THREE.Mesh) resources.add(object.geometry)
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          resources.add(material)
          const mapped = material as THREE.MeshBasicMaterial
          if (mapped.map) resources.add(mapped.map)
          if (mapped.alphaMap) resources.add(mapped.alphaMap)
        }
      }
    })
    const spies = [...resources].map(resource => vi.spyOn(resource, 'dispose'))
    expect([...resources].some(resource => resource instanceof THREE.Texture && resource.name === (kind === 'rain' ? 'water_splash_4x4_blue.png' : 'wind_trail.png'))).toBe(true)
    expect([...resources].every(resource => !Object.values(assets.textures).includes(resource as THREE.Texture))).toBe(true)
    expect(weather.animate(700)).toBe(true)
    expect(scene.children).toEqual([root])
    expect(weather.animate(2300)).toBe(false)
    expect(scene.children).toHaveLength(0)
    spies.forEach(spy => expect(spy).toHaveBeenCalledOnce())
    expect(weather.animate(2400)).toBe(false)
    expect(scene.children).toHaveLength(0)
  })

  it('不同玩家可同时开杠；取消提示立即清理对应效果', () => {
    const scene = new THREE.Scene()
    let input = [cue('rain', 1), cue('tornado', 2)]
    const weather = createYaotongKongWeather({ scene, assets, cues: () => input, localSeat: () => 1 })
    weather.animate(600)
    expect(scene.children.map(group => group.position.toArray())).toEqual([Object.values(kongWeatherAnchor(1, 1)), Object.values(kongWeatherAnchor(2, 1))])
    input = [input[1]]
    weather.animate(700)
    expect(weather.visibleCues).toEqual([{ seat: 2, kind: 'tornado' }])
    weather.dispose()
    expect(scene.children).toHaveLength(0)
  })

  it('减少动态效果保留静态云雨标识，不旋转或高速落雨', () => {
    const scene = new THREE.Scene(), input = [{ ...cue('rain'), reducedMotion: true, duration: 600 }]
    const weather = createYaotongKongWeather({ scene, assets, cues: () => input, localSeat: () => 0 })
    weather.animate(200)
    const matrices: number[][] = []
    scene.traverse(object => { if (object instanceof THREE.InstancedMesh) matrices.push([...object.instanceMatrix.array]) })
    weather.animate(500)
    const after: number[][] = []
    scene.traverse(object => { if (object instanceof THREE.InstancedMesh) after.push([...object.instanceMatrix.array]) })
    expect(after).toEqual(matrices)
    weather.animate(700)
    expect(scene.children).toHaveLength(0)
  })

  it('素材不可用时跳过装饰，不显示白色方块或阻塞对局', () => {
    const scene = new THREE.Scene()
    const weather = createYaotongKongWeather({ scene, assets: null, cues: () => [cue('rain')], localSeat: () => 0 })
    expect(weather.animate(400)).toBe(false)
    expect(scene.children).toHaveLength(0)
  })
})
