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
  generateAvatarAssets,
} from '../scripts/generate-engine-avatar-assets.mjs'

test('generates independent layered sprite sheets for every engine-proof action', async () => {
  const outputDir = await mkdtemp(path.join(tmpdir(), 'rtjukebox-avatar-assets-'))

  try {
    const manifestPath = await generateAvatarAssets(outputDir)
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))

    assert.deepEqual(manifest.directions, DIRECTIONS)
    assert.deepEqual(manifest.layers, LAYERS)
    assert.equal(manifest.frame.width, FRAME_WIDTH)
    assert.equal(manifest.frame.height, FRAME_HEIGHT)

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
  } finally {
    await rm(outputDir, { recursive: true, force: true })
  }
})
