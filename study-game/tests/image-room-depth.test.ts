import { describe, expect, it } from 'vitest'

import { imageRoomActorDepth } from '../src/game/ImageRoomDepth'
import { IMAGE_ROOMS } from '../src/rooms/ImageRoomDefinition'

describe('imageRoomActorDepth', () => {
  it('preserves the established flat-room y sorting', () => {
    expect(imageRoomActorDepth({ y: 52, z: 0 })).toBe(5_210)
    expect(imageRoomActorDepth({ y: 53, z: 0 })).toBeGreaterThan(imageRoomActorDepth({ y: 52, z: 0 }))
  })

  it('sorts every Chim Alan terrace node above its own foreground wall', () => {
    const room = IMAGE_ROOMS['chim-alan']

    for (const row of [1, 2, 3]) {
      const wall = room.occluders.find((occluder) => occluder.id === `amphi-row-front-${row}`)!
      for (const side of ['left', 'mid', 'right']) {
        const node = room.nodes.find((candidate) => candidate.id === `row-${row}-${side}`)!
        expect(imageRoomActorDepth(node), node.id).toBeGreaterThan(wall.depthY * 100)
      }
    }
  })

  it('changes continuously while traversing an elevated stair segment', () => {
    const before = imageRoomActorDepth({ y: 48, z: 1 })
    const middle = imageRoomActorDepth({ y: 44.5, z: 1.5 })
    const after = imageRoomActorDepth({ y: 41, z: 2 })

    expect(middle).toBeCloseTo((before + after) / 2)
  })
})
