// 图片预热：
// 1) `preloadImages` —— 把 URL 拉进浏览器 HTTP 缓存（轻量，不保留引用）；
// 2) `materializeImages` —— 抓成 blob URL 并预热解码，渲染时直接引用（对齐 tileAssets 的存法：
//    同源本地字节、不会再触发校验请求，解码结果已在浏览器图片缓存里）。
//
// 批量入口失败静默，启动加载使用严格的单图入口报告失败。
import { ref } from 'vue'

const IMAGE_TIMEOUT_MS = 15_000

// 本页已成功预取过的 URL：再次调用（主题往返、房间元数据轮询、设置重存）不再创建请求，
// 是否联网完全交给浏览器缓存，本模块不重复发起。失败的不记入，后续调用仍会重试。
const loaded = new Set<string>()

/** 原始 URL → blob URL；存活到页面结束（与 tileAssets 的 objectUrls 同口径）。 */
const materialized = new Map<string, string>()
const materializing = new Map<string, Promise<void>>()
/** 图片异步物化完成后通知已经挂载的头像与立绘重新读取 blob URL。 */
export const materializedImageVersion = ref(0)

function loadOne(url: string): Promise<boolean> {
  // 非浏览器环境（vitest 的 node 环境、SSR）：没有 Image，视为未加载，不触网。
  if (typeof Image === 'undefined') return Promise.resolve(false)
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve(true)
    image.onerror = () => resolve(false)
    image.src = url
  })
}

/**
 * 并发预取图片；同一批内的重复 URL 只请求一次，已预取成功的不再请求，
 * 始终 resolve（单张失败不阻塞其他图，且该 URL 之后仍可重试）。
 */
export function preloadImages(urls: Iterable<string | null | undefined>): Promise<void> {
  const fresh = [...new Set(urls)]
    .filter((url): url is string => Boolean(url) && !loaded.has(url))
  return Promise.all(fresh.map(async (url) => {
    if (await loadOne(url)) loaded.add(url)
  })).then(() => {})
}

/** 用于首屏门闸和 3D 纹理，等图片确认可以绘制后才计入完成。 */
export function loadDecodedImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const timeout = setTimeout(() => {
      finish(new Error('Image loading timed out'))
      image.removeAttribute('src')
    }, IMAGE_TIMEOUT_MS)
    function finish(error?: unknown) {
      clearTimeout(timeout)
      image.onload = null
      image.onerror = null
      if (error) reject(error)
      else resolve(image)
    }
    image.onload = () => {
      const decoding = typeof image.decode === 'function' ? image.decode() : Promise.resolve()
      void decoding.then(() => finish(), finish)
    }
    image.onerror = () => finish(new Error('Image loading failed'))
    image.src = url
  })
}

/** 同一原始 URL 复用请求和 blob，失败项可以重试。 */
export function materializeImage(url: string): Promise<void> {
  if (materialized.has(url)) return Promise.resolve()
  const existing = materializing.get(url)
  if (existing) return existing

  const task = (async () => {
    const response = await fetch(url, { cache: 'force-cache', signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) })
    if (!response.ok) throw new Error(`Image ${url}: HTTP ${response.status}`)
    const objectUrl = URL.createObjectURL(await response.blob())
    try {
      await loadDecodedImage(objectUrl)
      materialized.set(url, objectUrl)
      materializedImageVersion.value += 1
    } catch (error) {
      URL.revokeObjectURL(objectUrl)
      throw new Error(`Image ${url} could not be decoded`, { cause: error })
    }
  })().finally(() => materializing.delete(url))
  materializing.set(url, task)
  return task
}

/**
 * 把图片物化成 blob URL（同源本地字节，不再随 HTTP 缓存新鲜度重新校验）并预热解码。
 * 供「出现窗口很短、不能等一次网络往返 / 解码」的渲染点使用（例如 llmAnime 动作立绘）。
 * 失败静默：调用方用 `materializedImageSrc()` 拿不到就回退原始 URL，行为不会变差。
 */
export function materializeImages(urls: Iterable<string | null | undefined>): Promise<void> {
  if (typeof Image === 'undefined' || typeof fetch === 'undefined' || typeof URL?.createObjectURL !== 'function') return Promise.resolve()
  const targets = [...new Set(urls)].filter((url): url is string => Boolean(url))
  return Promise.allSettled(targets.map(materializeImage)).then(() => {})
}

/** 已物化好的 blob URL；还没就绪返回 null（调用方回退原始 URL）。 */
export function materializedImageSrc(url: string | null | undefined): string | null {
  void materializedImageVersion.value
  if (!url) return null
  return materialized.get(url) ?? null
}

/**
 * 渲染用图片来源：物化好就用本地 blob（不再随 HTTP 新鲜期做协商校验/重新下载），否则原样返回。
 * 用于「元素会被反复重建」的渲染点：座位头像、结算名单头像、动作立绘。
 */
export function displayImageSrc(url: string | null | undefined): string {
  return materializedImageSrc(url) ?? url ?? ''
}
