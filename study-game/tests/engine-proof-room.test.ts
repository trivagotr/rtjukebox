import { describe, expect, it } from 'vitest'

import { findElevatedAStarPath } from '../src/pathfinding/ElevatedAStar'
import { engineProofRoom, engineProofStairEdges } from '../src/rooms/engineProof.room'
import { gridPointKey } from '../src/rooms/RoomDefinition'

function directionChanges(path: Array<{ x: number; y: number }>): number {
  let changes = 0
  let previous = ''
  for (let index = 1; index < path.length; index += 1) {
    const from = path[index - 1]!
    const to = path[index]!
    const direction = `${Math.sign(to.x - from.x)},${Math.sign(to.y - from.y)}`
    if (previous && direction !== previous) changes += 1
    previous = direction
  }
  return changes
}

describe('engineProofRoom', () => {
  it('defines one unique tile for every coordinate in a 12x12 board', () => {
    expect(engineProofRoom.tiles).toHaveLength(144)
    expect(new Set(engineProofRoom.tiles.map((tile) => `${tile.position.x},${tile.position.y}`)).size).toBe(144)
    expect(engineProofRoom.tiles.filter((tile) => tile.position.z === 1)).toHaveLength(16)
  })

  it('provides a legal stair route to the raised seat approach', () => {
    const blocked = engineProofRoom.objects.filter((object) => object.blocked).map((object) => object.tile)
    const seat = engineProofRoom.seats[0]
    expect(seat).toBeDefined()
    if (!seat) throw new Error('Engine proof seat is missing')
    const path = findElevatedAStarPath(engineProofRoom.spawn, seat.approach, {
      blockedTiles: blocked,
      stairEdges: engineProofStairEdges,
    })

    expect(path.length).toBeGreaterThanOrEqual(10)
    expect(path.some((point) => point.z === 0)).toBe(true)
    expect(path.some((point) => point.z === 1)).toBe(true)
    expect(directionChanges(path)).toBeGreaterThanOrEqual(2)
    expect(blocked[0]).toBeDefined()
    if (!blocked[0]) throw new Error('Engine proof blocker is missing')
    expect(path.map(gridPointKey)).not.toContain(gridPointKey(blocked[0]))
  })

  it('defines a real seat with an approach, facing, anchor, and foreground object', () => {
    expect(engineProofRoom.seats).toEqual([
      expect.objectContaining({
        id: 'proof-chair',
        facing: 'nw',
        foregroundObjectId: 'proof-chair-front',
      }),
    ])
    const seat = engineProofRoom.seats[0]
    expect(seat).toBeDefined()
    if (!seat) throw new Error('Engine proof seat is missing')
    expect(seat.approach).not.toEqual(seat.tile)
  })
})
