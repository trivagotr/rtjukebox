import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

import sharp from 'sharp'

const journeyDir = path.resolve(process.argv[2] ?? '../artifacts/study-game/mobile-touch-journey')
const videoPath = path.join(journeyDir, 'mobile-touch-journey.webm')
const framesDir = path.join(journeyDir, 'frames-8fps')
const reportPath = path.join(journeyDir, 'frame-analysis.json')
const contactSheetPath = path.join(journeyDir, 'state-contact-sheet.png')
const avatarContactSheetPath = path.join(journeyDir, 'avatar-state-contact-sheet.png')

await rm(framesDir, { recursive: true, force: true })
await mkdir(framesDir, { recursive: true })

const ffmpeg = spawnSync('ffmpeg', [
  '-hide_banner', '-loglevel', 'error', '-y', '-i', videoPath,
  '-vf', 'fps=8', path.join(framesDir, 'frame-%05d.png'),
], { encoding: 'utf8' })
if (ffmpeg.status !== 0) throw new Error(ffmpeg.stderr || 'ffmpeg frame extraction failed')

const files = (await readdir(framesDir)).filter((file) => file.endsWith('.png')).sort()
const frames = []
let previousPixels = null
for (const [index, file] of files.entries()) {
  const input = path.join(framesDir, file)
  const { data, info } = await sharp(input)
    .resize({ width: 48, height: 104, fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let meanDelta = null
  if (previousPixels) {
    let total = 0
    for (let offset = 0; offset < data.length; offset += 1) total += Math.abs(data[offset] - previousPixels[offset])
    meanDelta = total / data.length
  }
  frames.push({
    file,
    atMs: Math.round(index * 125),
    meanDelta,
    digest: createHash('sha256').update(data).digest('hex').slice(0, 16),
    width: info.width,
    height: info.height,
  })
  previousPixels = data
}

const journey = JSON.parse(await readFile(path.join(journeyDir, 'journey.json'), 'utf8'))
const movingSamples = journey.telemetry.filter((sample) => ['walking', 'stair', 'sitting', 'standing'].includes(sample.state))
let telemetryIndex = -1
for (const frame of frames) {
  while (
    telemetryIndex + 1 < journey.telemetry.length
    && journey.telemetry[telemetryIndex + 1].atMs <= frame.atMs
  ) telemetryIndex += 1
  if (telemetryIndex >= 0) {
    const sample = journey.telemetry[telemetryIndex]
    frame.state = sample.state
    frame.avatarScreen = {
      x: sample.camera.x + (sample.position.x - sample.camera.worldViewX) * sample.camera.zoom,
      y: sample.camera.y + (sample.position.y - sample.camera.worldViewY) * sample.camera.zoom,
    }
  } else {
    frame.state = 'loading'
    frame.avatarScreen = null
  }
}
const stationaryRunThreshold = 8
let longestNearDuplicateRun = 0
let nearDuplicateRun = 0
for (const frame of frames) {
  const moving = ['walking', 'stair', 'sitting', 'standing'].includes(frame.state)
  if (moving && frame.meanDelta !== null && frame.meanDelta < 0.000_001) {
    nearDuplicateRun += 1
    longestNearDuplicateRun = Math.max(longestNearDuplicateRun, nearDuplicateRun)
  } else {
    nearDuplicateRun = 0
  }
}

const representativeStates = ['ready', 'walking', 'sitting', 'seated', 'standing']
const representativeFrames = representativeStates.flatMap((state) => {
  const frame = frames.find((candidate) => candidate.state === state)
  return frame ? [{ state, ...frame }] : []
})
const contactFrames = await Promise.all(representativeFrames.map(async (frame) => ({
  input: await sharp(path.join(framesDir, frame.file)).resize({ width: 196, height: 426, fit: 'fill' }).png().toBuffer(),
  left: representativeFrames.indexOf(frame) * 196,
  top: 0,
})))
if (contactFrames.length > 0) {
  await sharp({
    create: { width: contactFrames.length * 196, height: 426, channels: 4, background: { r: 10, g: 15, b: 18, alpha: 1 } },
  }).composite(contactFrames).png().toFile(contactSheetPath)
}
const avatarContactFrames = await Promise.all(representativeFrames.map(async (frame, index) => {
  const source = path.join(framesDir, frame.file)
  const metadata = await sharp(source).metadata()
  const cropWidth = 96
  const cropHeight = 128
  const left = Math.max(0, Math.min((metadata.width ?? 393) - cropWidth, Math.round(frame.avatarScreen.x - cropWidth / 2)))
  const top = Math.max(0, Math.min((metadata.height ?? 852) - cropHeight, Math.round(frame.avatarScreen.y - 108)))
  return {
    input: await sharp(source)
      .extract({ left, top, width: cropWidth, height: cropHeight })
      .resize({ width: 192, height: 256, fit: 'fill' })
      .png()
      .toBuffer(),
    left: index * 192,
    top: 0,
  }
}))
if (avatarContactFrames.length > 0) {
  await sharp({
    create: { width: avatarContactFrames.length * 192, height: 256, channels: 4, background: { r: 10, g: 15, b: 18, alpha: 1 } },
  }).composite(avatarContactFrames).png().toFile(avatarContactSheetPath)
}

const report = {
  videoPath,
  frameRate: 8,
  frameCount: frames.length,
  durationMs: frames.length * 125,
  taps: journey.taps.length,
  telemetrySamples: journey.telemetry.length,
  movingSamples: movingSamples.length,
  statesObserved: [...new Set(journey.telemetry.map((sample) => sample.state))],
  seatedObserved: journey.telemetry.some((sample) => sample.state === 'seated'),
  consoleErrors: journey.consoleErrors,
  longestNearDuplicateRun,
  unexpectedFreeze: movingSamples.length > 0 && longestNearDuplicateRun >= stationaryRunThreshold,
  contactSheetPath,
  avatarContactSheetPath,
  representativeFrames: representativeFrames.map(({ state, file, atMs }) => ({ state, file, atMs })),
  frames,
}

await writeFile(reportPath, JSON.stringify(report, null, 2))
console.log(JSON.stringify({
  reportPath,
  frameCount: report.frameCount,
  statesObserved: report.statesObserved,
  seatedObserved: report.seatedObserved,
  consoleErrors: report.consoleErrors.length,
  unexpectedFreeze: report.unexpectedFreeze,
}))
