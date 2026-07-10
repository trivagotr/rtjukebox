import assert from 'node:assert/strict'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { generateImageRoomData } from '../scripts/generate-image-room-data.mjs'

test('generates exact user-supplied Library and Chim Alan navigation data', async () => {
  const outputDir = await mkdtemp(path.join(tmpdir(), 'rtjukebox-image-rooms-'))
  const outputPath = path.join(outputDir, 'image-rooms.generated.json')
  const assetOutputRoot = path.join(outputDir, 'occlusion')
  try {
    await generateImageRoomData(outputPath, assetOutputRoot)
    const data = JSON.parse(await readFile(outputPath, 'utf8'))
    const library = data.rooms.library
    const chim = data.rooms['chim-alan']

    assert.equal(library.image.width, 941)
    assert.equal(library.image.height, 1672)
    assert.equal(library.image.sha256, '7c4b055c9ed8c5cea91e9cc7d2ce55bf718299a2804d0d1e0dc91b7027fa3828')
    assert.ok(library.nodes.length >= 40)
    assert.equal(library.seats.length, 51)
    assert.ok(library.occluders.length >= 10)
    assert.match(library.occluders[0].asset.url, /^assets\/rooms\/occlusion\/library\//)
    assert.ok(library.seats.every((seat) => seat.foregroundAsset?.url))
    await access(path.join(assetOutputRoot, 'library', path.basename(library.occluders[0].asset.url)))

    assert.equal(chim.image.sha256, '1ea2ffa9252ad8cb59ddc72eae6832ad742d5c97714c4cf1cd6f2626992a1718')
    assert.equal(chim.seats.length, 9)
    assert.ok(chim.occluders.length >= 3)
    assert.ok(chim.seats.every((seat) => seat.foregroundAsset?.url))
    assert.deepEqual(new Set(chim.nodes.map((node) => node.z)), new Set([0, 1, 2, 3]))

    for (const room of [library, chim]) {
      const ids = new Set(room.nodes.map((node) => node.id))
      assert.equal(ids.size, room.nodes.length)
      assert.ok(ids.has(room.spawnNodeId))
      for (const edge of room.edges) {
        assert.ok(ids.has(edge.from), `${room.id} edge from ${edge.from}`)
        assert.ok(ids.has(edge.to), `${room.id} edge to ${edge.to}`)
        const from = room.nodes.find((node) => node.id === edge.from)
        const to = room.nodes.find((node) => node.id === edge.to)
        if (from.z !== to.z) assert.equal(edge.kind, 'stair')
      }
    }
  } finally {
    await rm(outputDir, { recursive: true, force: true })
  }
})
