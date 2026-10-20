import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { setWeatherFrame, parseWeatherMesh, WEATHER_MESH_FILES, WEATHER_TEXTURE_FILES } from './yaotongWeatherAssets'
// @ts-expect-error Node APIs are used only by Vitest.
import { readFileSync } from 'node:fs'
// @ts-expect-error Node APIs are used only by Vitest.
import { createHash } from 'node:crypto'

describe('用户提供的原始风雨素材', () => {
  it('所用文件均已登记且字节未改动，OBJ保留纹理UV', () => {
    const root = 'public/effects/yaotong-weather/'
    const manifest = JSON.parse(readFileSync(root + 'source.json', 'utf8')) as { files: Array<{ file: string; sha256: string }> }
    const files = [...Object.values(WEATHER_TEXTURE_FILES), ...Object.values(WEATHER_MESH_FILES)]
    expect(manifest.files.map(item => item.file).sort()).toEqual([...files].sort())
    for (const file of files) {
      const data = readFileSync(root + file)
      expect(createHash('sha256').update(data).digest('hex')).toBe(manifest.files.find(item => item.file === file)!.sha256)
      if (file.endsWith('.png')) expect(data.subarray(1, 4).toString()).toBe('PNG')
      else {
        const mesh = parseWeatherMesh(data.toString())
        expect(mesh.getAttribute('uv').count).toBe(mesh.getAttribute('position').count)
        expect(mesh.getAttribute('position').count).toBeGreaterThan(40)
        mesh.dispose()
      }
    }
  })
  it('水花4×4序列从左上至右下播放，末帧不会采到相邻格', () => {
    const texture = new THREE.Texture()
    for (const [frame, expected] of [[0, [0, .75]], [5, [.25, .5]], [15, [.75, 0]], [16, [.75, 0]]] as const) {
      setWeatherFrame(texture, frame, 4, 4)
      expect(texture.offset.toArray()).toEqual(expected)
      expect(texture.repeat.toArray()).toEqual([.25, .25])
    }
  })
})
