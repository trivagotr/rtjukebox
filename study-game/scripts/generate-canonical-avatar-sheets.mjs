import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

const FRAME_WIDTH = 64
const FRAME_HEIGHT = 96
const DIRECTION_COUNT = 8
const REFERENCE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../art/avatar-reference/radiotedu-turnaround.png',
)
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }

async function cleanSpriteMatte(frame) {
  const { data, info } = await sharp(frame).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  for (let offset = 0; offset < data.length; offset += info.channels) {
    const pixel = Math.floor(offset / info.channels)
    const frameX = pixel % info.width
    const red = data[offset]
    const green = data[offset + 1]
    const blue = data[offset + 2]
    const alphaOffset = offset + 3
    const magentaSpill = red > 100 && blue > 100 && green < 80 && red > green * 1.4 && blue > green * 1.4
    if (data[alphaOffset] < 40 || magentaSpill || frameX < 9 || frameX >= info.width - 9) {
      data[offset] = 0
      data[offset + 1] = 0
      data[offset + 2] = 0
      data[alphaOffset] = 0
    }
  }
  return sharp(data, { raw: info }).png().toBuffer()
}

async function normalizedCell(source, extract) {
  // Decode the cell first. libvips may otherwise reorder trim ahead of extract,
  // making later rows address the already-trimmed full reference image.
  const cell = await sharp(source)
    .extract(extract)
    .png()
    .toBuffer()
  const trimmed = await sharp(cell)
    .trim({ background: TRANSPARENT, threshold: 4 })
    .resize({
      width: FRAME_WIDTH - 4,
      height: FRAME_HEIGHT - 4,
      fit: 'contain',
      position: 'south',
      background: TRANSPARENT,
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer()

  const frame = await sharp({
    create: { width: FRAME_WIDTH, height: FRAME_HEIGHT, channels: 4, background: TRANSPARENT },
  })
    .composite([{ input: trimmed, left: 2, top: 2 }])
    .png()
    .toBuffer()
  return cleanSpriteMatte(frame)
}

async function horizontalCharacterRanges(source, row, width) {
  const { data, info } = await sharp(source)
    .extract({ left: 0, top: row.top, width, height: row.height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const counts = Array(info.width).fill(0)
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * info.channels + 3] > 50) counts[x] += 1
    }
  }

  const ranges = []
  let start = -1
  let lastVisible = -1
  for (let x = 0; x < counts.length; x += 1) {
    if (counts[x] > 0) {
      if (start < 0) start = x
      lastVisible = x
    } else if (start >= 0 && x - lastVisible > 3) {
      const area = counts.slice(start, lastVisible + 1).reduce((sum, count) => sum + count, 0)
      if (area > 40 && lastVisible - start > 10) ranges.push([start, lastVisible])
      start = -1
    }
  }
  if (start >= 0) ranges.push([start, lastVisible])
  if (ranges.length !== DIRECTION_COUNT) {
    throw new Error(`Expected ${DIRECTION_COUNT} avatar columns, found ${ranges.length}`)
  }
  return ranges
}

async function referenceFrames() {
  const metadata = await sharp(REFERENCE_PATH).metadata()
  if (!metadata.width || !metadata.height) throw new Error('Avatar reference dimensions are unavailable')

  const splitY = Math.round(metadata.height * 0.545)
  const rows = [
    { top: 0, height: splitY },
    { top: splitY, height: metadata.height - splitY },
  ]
  const result = []

  for (const row of rows) {
    const frames = []
    const ranges = await horizontalCharacterRanges(REFERENCE_PATH, row, metadata.width)
    for (const [rangeLeft, rangeRight] of ranges) {
      const left = Math.max(0, rangeLeft - 2)
      const right = Math.min(metadata.width, rangeRight + 3)
      frames.push(await normalizedCell(REFERENCE_PATH, {
        left,
        top: row.top,
        width: right - left,
        height: row.height,
      }))
    }
    result.push(frames)
  }

  return { seated: result[1], standing: result[0] }
}

