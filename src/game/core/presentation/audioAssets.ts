/** User-supplied WAV library. Logical legacy names remain valid for the original rulesets. */
export const DEFAULT_BGM_ASSET = 'bgm/bgm.wav'
export const READY_BGM_ASSET = 'bgm/ting_bgm.wav'
export const EFFECT_AUDIO_ASSETS = [
  ...['m', 'p', 's'].flatMap((suit) => Array.from({ length: 9 }, (_, i) => `sounds/${i + 1}${suit}.wav`)),
  ...[
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
  ].map((name) => `sounds/${name}.wav`),
] as const
export const AUDIO_ASSETS = [...EFFECT_AUDIO_ASSETS, DEFAULT_BGM_ASSET, READY_BGM_ASSET] as const
const available = new Set<string>(AUDIO_ASSETS)
const aliases: Readonly<Record<string, string>> = {
  'bg.ogg': DEFAULT_BGM_ASSET,
  'HuMusic.ogg': READY_BGM_ASSET,
  'bgm.wav': DEFAULT_BGM_ASSET,
  'ting_bgm.wav': READY_BGM_ASSET,
  'dice.mp3': 'sounds/touzi.wav',
  'deal.mp3': 'sounds/fapai.wav',
  'hu.mp3': 'sounds/chihu.wav',
  'hu_effect_sound.mp3': 'sounds/hu_effecct_sound.wav',
  'hu_effect_sound.wav': 'sounds/hu_effecct_sound.wav',
  'hufangmj.ogg': 'sounds/tuidao.wav',
  'chihushandian.ogg': 'sounds/chihushandian.wav',
}

/** No fabricated URL for removed click/honor/intro sounds; missing sounds never hold a game timer. */
export function resolveAudioAsset(name: string): string | null {
  if (available.has(name)) return name
  if (aliases[name]) return aliases[name]
  const candidate = `sounds/${name.replace(/\.(mp3|ogg|wav)$/i, '')}.wav`
  return available.has(candidate) ? candidate : null
}

export function resolveBgmAsset(name: string): string | null {
  const path = resolveAudioAsset(name)
  return path?.startsWith('bgm/') ? path : null
}
