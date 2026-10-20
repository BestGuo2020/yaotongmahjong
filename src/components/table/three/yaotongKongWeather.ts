import * as THREE from 'three'
import { pointFromSeat } from '../../../game/core/presentation/tableLayout'
import type { KongWeatherCue } from '../../../game/variants/yaotong/kongPresentation'

/** Inside the acting player's wall, clear of avatars and the central counter. */
export function kongWeatherAnchor(seat: number, localSeat = 0) {
  const relative = (seat - localSeat + 4) % 4
  const point = pointFromSeat(relative, -2.8, 4.35)
  return { x: point.x, y: .09, z: point.z - 1.65 }
}

interface WeatherEffect {
  cue: KongWeatherCue
  root: THREE.Group
  frame(elapsed: number, progress: number): void
  dispose(): void
}

function buildWeather(scene: THREE.Scene, cue: KongWeatherCue, localSeat: number): WeatherEffect {
  const root = new THREE.Group()
  root.name = `yaotong-kong-${cue.kind}`
  root.userData.seat = cue.seat
  const anchor = kongWeatherAnchor(cue.seat, localSeat)
  root.position.set(anchor.x, anchor.y, anchor.z)
  const resources = new Set<{ dispose(): void }>()
  const fades: Array<{ material: THREE.Material; opacity: number }> = []
  const own = <T extends { dispose(): void }>(resource: T) => { resources.add(resource); return resource }
  const material = <T extends THREE.Material>(value: T) => {
    own(value)
    value.transparent = true
    value.depthWrite = false
    value.userData.outlineParameters = { visible: false }
    fades.push({ material: value, opacity: value.opacity })
    return value
  }
  const ground = new THREE.Mesh(own(new THREE.RingGeometry(.7, 1.12, 48)),
    material(new THREE.MeshBasicMaterial({ color: cue.kind === 'rain' ? 0x65c9ff : 0xc5f6e7, opacity: .24, side: THREE.DoubleSide })))
  ground.rotation.x = -Math.PI / 2
  root.add(ground)
  const updates: Array<(seconds: number) => void> = []
  const dummy = new THREE.Object3D()

  if (cue.kind === 'tornado') {
    const funnel = new THREE.Group()
    root.add(funnel)
    const mist = new THREE.Mesh(own(new THREE.CylinderGeometry(1.08, .12, 2.9, 32, 10, true)),
      material(new THREE.MeshBasicMaterial({ color: 0xccebe5, opacity: .13, side: THREE.DoubleSide })))
    mist.position.y = 1.5
    funnel.add(mist)
    for (let ribbon = 0; ribbon < 3; ribbon++) {
      const points = Array.from({ length: 91 }, (_, i) => {
        const t = i / 90, angle = t * Math.PI * 7 + ribbon * Math.PI * 2 / 3
        const radius = .13 + t * t * .97
        return new THREE.Vector3(Math.cos(angle) * radius + Math.sin(t * 4) * .12, .1 + t * 2.9, Math.sin(angle) * radius)
      })
      const band = new THREE.Mesh(own(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 110, ribbon === 0 ? .055 : .027, 5, false)),
        material(new THREE.MeshBasicMaterial({ color: ribbon === 0 ? 0xf4fff4 : 0x89dace, opacity: ribbon === 0 ? .8 : .56 })))
      funnel.add(band)
    }
    const debris = new THREE.InstancedMesh(own(new THREE.OctahedronGeometry(.055)),
      material(new THREE.MeshBasicMaterial({ color: 0xffe0a0, opacity: .8 })), 28)
    own(debris)
    debris.frustumCulled = false
    root.add(debris)
    updates.push(seconds => {
      funnel.rotation.y = -seconds * 6.8
      funnel.rotation.z = Math.sin(seconds * 3) * .045
      for (let i = 0; i < debris.count; i++) {
        const t = (i / debris.count + seconds * .28) % 1
        const angle = i * 2.4 - seconds * (7 - t * 2)
        const radius = .28 + t * 1.02
        dummy.position.set(Math.cos(angle) * radius, .08 + t * 2.8, Math.sin(angle) * radius)
        dummy.rotation.set(angle, angle * .7, 0)
        dummy.scale.set(1, .6, 1.9)
        dummy.updateMatrix()
        debris.setMatrixAt(i, dummy.matrix)
      }
      debris.instanceMatrix.needsUpdate = true
      ground.rotation.z = seconds * 2
    })
  } else {
    const cloud = new THREE.Group()
    cloud.position.y = 3.05
    root.add(cloud)
    const puff = own(new THREE.SphereGeometry(1, 12, 8))
    const cloudMaterial = material(new THREE.MeshStandardMaterial({ color: 0xaac3d3, roughness: 1, opacity: .88 }))
    for (const [x, y, z, scale] of [[-.78, 0, 0, .48], [-.25, .22, 0, .66], [.4, .1, .08, .64], [.89, -.05, -.02, .43], [0, -.12, .35, .57], [-.5, -.1, -.3, .5]]) {
      const mesh = new THREE.Mesh(puff, cloudMaterial)
      mesh.position.set(x, y, z)
      mesh.scale.set(scale, scale * .62, scale * .75)
      cloud.add(mesh)
    }
    const drops = new THREE.InstancedMesh(own(new THREE.CylinderGeometry(.019, .012, .34, 4)),
      material(new THREE.MeshBasicMaterial({ color: 0x97e7ff, opacity: .92 })), 64)
    own(drops)
    drops.frustumCulled = false
    root.add(drops)
    const ripples = new THREE.InstancedMesh(own(new THREE.RingGeometry(.12, .15, 20)),
      material(new THREE.MeshBasicMaterial({ color: 0x9be8ff, opacity: .58, side: THREE.DoubleSide })), 9)
    own(ripples)
    ripples.frustumCulled = false
    root.add(ripples)
    updates.push(seconds => {
      cloud.position.x = Math.sin(seconds * 2) * .08
      for (let i = 0; i < drops.count; i++) {
        const fall = (i * .173 + seconds * 1.4) % 1
        const angle = i * 2.39996, radius = Math.sqrt((i + .5) / drops.count) * 1.03
        dummy.position.set(Math.cos(angle) * radius - fall * .13, .22 + (1 - fall) * 2.5, Math.sin(angle) * radius * .66)
        dummy.rotation.set(0, 0, -.06)
        dummy.scale.setScalar(1)
        dummy.updateMatrix()
        drops.setMatrixAt(i, dummy.matrix)
      }
      drops.instanceMatrix.needsUpdate = true
      for (let i = 0; i < ripples.count; i++) {
        const age = (seconds * 1.5 + i * .37) % 1
        dummy.position.set(Math.cos(i * 2.4) * .8, .015, Math.sin(i * 2.4) * .55)
        dummy.rotation.set(-Math.PI / 2, 0, 0)
        dummy.scale.setScalar(.4 + age * 2)
        dummy.updateMatrix()
        ripples.setMatrixAt(i, dummy.matrix)
      }
      ripples.instanceMatrix.needsUpdate = true
    })
  }
  scene.add(root)
  return {
    cue, root,
    frame(elapsed, progress) {
      const fade = cue.reducedMotion ? 1 : Math.min(1, progress / .12, (1 - progress) / .24)
      root.scale.setScalar(cue.reducedMotion ? .8 : .65 + .35 * Math.min(1, progress / .16))
      fades.forEach(({ material, opacity }) => { material.opacity = opacity * Math.max(0, fade) })
      updates.forEach(update => update(cue.reducedMotion ? .45 : elapsed / 1000))
    },
    dispose() { root.removeFromParent(); resources.forEach(resource => resource.dispose()); resources.clear() },
  }
}

/** Separate scene ownership keeps weather alive across ordinary tile/draw rebuilds. */
export function createYaotongKongWeather(options: {
  scene: THREE.Scene
  cues(): readonly KongWeatherCue[]
  localSeat(): number
}) {
  const active = new Map<number, WeatherEffect>()
  let localSeat = options.localSeat()
  function dispose() { active.forEach(effect => effect.dispose()); active.clear() }
  function animate(now: number) {
    if (options.localSeat() !== localSeat) { dispose(); localSeat = options.localSeat() }
    const current = options.cues().filter(cue => now >= cue.startedAt && now < cue.startedAt + cue.duration).slice(-4)
    const ids = new Set(current.map(cue => cue.id))
    for (const [id, effect] of active) if (!ids.has(id)) { effect.dispose(); active.delete(id) }
    for (const cue of current) {
      let effect = active.get(cue.id)
      if (!effect) { effect = buildWeather(options.scene, cue, localSeat); active.set(cue.id, effect) }
      effect.frame(now - cue.startedAt, (now - cue.startedAt) / cue.duration)
    }
    return active.size > 0
  }
  return { animate, dispose, get visibleCues() { return [...active.values()].map(effect => ({ seat: effect.cue.seat, kind: effect.cue.kind })) } }
}
