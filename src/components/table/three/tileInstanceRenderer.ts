import * as THREE from 'three'
import type { TileType } from '../../../game/core/contracts/types'

interface TileInstanceRendererOptions {
  capacity?: number
  scene: THREE.Scene
  own<T>(resource: T): T
  getAtlasMaterial(): THREE.Material
  getJokerAtlasMaterial?: () => THREE.Material
  getWildcardAtlasMaterial?: () => THREE.Material
  getLaiziAtlasMaterial?: () => THREE.Material
  getAtlasCapGeometry(): THREE.BufferGeometry
  atlasCellUvFor(tile: TileType): { u: number; v: number }
  isJoker?: (tile: TileType) => boolean
  isWildcard?: (tile: TileType) => boolean
  isLaizi?: (tile: TileType) => boolean
  /** 二次元接触阴影：传入牌下阴影所在的桌面 Y（如 0.075），为每张牌铺一块柔和贴片阴影。 */
  contactShadowY?: number
}

const TILE_BASE_OFFSET = new THREE.Matrix4().makeTranslation(0, -.06, 0)
const TILE_CAP_OFFSET = new THREE.Matrix4().makeTranslation(0, .13, 0)
export const CONTACT_SHADOW_QUAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))
// 主光在左上（[-4,22,6]），接触阴影应偏向右后（+x、-z），而不是正中心对称的一圈。
export const CONTACT_SHADOW_OFFSET_X = 0.18
export const CONTACT_SHADOW_OFFSET_Z = -0.18

// 牌下柔和贴片阴影：中央平铺暗色矩形、四周模糊渐隐（贴片，不是径向圆圈）。
export function makeContactShadowTexture() {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = 'rgba(0,0,0,.10)'
  ctx.filter = 'blur(14px)'
  const inset = size * .12
  ctx.fillRect(inset, inset, size - inset * 2, size - inset * 2)
  ctx.filter = 'none'
  return new THREE.CanvasTexture(canvas)
}