async function strideFrame(frame, phase) {
  if (phase === 1 || phase === 3) {
    const lifted = await sharp(frame).extract({ left: 0, top: 1, width: FRAME_WIDTH, height: FRAME_HEIGHT - 1 }).png().toBuffer()
    return sharp({ create: { width: FRAME_WIDTH, height: FRAME_HEIGHT, channels: 4, background: TRANSPARENT } })
      .composite([{ input: lifted, left: 0, top: 0 }])
      .png()
      .toBuffer()
  }

  const splitY = 64
  const upper = await sharp(frame).extract({ left: 0, top: 0, width: FRAME_WIDTH, height: splitY }).png().toBuffer()
  const leftLeg = await sharp(frame).extract({ left: 0, top: splitY, width: FRAME_WIDTH / 2, height: FRAME_HEIGHT - splitY }).png().toBuffer()
  const rightLeg = await sharp(frame).extract({ left: FRAME_WIDTH / 2, top: splitY, width: FRAME_WIDTH / 2, height: FRAME_HEIGHT - splitY }).png().toBuffer()
  const leftDrop = phase === 0 ? 0 : 2
  const rightDrop = phase === 0 ? 2 : 0
  return sharp({ create: { width: FRAME_WIDTH, height: FRAME_HEIGHT, channels: 4, background: TRANSPARENT } })
    .composite([
      { input: upper, left: 0, top: 0 },
      { input: leftLeg, left: 0, top: splitY + leftDrop },
      { input: rightLeg, left: FRAME_WIDTH / 2, top: splitY + rightDrop },
    ])
    .png()
    .toBuffer()
}

async function risingFrame(frame) {
  const compressed = await sharp(frame)
    .resize({ width: FRAME_WIDTH - 2, height: FRAME_HEIGHT - 10, fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer()
  return sharp({ create: { width: FRAME_WIDTH, height: FRAME_HEIGHT, channels: 4, background: TRANSPARENT } })
    .composite([{ input: compressed, left: 1, top: 10 }])
    .png()
    .toBuffer()
}

async function actionFrames(action, direction, standing, seated) {
  if (action === 'idle') return [standing[direction]]
  if (action === 'sit') return [seated[direction]]
  if (action === 'walk') {
    return Promise.all([0, 1, 2, 3].map((phase) => strideFrame(standing[direction], phase)))
  }
  if (action === 'stand') {
    return [seated[direction], await risingFrame(standing[direction]), standing[direction]]
  }
  throw new Error(`Unsupported canonical avatar action: ${action}`)
}

async function createActionSheet(action, frameCount, standing, seated) {
  const composites = []
  for (let direction = 0; direction < DIRECTION_COUNT; direction += 1) {
    const frames = await actionFrames(action, direction, standing, seated)
    if (frames.length !== frameCount) throw new Error(`${action} expected ${frameCount} frames, received ${frames.length}`)
    frames.forEach((input, frame) => {
      composites.push({ input, left: frame * FRAME_WIDTH, top: direction * FRAME_HEIGHT })
    })
  }

  return sharp({
    create: {
      width: FRAME_WIDTH * frameCount,
      height: FRAME_HEIGHT * DIRECTION_COUNT,
      channels: 4,
      background: TRANSPARENT,
    },
  })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toBuffer()
}

export async function generateCanonicalAvatarSheets(outputDir, actionFrames) {
  const { standing, seated } = await referenceFrames()
  const canonical = {}
  const canonicalSha256 = {}

  for (const [action, frameCount] of Object.entries(actionFrames)) {
    const fileName = `canonical-${action}.png`
    const image = await createActionSheet(action, frameCount, standing, seated)
    await writeFile(path.join(outputDir, fileName), image)
    canonical[action] = fileName
    canonicalSha256[action] = createHash('sha256').update(image).digest('hex')
  }

  return { canonical, canonicalSha256 }
}
