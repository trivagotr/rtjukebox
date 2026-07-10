import { describe, expect, it } from 'vitest'

import { RoomController } from '../src/game/RoomController'
import type { RoomDefinition } from '../src/rooms/RoomDefinition'

const room: RoomDefinition = {
  id: 'engine-proof',
  spawn: { x: 0, y: 0, z: 0 },
  tiles: [
    { position: { x: 0, y: 0, z: 0 }, walkable: true },
    { position: { x: 1, y: 0, z: 0 }, walkable: true },
    { position: { x: 1, y: 0, z: 1 }, walkable: true },
    { position: { x: 2, y: 0, z: 1 }, walkable: true },
  ],
  objects: [],
  seats: [],
  camera: { minZoom: 1, maxZoom: 1, startZoom: 1 },
}

const stairs = [
  { from: { x: 1, y: 0, z: 0 }, to: { x: 1, y: 0, z: 1 } },
]

describe('RoomController', () => {
  it('keeps overlapping elevation tiles addressable independently', () => {
    const controller = new RoomController(room, stairs)

    expect(controller.tileAt(1, 0, 0)?.position.z).toBe(0)
    expect(controller.tileAt(1, 0, 1)?.position.z).toBe(1)
    expect(controller.tilesAt(1, 0).map((tile) => tile.position.z)).toEqual([1, 0])
  })

  it('routes only through declared room tiles', () => {
    const controller = new RoomController(room, stairs)

    expect(controller.findPath(room.spawn, { x: 2, y: 0, z: 1 })).toEqual([
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 1, y: 0, z: 1 },
      { x: 2, y: 0, z: 1 },
    ])
    expect(controller.findPath(room.spawn, { x: 2, y: 1, z: 0 })).toEqual([])
  })
})
