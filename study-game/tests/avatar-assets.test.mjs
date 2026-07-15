import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import sharp from 'sharp'

import {
  ACTION_FRAMES,
  DIRECTIONS,
  FRAME_HEIGHT,
  FRAME_WIDTH,
  LAYERS,
  WEARABLE_VARIANTS,
  generateAvatarAssets,
} from '../scripts/generate-engine-avatar-assets.mjs'

async function directionFrameHash(file, direction) {
  const row = DIRECTIONS.indexOf(direction)
  assert.notEqual(row, -1, `unknown direction ${direction}`)
  const pixels = await sharp(file)
    .extract({ left: 0, top: row * FRAME_HEIGHT, width: FRAME_WIDTH, height: FRAME_HEIGHT })
    .raw()
    .toBuffer()
  return Buffer.from(pixels).toString('base64')
}

async function visibleMagentaPixelCount(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let count = 0
  for (let offset = 0; offset < data.length; offset += info.channels) {
    const [red, green, blue, alpha] = data.subarray(offset, offset + 4)
    if (alpha > 20 && red > 100 && blue > 100 && green < 80) count += 1
  }
  return count
}

async function faintAlphaPixelCount(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let count = 0
  for (let offset = 3; offset < data.length; offset += info.channels) {
    if (data[offset] > 0 && data[offset] < 40) count += 1
  }
  return count
}

async function spriteBorderPixelCount(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let count = 0
  for (let offset = 3; offset < data.length; offset += info.channels) {
    const pixel = Math.floor(offset / info.channels)
    const frameX = (pixel % info.width) % FRAME_WIDTH
    if (data[offset] > 20 && (frameX < 9 || frameX >= FRAME_WIDTH - 9)) count += 1
  }
  return count
}

test('generates independent layered sprite sheets for every engine-proof action', async () => {
  const outputDir = await mkdtemp(path.join(tmpdir(), 'rtjukebox-avatar-assets-'))

  try {
    const manifestPath = await generateAvatarAssets(outputDir)
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))

    assert.deepEqual(manifest.directions, DIRECTIONS)
    assert.deepEqual(manifest.layers, LAYERS)
    assert.equal(manifest.frame.width, FRAME_WIDTH)
    assert.equal(manifest.frame.height, FRAME_HEIGHT)
    assert.equal(
      manifest.provenance.visualReference,
      'study-game/art/avatar-reference/radiotedu-turnaround.png',
    )

    for (const [action, frameCount] of Object.entries(ACTION_FRAMES)) {
      const fileName = `canonical-${action}.png`
      const metadata = await sharp(path.join(outputDir, fileName)).metadata()
      assert.equal(metadata.width, FRAME_WIDTH * frameCount)
      assert.equal(metadata.height, FRAME_HEIGHT * DIRECTIONS.length)
      assert.equal(metadata.hasAlpha, true)
      assert.equal(manifest.canonical[action], fileName)
      assert.match(manifest.canonicalSha256[action], /^[0-9a-f]{64}$/)
    }
    assert.equal(await visibleMagentaPixelCount(path.join(outputDir, 'canonical-idle.png')), 0)
    assert.equal(await faintAlphaPixelCount(path.join(outputDir, 'canonical-idle.png')), 0)
    assert.equal(await spriteBorderPixelCount(path.join(outputDir, 'canonical-idle.png')), 0)

    for (const layer of LAYERS) {
      for (const [action, frameCount] of Object.entries(ACTION_FRAMES)) {
        const file = path.join(outputDir, `${layer}-${action}.png`)
        const metadata = await sharp(file).metadata()
        const stats = await sharp(file).stats()

        assert.equal(metadata.width, FRAME_WIDTH * frameCount)
        assert.equal(metadata.height, FRAME_HEIGHT * DIRECTIONS.length)
        assert.equal(metadata.hasAlpha, true)
        assert.ok(stats.channels[3].max > 0, `${layer}-${action} must contain visible pixels`)
        assert.equal(manifest.sheets[layer][action], `${layer}-${action}.png`)
        assert.match(manifest.sha256[layer][action], /^[0-9a-f]{64}$/)
      }
    }

    assert.ok(WEARABLE_VARIANTS.top.length >= 2)
    assert.ok(WEARABLE_VARIANTS.bottom.length >= 2)
    assert.ok(WEARABLE_VARIANTS.shoes.length >= 2)
    assert.ok(WEARABLE_VARIANTS.hat.length >= 2)

    for (const [slot, itemIds] of Object.entries(WEARABLE_VARIANTS)) {
      for (const itemId of itemIds) {
        for (const [action, frameCount] of Object.entries(ACTION_FRAMES)) {
          const fileName = `${slot}-${itemId}-${action}.png`
          const file = path.join(outputDir, fileName)
          const metadata = await sharp(file).metadata()
          const stats = await sharp(file).stats()

          assert.equal(metadata.width, FRAME_WIDTH * frameCount)
          assert.equal(metadata.height, FRAME_HEIGHT * DIRECTIONS.length)
          assert.ok(stats.channels[3].max > 0, `${fileName} must contain visible pixels`)
          assert.equal(manifest.wearables[slot][itemId][action], fileName)
          assert.match(manifest.wearableSha256[slot][itemId][action], /^[0-9a-f]{64}$/)
        }
      }
    }

    for (const fileName of [
      'skin-idle.png',
      'hair-idle.png',
      'top-radio-hoodie-idle.png',
      'bottom-black-cargos-idle.png',
      'hat-bucket-hat-idle.png',
    ]) {
      const file = path.join(outputDir, fileName)
      const back = await directionFrameHash(file, 'n')
      const front = await directionFrameHash(file, 's')
      assert.notEqual(back, front, `${fileName} must render distinct front and rear artwork`)
    }
  } finally {
    await rm(outputDir, { recursive: true, force: true })
  }
})
