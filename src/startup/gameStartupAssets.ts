import { TABLE_THEMES } from '../components/table/three/tableTheme'
import { emoteArtUrls } from '../components/yaotong/emoteArtAssets'
import { AUDIO_ASSETS } from '../game/core/presentation/audioAssets'
import { DEFAULT_AVATARS } from '../game/core/presentation/avatar'
import { materializeImage } from '../game/core/presentation/imagePreload'
import { animeCharacterAssetUrls } from '../game/core/presentation/llmAnimeAssets'
import { preloadTileImages, tileBackUrl } from '../game/core/presentation/tileAssets'
import { ANIME_CHARACTER_IDS } from '../game/llm/animeCharacters'
import { TABLE_THEME_NAMES, type TableThemeName } from '../theme/themeIdentity'
import { lobbyThemeImageUrl, resolveThemeAssetUrl, THEME_PRESENTATIONS } from '../theme/themePresentation'

export class StartupModuleError extends Error {}

async function loadModule<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load()
  } catch (error) {
    throw new StartupModuleError('游戏模块加载失败', { cause: error })
  }
}

export function gameStartupTasks(theme: TableThemeName, preloadAudio: (file: string) => Promise<void>) {
  const music = AUDIO_ASSETS.filter(file => file.startsWith('bgm/'))
  const imageUrls = new Set([
    ...DEFAULT_AVATARS,
    ...emoteArtUrls,
    ...TABLE_THEME_NAMES.map(name => THEME_PRESENTATIONS[name].identity.previewUrl),
    ...TABLE_THEME_NAMES.filter(name => name !== 'llmAnime').map(lobbyThemeImageUrl),
    ...Object.values(TABLE_THEMES).flatMap(({ tableSurfaceTexture }) => tableSurfaceTexture ? [tableSurfaceTexture.url] : []),
    ...animeCharacterAssetUrls(ANIME_CHARACTER_IDS),
    tileBackUrl('llmAnime'),
    resolveThemeAssetUrl('img/tips.png'),
  ])

  return [
    () => loadModule(() => import('../components/MahjongTable3D.vue')),
    async () => {
      const { preloadWeatherAssets } = await loadModule(() => import('../components/table/three/yaotongWeatherAssets'))
      await preloadWeatherAssets()
    },
    () => loadModule(() => import('../components/replay/ReplayViewer.vue')),
    () => loadModule(() => import('../content/yaotongRulesHtml')),
    () => preloadTileImages(theme),
    () => preloadTileImages(theme === 'llmAnime' ? 'jade' : 'llmAnime'),
    ...music.map(file => () => preloadAudio(file)),
    ...[...imageUrls].map(url => () => materializeImage(url)),
    ...AUDIO_ASSETS.filter(file => !file.startsWith('bgm/')).map(file => () => preloadAudio(file)),
  ]
}
