import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { createDiscardRedraw, type DiscardDamage } from './discardRedraw'

describe('飞牌局部重绘', () => {
  it('沿用整帧分辨率，重画前后位置，恢复相机、阴影和桌面物件的状态', () => {
    const camera = new THREE.PerspectiveCamera(40, 2, .1, 100)
    camera.position.set(0, 12, 14)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()
    const scene = new THREE.Scene()
    const far = new THREE.Mesh(new THREE.BoxGeometry(.2, .2, .2))
    far.position.x = 10
    far.castShadow = true
    scene.add(far)
    const light = new THREE.DirectionalLight()
    light.position.set(-4, 22, 6)
    light.updateMatrixWorld()
    light.shadow.updateMatrices(light)
    const map = light.shadow.map = new THREE.WebGLRenderTarget(512, 512)
    const saved = map.scissor.clone(), projection = camera.projectionMatrix.clone()
    let scissor = new THREE.Vector4(0, 0, 800, 400), clipped = false
    const snapshots: { clipped: boolean; shadow: boolean; visible: boolean; size: THREE.Vector4 }[] = []
    const renderer = {
      shadowMap: { enabled: true, type: THREE.PCFShadowMap },
      getSize: (out: THREE.Vector2) => out.set(800, 400),
      getScissorTest: () => clipped,
      setScissorTest: (value: boolean) => { clipped = value },
      getScissor: (out: THREE.Vector4) => out.copy(scissor),
      setScissor: (rect: THREE.Vector4) => { scissor = rect.clone() },
      render: vi.fn(() => { snapshots.push({ clipped, shadow: map.scissorTest, visible: far.visible, size: scissor.clone() }) }),
    }
    const redraw = createDiscardRedraw([far])
    const draw = (id: number, x: number, dirty = false, damage?: DiscardDamage) =>
      redraw.render(renderer as unknown as THREE.WebGLRenderer, scene, camera, light, { id, position: new THREE.Vector3(x, .6, 0) }, dirty, damage)
    draw(1, 0)
    draw(1, .1)
    expect(snapshots[0].clipped).toBe(false)
    expect(snapshots[1]).toMatchObject({ clipped: true, shadow: true, visible: false })
    expect(snapshots[1].size.z).toBeLessThan(250)
    expect(camera.projectionMatrix).toEqual(projection)
    expect(map.scissor).toEqual(saved)
    expect(map.scissorTest).toBe(false)
    expect(clipped).toBe(false)
    expect(far.visible).toBe(true)
    expect(far.castShadow).toBe(true)
    draw(1, .3, true)
    draw(1, .35)
    draw(2, .4)
    redraw.reset()
    draw(2, .5)
    expect(snapshots.slice(2).map(s => s.clipped)).toEqual([false, true, false, false])

    // 首帧需要覆盖飞牌起点、原弃牌降回常态的位置，以及新高亮。
    redraw.reset()
    const highlight = new THREE.Vector3(2, .48, 0)
    const previousHighlight = new THREE.Vector3(-2, .48, -1)
    draw(3, 0, true, { highlight, previousHighlight })
    const firstClipped = snapshots.at(-1)!
    expect(firstClipped.clipped).toBe(true)
    for (const point of [new THREE.Vector3(0, .6, 0), highlight, previousHighlight]) {
      const projected = point.clone().project(camera)
      expect((projected.x + 1) * 400).toBeGreaterThan(firstClipped.size.x)
      expect((projected.x + 1) * 400).toBeLessThan(firstClipped.size.x + firstClipped.size.z)
      expect((projected.y + 1) * 200).toBeGreaterThan(firstClipped.size.y)
      expect((projected.y + 1) * 200).toBeLessThan(firstClipped.size.y + firstClipped.size.w)
    }
    draw(3, .1, true, { highlight, previousHighlight })
    expect(snapshots.at(-1)?.clipped).toBe(false)
    light.shadow.map = null
    draw(4, 0, true, { highlight, previousHighlight })
    expect(snapshots.at(-1)?.clipped).toBe(false)
    map.dispose()
    far.geometry.dispose()
  })
})
