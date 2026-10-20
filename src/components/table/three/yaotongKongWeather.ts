import * as THREE from 'three'
import { pointFromSeat } from '../../../game/core/presentation/tableLayout'
import type { KongWeatherCue } from '../../../game/variants/yaotong/kongPresentation'
import { setWeatherFrame, type WeatherAssets } from './yaotongWeatherAssets'

export function kongWeatherAnchor(seat: number, localSeat = 0) {
  const point = pointFromSeat((seat - localSeat + 4) % 4, -2.8, 4.35)
  return { x: point.x, y: .09, z: point.z - 1.65 }
}

interface WeatherEffect {
  cue: KongWeatherCue
  root: THREE.Group
  frame(elapsed: number, progress: number): void
  dispose(): void
}

function buildWeather(scene: THREE.Scene, cue: KongWeatherCue, localSeat: number, assets: WeatherAssets, camera?: THREE.Camera): WeatherEffect {
  const root = new THREE.Group(), anchor = kongWeatherAnchor(cue.seat, localSeat)
  root.name = `yaotong-kong-${cue.kind}`
  root.userData.seat = cue.seat
  root.position.set(anchor.x, anchor.y, anchor.z)
  const resources = new Set<{ dispose(): void }>()
  const fades: Array<{ material: THREE.Material; opacity: number }> = []
  const updates: Array<(seconds: number) => void> = []
  const own = <T extends { dispose(): void }>(value: T) => { resources.add(value); return value }
  const material = <T extends THREE.Material>(value: T) => {
    own(value)
    value.transparent = true
    value.depthWrite = false
    value.toneMapped = false
    value.userData.outlineParameters = { visible: false }
    fades.push({ material: value, opacity: value.opacity })
    return value
  }
  const texture = (name: keyof WeatherAssets['textures']) => {
    const value = own(assets.textures[name].clone())
    value.needsUpdate = true
    return value
  }
  const sprite = (map: THREE.Texture, color: number, opacity: number, additive = false) => {
    const item = new THREE.Sprite(material(new THREE.SpriteMaterial({ map, color, opacity,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending })))
    root.add(item)
    return item
  }
  const plane = (map: THREE.Texture, color: number, opacity: number, size: number, y: number) => {
    const item = new THREE.Mesh(own(new THREE.PlaneGeometry(size, size)), material(new THREE.MeshBasicMaterial({
      map, color, opacity, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    })))
    item.rotation.x = -Math.PI / 2
    item.position.y = y
    root.add(item)
    return item
  }
  const dummy = new THREE.Object3D(), identity = new THREE.Quaternion()

  if (cue.kind === 'tornado') {
    // Original exported storm and wind-ring UV meshes replace the procedural wire coils.
    const stormGeometry = own(assets.meshes.storm.clone())
    stormGeometry.rotateX(-Math.PI / 2)
    const veil = texture('wind')
    veil.wrapS = THREE.RepeatWrapping
    const storm = new THREE.Mesh(stormGeometry, material(new THREE.MeshBasicMaterial({
      map: veil, color: 0xffe8c2, opacity: .48, side: THREE.DoubleSide,
    })))
    storm.scale.setScalar(7.4)
    root.add(storm)
    const pattern = texture('pattern'), mask = texture('mask')
    pattern.wrapS = pattern.wrapT = THREE.RepeatWrapping
    const undercurrent = new THREE.Mesh(own(assets.meshes.ground.clone()), material(new THREE.MeshBasicMaterial({
      map: pattern, alphaMap: mask, color: 0xf5c46f, opacity: .26, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    })))
    undercurrent.rotation.x = -Math.PI / 2
    undercurrent.scale.setScalar(1.65)
    undercurrent.position.y = .025
    root.add(undercurrent)
    const moon = plane(texture('crescent'), 0xffb35b, .85, 3.5, .045)
    const glow = plane(texture('glow'), 0xffb451, .48, 2.6, .035)
    const ringGeometry = own(assets.meshes.ring.clone())
    for (let i = 0; i < 3; i++) {
      const map = texture('ribbon')
      map.wrapS = THREE.RepeatWrapping
      const ring = new THREE.Mesh(ringGeometry, material(new THREE.MeshBasicMaterial({
        map, color: i === 1 ? 0xffd490 : 0xfff3df, opacity: .52 - i * .08, side: THREE.DoubleSide,
      })))
      ring.scale.set(2.3 + i * .85, 3.4, 2.3 + i * .85)
      ring.position.y = .25 + i * .82
      root.add(ring)
      updates.push(seconds => {
        ring.rotation.y = seconds * (i % 2 ? 5 : -6) + i * 2
        ring.rotation.z = Math.sin(seconds * 2 + i) * .09
        map.offset.x = -seconds * .65 + i * .3
      })
    }
    for (let i = 0; i < 2; i++) {
      const mist = sprite(texture('wind'), 0xffecc9, .13)
      mist.scale.set(3.4, 2.3, 1)
      mist.position.y = 1.35 + i * .45
      updates.push(seconds => { mist.material.rotation = Math.sin(seconds * 1.7 + i) * .3 })
    }
    for (let i = 0; i < 12; i++) {
      const star = sprite(texture('star'), 0xffdf9b, .8, true)
      updates.push(seconds => {
        const phase = (seconds * .7 + i * .137) % 1, angle = i * 2.4 - seconds * 3.8
        star.position.set(Math.cos(angle) * (1.1 + phase * .65), .2 + phase * 2.6, Math.sin(angle) * (1.1 + phase * .65))
        star.scale.setScalar(.11 + Math.sin(phase * Math.PI) * .08)
        star.material.opacity *= Math.sin(phase * Math.PI)
      })
    }
    updates.push(seconds => {
      storm.rotation.y = -seconds * 4.2
      veil.offset.x = seconds * .3
      pattern.offset.set(seconds * .12, -seconds * .2)
      moon.rotation.z = seconds * 2.1
      glow.material.opacity *= .8 + .2 * Math.sin(seconds * 5)
    })
  } else {
    // The supplied 2×2 smoke atlas is thin mist, not opaque geometry clouds.
    for (let i = 0; i < 6; i++) {
      const map = texture('smoke')
      setWeatherFrame(map, i % 4, 2, 2)
      const cloud = sprite(map, 0xc0dcf0, .42)
      cloud.scale.set(2.4, 1.6, 1)
      cloud.position.set((i % 3 - 1) * 1.05, 2.9 + Math.floor(i / 3) * .35, -.25 + (i % 2) * .4)
      updates.push(seconds => { cloud.material.rotation = Math.sin(seconds * .5 + i) * .12 })
    }
    const hazeMap = texture('smoke')
    setWeatherFrame(hazeMap, 0, 2, 2)
    const haze = plane(hazeMap, 0x428fc0, .4, 4.6, .02)
    updates.push(seconds => { haze.rotation.z = seconds * .12 })
    const drops = new THREE.InstancedMesh(own(new THREE.PlaneGeometry(1, 1)),
      material(new THREE.MeshBasicMaterial({ map: texture('rain'), color: 0xc0e6ff, opacity: .85, side: THREE.DoubleSide })), 110)
    own(drops)
    drops.frustumCulled = false
    root.add(drops)
    const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2 + .08)
    updates.push(seconds => {
      for (let i = 0; i < drops.count; i++) {
        const fall = (i * .173 + seconds / .55) % 1, angle = i * 2.39996
        const radius = Math.sqrt((i + .5) / drops.count) * 1.65
        dummy.position.set(Math.cos(angle) * radius - fall * .18, .15 + (1 - fall) * 3.1, Math.sin(angle) * radius * .72)
        dummy.quaternion.copy(camera?.quaternion ?? identity).multiply(tilt)
        dummy.scale.set(.75 + (i % 5) * .09, .045 + (i % 3) * .008, 1)
        dummy.updateMatrix()
        drops.setMatrixAt(i, dummy.matrix)
      }
      drops.instanceMatrix.needsUpdate = true
    })
    for (let i = 0; i < 12; i++) {
      const map = texture('splash'), rippleMap = texture('ripple')
      const splash = sprite(map, 0xd3eeff, .7)
      splash.center.set(.5, .12)
      splash.position.set(Math.cos(i * 2.4) * (i % 2 ? 1.35 : .75), .035, Math.sin(i * 2.4) * .95)
      splash.scale.set(.58, .58, 1)
      const ripple = plane(rippleMap, 0xa3dcff, .4, .75, .025 + i * .0004)
      ripple.position.x = splash.position.x
      ripple.position.z = splash.position.z
      updates.push(seconds => {
        const cycle = (seconds + i * .137) % .75, age = cycle / .32
        splash.visible = age < 1
        setWeatherFrame(map, Math.min(15, age * 16), 4, 4)
        setWeatherFrame(rippleMap, cycle / .75 * 16, 4, 4)
        ripple.scale.setScalar(.75 + cycle)
        ripple.material.opacity *= 1 - cycle / .75
      })
    }
  }
  scene.add(root)
  return {
    cue, root,
    frame(elapsed, progress) {
      const fade = cue.reducedMotion ? 1 : Math.min(1, progress / .12, (1 - progress) / .24)
      root.scale.setScalar(cue.reducedMotion ? .8 : .8 + .2 * Math.min(1, progress / .16))
      fades.forEach(({ material, opacity }) => { material.opacity = opacity * Math.max(0, fade) })
      updates.forEach(update => update(cue.reducedMotion ? .45 : elapsed / 1000))
    },
    dispose() { root.removeFromParent(); resources.forEach(resource => resource.dispose()); resources.clear() },
  }
}

