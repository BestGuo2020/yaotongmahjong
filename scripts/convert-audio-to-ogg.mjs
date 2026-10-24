#!/usr/bin/env node
/**
 * 把 public/audio 下的 WAV/MP3 母版转成 Ogg Vorbis。
 *
 * 用法：
 *   node scripts/convert-audio-to-ogg.mjs [--force] [--prune]
 *   node scripts/convert-audio-to-ogg.mjs --verify
 *
 * - 输出与源文件同目录同名，只把扩展名换成 .ogg（bgm/ 与 sounds/ 都适用）。
 * - 已存在且比源文件新的 .ogg 会跳过；--force 强制重转。
 * - 编码：libvorbis；bgm/ 用 q5（音乐），sounds/ 用 q4（音效）。
 *   Vorbis 而非 Opus：<audio> 与 decodeAudioData 的浏览器兼容面更大。
 * - --prune 在时长校验通过后删除 WAV/MP3 母版（运行时不加载它们）。
 * - --verify 只校验已有 .ogg 与母版的时长，不转码。
 */
import { spawnSync } from 'node:child_process'
import { readdirSync, statSync, unlinkSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AUDIO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public/audio')
const SOURCE_EXTENSIONS = new Set(['.wav', '.mp3'])
const QUALITY = { bgm: '5', sounds: '4' }
const args = new Set(process.argv.slice(2))
const force = args.has('--force')
const prune = args.has('--prune')
const verifyOnly = args.has('--verify')

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(path)
    else if (SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase())) yield path
  }
}

function qualityFor(source) {
  const top = relative(AUDIO_ROOT, source).split(/[\\/]/)[0]
  return QUALITY[top] ?? QUALITY.sounds
}

function run(command, argv) {
  const result = spawnSync(command, argv, { encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}): ${result.stderr.trim()}`)
  return result.stdout.trim()
}

function probeDuration(file) {
  const seconds = run('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file,
  ])
  return Number(seconds)
}

const sources = [...walk(AUDIO_ROOT)].sort()
const converted = []
const skipped = []
const verified = []
const problems = []

for (const source of sources) {
  const output = source.replace(/\.(wav|mp3)$/i, '.ogg')
  const label = relative(AUDIO_ROOT, source)
  let upToDate = false
  try {
    upToDate = !force && statSync(output).mtimeMs >= statSync(source).mtimeMs
  } catch {
    upToDate = false
  }
  if (verifyOnly) {
    try {
      statSync(output)
    } catch {
      problems.push(`${label}: missing ${relative(AUDIO_ROOT, output)}`)
      continue
    }
  } else if (upToDate) {
    skipped.push(label)
  } else {
    run('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', source,
      '-vn', '-c:a', 'libvorbis', '-q:a', qualityFor(source),
      output,
    ])
    converted.push(label)
  }

  // 时长必须与源文件一致（允许一帧的量化误差）。
  const expected = probeDuration(source)
  const actual = probeDuration(output)
  if (!(Math.abs(expected - actual) < 0.1)) {
    problems.push(`${label}: duration ${actual.toFixed(3)}s != ${expected.toFixed(3)}s`)
    continue
  }
  verified.push(source)
}

const pruned = []
if (prune && !verifyOnly) {
  for (const source of verified) {
    unlinkSync(source)
    pruned.push(relative(AUDIO_ROOT, source))
  }
}

for (const label of converted) console.log(`converted ${label}`)
for (const label of skipped) console.log(`skipped   ${label} (ogg up to date)`)
for (const label of pruned) console.log(`pruned    ${label}`)
if (problems.length) {
  for (const problem of problems) console.error(`ERROR ${problem}`)
  process.exitCode = 1
} else {
  const prunedNote = pruned.length ? `, ${pruned.length} masters pruned` : ''
  console.log(`\n${converted.length} converted, ${skipped.length} skipped${prunedNote}, all durations verified.`)
}