export function createTileInstanceRenderer(options: TileInstanceRendererOptions) {
  const INSTANCE_CAPACITY = options.capacity ?? 260
  let baseMesh: THREE.InstancedMesh | null = null
  let backCapMesh: THREE.InstancedMesh | null = null
  let atlasCapMesh: THREE.InstancedMesh | null = null
  let jokerAtlasCapMesh: THREE.InstancedMesh | null = null
  let wildcardAtlasCapMesh: THREE.InstancedMesh | null = null
  let laiziAtlasCapMesh: THREE.InstancedMesh | null = null
  let shadowMesh: THREE.InstancedMesh | null = null
  let atlasUvData: Float32Array | null = null
  let jokerAtlasUvData: Float32Array | null = null
  let wildcardAtlasUvData: Float32Array | null = null
  let laiziAtlasUvData: Float32Array | null = null
  let backCapCount = 0
  let atlasCapCount = 0
  let jokerAtlasCapCount = 0
  let wildcardAtlasCapCount = 0
  let laiziAtlasCapCount = 0
  let instanceCount = 0
  let building = false
  const matrix = new THREE.Matrix4()
  const scaleVector = new THREE.Vector3()
  const shadowMatrix = new THREE.Matrix4()
  const shadowPosition = new THREE.Vector3()
  const shadowScale = new THREE.Vector3()

  function createCap(topMaterial: THREE.Material, geometry: THREE.BufferGeometry) {
    const cap = options.own(new THREE.InstancedMesh(
      geometry,
      [options.scene.userData.tileSide, options.scene.userData.tileSide, topMaterial,
        options.scene.userData.tileBottom, options.scene.userData.tileSide, options.scene.userData.tileSide],
      INSTANCE_CAPACITY,
    ))
    cap.castShadow = true
    cap.receiveShadow = true
    cap.frustumCulled = false
    cap.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    options.scene.add(cap)
    return cap
  }

  function begin() {
    building = true
    // 实例及其缓冲区随整张牌桌释放，跨摸打、碰杠和开局批次复用。
    if (!baseMesh) {
      baseMesh = options.own(new THREE.InstancedMesh(
        options.scene.userData.tileBaseGeometry,
        [options.scene.userData.faceSide, options.scene.userData.faceSide, options.scene.userData.faceSide,
          options.scene.userData.backMaterial, options.scene.userData.faceSide, options.scene.userData.faceSide],
        INSTANCE_CAPACITY,
      ))
      baseMesh.castShadow = true
      baseMesh.receiveShadow = true
      baseMesh.frustumCulled = false
      baseMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      options.scene.add(baseMesh)
      backCapMesh = createCap(options.scene.userData.tileBottom, options.scene.userData.tileCapGeometry)
      atlasCapMesh = createCap(options.getAtlasMaterial(), options.getAtlasCapGeometry())
      jokerAtlasCapMesh = createCap(
        options.getJokerAtlasMaterial?.() ?? options.getAtlasMaterial(),
        options.own(options.getAtlasCapGeometry().clone()),
      )
      wildcardAtlasCapMesh = createCap(
        options.getWildcardAtlasMaterial?.() ?? options.getAtlasMaterial(),
        options.own(options.getAtlasCapGeometry().clone()),
      )
      laiziAtlasCapMesh = createCap(
        options.getLaiziAtlasMaterial?.() ?? options.getAtlasMaterial(),
        options.own(options.getAtlasCapGeometry().clone()),
      )
      if (options.contactShadowY != null) {
        const shadowTexture = options.own(makeContactShadowTexture())
        const shadowMaterial = options.own(new THREE.MeshBasicMaterial({
          map: shadowTexture,
          transparent: true,
          depthWrite: false,
        }))
        shadowMesh = options.own(new THREE.InstancedMesh(
          options.own(new THREE.PlaneGeometry(1.15, 1.45)),
          shadowMaterial,
          INSTANCE_CAPACITY,
        ))
        shadowMesh.frustumCulled = false
        shadowMesh.renderOrder = 1
        shadowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        options.scene.add(shadowMesh)
      }
      atlasUvData = createUvData(atlasCapMesh)
      jokerAtlasUvData = createUvData(jokerAtlasCapMesh)
      wildcardAtlasUvData = createUvData(wildcardAtlasCapMesh)
      laiziAtlasUvData = createUvData(laiziAtlasCapMesh)
    }
    backCapCount = 0
    atlasCapCount = 0
    jokerAtlasCapCount = 0
    wildcardAtlasCapCount = 0
    laiziAtlasCapCount = 0
    instanceCount = 0
  }

  function createUvData(mesh: THREE.InstancedMesh) {
    const data = new Float32Array(INSTANCE_CAPACITY * 2)
    mesh.geometry.setAttribute('aUvOffset', new THREE.InstancedBufferAttribute(data, 2).setUsage(THREE.DynamicDrawUsage))
    return data
  }

  function updateMatrix(mesh: THREE.InstancedMesh, index: number, value: THREE.Matrix4) {
    mesh.setMatrixAt(index, value)
    if (!building) {
      mesh.instanceMatrix.addUpdateRange(index * 16, 16)
      mesh.instanceMatrix.needsUpdate = true
    }
  }

  function set(baseIndex: number, capMesh: THREE.InstancedMesh, capIndex: number, position: THREE.Vector3, quaternion: THREE.Quaternion, scale: number) {
    scaleVector.setScalar(scale)
    matrix.compose(position, quaternion, scaleVector)
    updateMatrix(baseMesh!, baseIndex, matrix.multiply(TILE_BASE_OFFSET))
    matrix.compose(position, quaternion, scaleVector)
    updateMatrix(capMesh, capIndex, matrix.multiply(TILE_CAP_OFFSET))
    if (shadowMesh && options.contactShadowY != null) {
      shadowPosition.set(position.x + CONTACT_SHADOW_OFFSET_X, options.contactShadowY, position.z + CONTACT_SHADOW_OFFSET_Z)
      shadowScale.setScalar(scale)
      shadowMatrix.compose(shadowPosition, CONTACT_SHADOW_QUAT, shadowScale)
      updateMatrix(shadowMesh, baseIndex, shadowMatrix)
    }
  }

  function add(position: THREE.Vector3, quaternion: THREE.Quaternion, face: TileType | null, scale = 1, initialPosition: THREE.Vector3 | null = null, initialScale: number | null = null) {
    if (instanceCount >= INSTANCE_CAPACITY) throw new Error('Tile instance capacity exceeded')
    const baseIndex = instanceCount++
    const joker = Boolean(face && options.isJoker?.(face))
    const wildcard = Boolean(face && !joker && options.isWildcard?.(face))
    const laizi = Boolean(face && !joker && !wildcard && options.isLaizi?.(face))
    const capMesh = !face ? backCapMesh!
      : joker ? jokerAtlasCapMesh!
        : wildcard ? wildcardAtlasCapMesh!
          : laizi ? laiziAtlasCapMesh!
            : atlasCapMesh!
    const capIndex = !face ? backCapCount++
      : joker ? jokerAtlasCapCount++
        : wildcard ? wildcardAtlasCapCount++
          : laizi ? laiziAtlasCapCount++
            : atlasCapCount++
    if (face) {
      const uv = options.atlasCellUvFor(face)
      const uvData = joker ? jokerAtlasUvData!
        : wildcard ? wildcardAtlasUvData!
          : laizi ? laiziAtlasUvData!
            : atlasUvData!
      uvData[capIndex * 2] = uv.u
      uvData[capIndex * 2 + 1] = uv.v
    }
    set(baseIndex, capMesh, capIndex, initialPosition ?? position, quaternion, initialScale ?? scale)
    return { baseIndex, capMesh, capIndex }
  }

  function finish() {
    building = false
    baseMesh!.count = instanceCount
    backCapMesh!.count = backCapCount
    atlasCapMesh!.count = atlasCapCount
    jokerAtlasCapMesh!.count = jokerAtlasCapCount
    wildcardAtlasCapMesh!.count = wildcardAtlasCapCount
    laiziAtlasCapMesh!.count = laiziAtlasCapCount
    if (shadowMesh) shadowMesh.count = instanceCount
    for (const mesh of [baseMesh, backCapMesh, atlasCapMesh, jokerAtlasCapMesh, wildcardAtlasCapMesh, laiziAtlasCapMesh, shadowMesh]) {
      if (!mesh?.count) continue
      for (const attribute of [mesh.instanceMatrix, mesh.geometry.getAttribute('aUvOffset') as THREE.BufferAttribute | undefined]) {
        if (!attribute) continue
        attribute.clearUpdateRanges()
        attribute.addUpdateRange(0, mesh.count * attribute.itemSize)
        attribute.needsUpdate = true
      }
    }
  }

  return { begin, add, set, finish }
}

export type TileInstanceRenderer = ReturnType<typeof createTileInstanceRenderer>
