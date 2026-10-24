/**
 * User-supplied sound library, encoded as Ogg Vorbis.
 * The WAV/MP3 masters are converted by `scripts/convert-audio-to-ogg.mjs`;
 * logical legacy names (`.mp3`/`.wav`) remain valid for the original rulesets.
 */
export const DEFAULT_BGM_ASSET = 'bgm/bgm.ogg'
export const READY_BGM_ASSET = 'bgm/ting_bgm.ogg'
export const EFFECT_AUDIO_ASSETS = [
  ...['m', 'p', 's'].flatMap((suit) => Array.from({ length: 9 }, (_, i) => `sounds/${i + 1}${suit}.ogg`)),
  ...[
    'game_start',
    'peng',
    'gang',
    'zimo',
    'chihu',
    'ting',
    'fapai',
    'touzi',
    'tuidao',
    'hu_effecct_sound',
    'chihushandian',
    'chongfengji',
    'zerenji',
    'angang_rainy',
    'mingang_windy',
    'bugang',
    'zhuanwangang',
  ].map((name) => `sounds/${name}.ogg`),
] as const
export const AUDIO_ASSETS = [...EFFECT_AUDIO_ASSETS, DEFAULT_BGM_ASSET, READY_BGM_ASSET] as const
const available = new Set<string>(AUDIO_ASSETS)
const aliases: Readonly<Record<string, string>> = {
  'bg.ogg': DEFAULT_BGM_ASSET,
  'HuMusic.ogg': READY_BGM_ASSET,
  'bgm.wav': DEFAULT_BGM_ASSET,
  'ting_bgm.wav': READY_BGM_ASSET,
  'dice.mp3': 'sounds/touzi.ogg',
  'deal.mp3': 'sounds/fapai.ogg',
  'hu.mp3': 'sounds/chihu.ogg',
  'hu_effect_sound.mp3': 'sounds/hu_effecct_sound.ogg',
  'hu_effect_sound.wav': 'sounds/hu_effecct_sound.ogg',
  'hufangmj.ogg': 'sounds/tuidao.ogg',
  'chihushandian.ogg': 'sounds/chihushandian.ogg',
}

/** No fabricated URL for removed click/honor sounds; missing sounds never hold a game timer. */
export function resolveAudioAsset(name: string): string | null {
  if (available.has(name)) return name
  if (aliases[name]) return aliases[name]
  // Legacy logical names (e.g. `peng.wav`, `5m.mp3`) resolve to the Ogg Vorbis asset.
  const candidate = `sounds/${name.replace(/\.(mp3|ogg|wav)$/i, '')}.ogg`
  return available.has(candidate) ? candidate : null
}

export function resolveBgmAsset(name: string): string | null {
  const path = resolveAudioAsset(name)
  return path?.startsWith('bgm/') ? path : null
}
