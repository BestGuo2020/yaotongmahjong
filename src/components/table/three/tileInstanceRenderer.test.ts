import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createTileInstanceRenderer } from './tileInstanceRenderer'

describe('tileInstanceRenderer', () => {
  it.each([260, 512])('updates tile matrices through capacity %i without silently truncating a tower', (capacity) => {
    const scene = new THREE.Scene()
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const atlasGeometry = geometry.clone()
    const material = new THREE.MeshBasicMaterial()
    scene.userData.tileBaseGeometry = geometry
    scene.userData.tileCapGeometry = geometry
    scene.userData.faceSide = material
    scene.userData.backMaterial = material
    scene.userData.tileSide = material
    scene.userData.tileBottom = material

    const renderer = createTileInstanceRenderer({
      capacity,
      scene,
      own: (resource) => resource,
      getAtlasMaterial: () => material,
      getAtlasCapGeometry: () => atlasGeometry,
      atlasCellUvFor: () => ({ u: 0, v: 0 }),
    })

    renderer.begin()
    const tile = renderer.add(
      new THREE.Vector3(),
      new THREE.Quaternion(),
      null,
    )
    renderer.finish()

    const baseMesh = scene.children[0] as THREE.InstancedMesh
    const baseVersion = baseMesh.instanceMatrix.version
    const capVersion = tile.capMesh.instanceMatrix.version
    baseMesh.instanceMatrix.clearUpdateRanges()
    tile.capMesh.instanceMatrix.clearUpdateRanges()

    renderer.set(
      tile.baseIndex,
      tile.capMesh,
      tile.capIndex,
      new THREE.Vector3(2, 3, 4),
      new THREE.Quaternion(),
      0.8,
    )

    expect(baseMesh.instanceMatrix.version).toBeGreaterThan(baseVersion)
    expect(tile.capMesh.instanceMatrix.version).toBeGreaterThan(capVersion)
    expect(baseMesh.instanceMatrix.updateRanges).toEqual([{ start: tile.baseIndex * 16, count: 16 }])
    expect(tile.capMesh.instanceMatrix.updateRanges).toEqual([{ start: tile.capIndex * 16, count: 16 }])
    for (let i = 1; i < capacity; i++) renderer.add(new THREE.Vector3(i, 0, 0), new THREE.Quaternion(), null)
    renderer.finish()
    expect(baseMesh.count).toBe(capacity)
    const last = new THREE.Matrix4()
    baseMesh.getMatrixAt(capacity - 1, last)
    expect(new THREE.Vector3().setFromMatrixPosition(last).x).toBe(capacity - 1)
    expect(() => renderer.add(new THREE.Vector3(), new THREE.Quaternion(), null)).toThrow('capacity exceeded')

    geometry.dispose()
    atlasGeometry.dispose()
    material.dispose()
  })

  it('reuses meshes and refreshes only the active matrix and atlas slots after a discard', () => {
    const scene = new THREE.Scene()
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const atlasGeometry = geometry.clone()
    const material = new THREE.MeshBasicMaterial()
    scene.userData.tileBaseGeometry = geometry
    scene.userData.tileCapGeometry = geometry
    scene.userData.faceSide = material
    scene.userData.backMaterial = material
    scene.userData.tileSide = material
    scene.userData.tileBottom = material

    const renderer = createTileInstanceRenderer({
      scene,
      own: (resource) => resource,
      getAtlasMaterial: () => material,
      getAtlasCapGeometry: () => atlasGeometry,
      atlasCellUvFor: tile => ({ u: tile === 'p9' ? .5 : 0, v: 0 }),
    })

    renderer.begin()
    const oldWall = renderer.add(new THREE.Vector3(), new THREE.Quaternion(), null)
    renderer.add(new THREE.Vector3(), new THREE.Quaternion(), 'm1')
    renderer.finish()
    const firstMeshes = [...scene.children]
    const firstAtlasUv = atlasGeometry.getAttribute('aUvOffset')

    renderer.begin()
    const discard = renderer.add(new THREE.Vector3(1, 0, 0), new THREE.Quaternion(), 'p9')
    renderer.finish()

    expect(scene.children).toEqual(firstMeshes)
    expect(atlasGeometry.getAttribute('aUvOffset')).toBe(firstAtlasUv)
    expect(oldWall.capMesh.count).toBe(0)
    expect(discard.capMesh.count).toBe(1)
    expect(discard.capMesh.instanceMatrix.updateRanges).toEqual([{ start: 0, count: 16 }])
    expect(firstAtlasUv.getX(0)).toBe(.5)

    geometry.dispose()
    atlasGeometry.dispose()
    material.dispose()
  })
})
