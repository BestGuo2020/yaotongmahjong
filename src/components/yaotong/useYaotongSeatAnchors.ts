import { onMounted, onBeforeUnmount, shallowRef, type Ref } from 'vue'

export function useYaotongSeatAnchors(root: Ref<HTMLElement | null>) {
  const size = shallowRef({ width: 1, height: 1 })
  const anchors = shallowRef<Record<number, { x: number; y: number; cardBottom: number }>>({})
  let observer: ResizeObserver | undefined
  function measure() {
    const host = root.value
    if (!host) return
    const rect = host.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const width = host.clientWidth,
      height = host.clientHeight
    const found: typeof anchors.value = {}
    for (let seat = 0; seat < 4; seat++) {
      const card = host.parentElement?.querySelector(`[data-yaotong-seat="${seat}"]`)
      const avatar = card?.querySelector('.avatar')
      if (!avatar) continue
      const a = avatar.getBoundingClientRect()
      found[seat] = {
        x: ((a.left + a.width / 2 - rect.left) * width) / rect.width,
        y: ((a.top + a.height / 2 - rect.top) * height) / rect.height,
        cardBottom: ((card!.getBoundingClientRect().bottom - a.top - a.height / 2) * height) / rect.height,
      }
    }
    size.value = { width, height }
    anchors.value = found
  }
  onMounted(() => {
    measure()
    observer = new ResizeObserver(measure)
    observer.observe(root.value!)
    root
      .value!.parentElement?.querySelectorAll('[data-yaotong-seat]')
      .forEach((seat) => observer!.observe(seat))
    window.addEventListener('resize', measure)
  })
  onBeforeUnmount(() => {
    observer?.disconnect()
    window.removeEventListener('resize', measure)
  })
  return { size, anchors, measure }
}