export function createYaotongKongWeather(options: {
  scene: THREE.Scene
  cues(): readonly KongWeatherCue[]
  localSeat(): number
  assets: WeatherAssets | null
  camera?: THREE.Camera
}) {
  const active = new Map<number, WeatherEffect>()
  let localSeat = options.localSeat()
  function dispose() { active.forEach(effect => effect.dispose()); active.clear() }
  function animate(now: number) {
    if (!options.assets) return false
    if (options.localSeat() !== localSeat) { dispose(); localSeat = options.localSeat() }
    const current = options.cues().filter(cue => now >= cue.startedAt && now < cue.startedAt + cue.duration).slice(-4)
    const ids = new Set(current.map(cue => cue.id))
    for (const [id, effect] of active) if (!ids.has(id)) { effect.dispose(); active.delete(id) }
    for (const cue of current) {
      let effect = active.get(cue.id)
      if (!effect) { effect = buildWeather(options.scene, cue, localSeat, options.assets, options.camera); active.set(cue.id, effect) }
      effect.frame(now - cue.startedAt, (now - cue.startedAt) / cue.duration)
    }
    return active.size > 0
  }
  return { animate, dispose, get visibleCues() { return [...active.values()].map(effect => ({ seat: effect.cue.seat, kind: effect.cue.kind })) } }
}
