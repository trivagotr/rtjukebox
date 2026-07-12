import { describe, expect, it } from 'vitest'

import { findElevatedAStarPath } from '../src/pathfinding/ElevatedAStar'
import { gridPointKey } from '../src/rooms/RoomDefinition'
import { chimAlanRoom, chimAlanStairEdges } from '../src/rooms/chim.room'

const key = (point: { x: number; y: number; z: number }): string => gridPointKey(point)

function blockedForRoom(): Array<{ x: number; y: number; z: number }> {
  const declared = new Set(chimAlanRoom.tiles.map((tile) => key(tile.position)))
  const blocked = chimAlanRoom.objects.filter((object) => object.blocked).map((object) => object.tile)
  for (let z = 0; z <= 3; z += 1) {
    for (let y = 0; y < 12; y += 1) {
      for (let x = 0; x < 12; x += 1) {
        if (!declared.has(`${x},${y},${z}`)) blocked.push({ x, y, z })
      }
    }
  }
  return blocked
}

describe('chimAlanRoom', () => {
  it('declares real outdoor ground and amphitheatre elevation from z=0 through z=3', () => {
    expect(chimAlanRoom.id).toBe('chim-alan')
    expect(new Set(chimAlanRoom.tiles.map((tile) => tile.position.z))).toEqual(new Set([0, 1, 2, 3]))
    expect(chimAlanRoom.tiles.some((tile) => tile.position.z === 0 && tile.walkable)).toBe(true)
    expect(chimAlanRoom.tiles.some((tile) => tile.position.z === 3 && tile.walkable)).toBe(true)
  })

  it('keeps elevation changes impossible without a declared stair edge', () => {
    expect(findElevatedAStarPath({ x: 2, y: 2, z: 0 }, { x: 2, y: 2, z: 1 })).toEqual([])
    expect(chimAlanStairEdges.length).toBeGreaterThanOrEqual(6)
  })

  it('declares bidirectional stair transitions across every amphitheatre level', () => {
    const directed = new Set(chimAlanStairEdges.map((edge) => `${key(edge.from)}>${key(edge.to)}`))
    for (const edge of chimAlanStairEdges) {
      expect(directed.has(`${key(edge.to)}>${key(edge.from)}`)).toBe(true)
      expect(Math.abs(edge.from.z - edge.to.z)).toBe(1)
    }
    expect(new Set(chimAlanStairEdges.flatMap((edge) => [edge.from.z, edge.to.z]))).toEqual(new Set([0, 1, 2, 3]))
  })

  it('provides multiple world-space seats with approach, facing, anchor, and foreground metadata', () => {
    expect(chimAlanRoom.seats.length).toBeGreaterThanOrEqual(6)
    for (const seat of chimAlanRoom.seats) {
      expect(seat.approach).not.toEqual(seat.tile)
      expect(seat.facing).toMatch(/^(n|ne|e|se|s|sw|w|nw)$/)
      expect(seat.sitAnchor).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }))
      expect(seat.foregroundObjectId).toBeTruthy()
    }
  })

  it('makes every amphitheatre row reachable only through declared room geometry and stairs', () => {
    const walkableTiles = chimAlanRoom.tiles.filter((tile) => tile.walkable).map((tile) => tile.position)
    const blockedTiles = chimAlanRoom.objects.filter((object) => object.blocked).map((object) => object.tile)

    for (const seat of chimAlanRoom.seats) {
      const path = findElevatedAStarPath(chimAlanRoom.spawn, seat.approach, {
        blockedTiles,
        stairEdges: chimAlanStairEdges,
        walkableTiles,
      })
      expect(path, `${seat.id} must be reachable`).not.toEqual([])
      expect(path.at(-1)).toEqual(seat.approach)
    }
  })

  it('routes spawn through stairs to a seat, its stand approach, and a neighbor of Spark', () => {
    const blocked = blockedForRoom()
    const seat = chimAlanRoom.seats[0]
    const spark = chimAlanRoom.objects.find((object) => object.id === 'spark')
    expect(seat).toBeDefined()
    expect(spark).toBeDefined()
    if (!seat || !spark) throw new Error('Chim Alan route fixtures are missing')

    const toSeat = findElevatedAStarPath(chimAlanRoom.spawn, seat.approach, { blockedTiles: blocked, stairEdges: chimAlanStairEdges })
    const toStand = findElevatedAStarPath(seat.approach, seat.tile, { blockedTiles: blocked, stairEdges: chimAlanStairEdges })
    const neighbor = { x: spark.tile.x - 1, y: spark.tile.y, z: spark.tile.z }
    const toSparkNeighbor = findElevatedAStarPath(seat.tile, neighbor, { blockedTiles: blocked, stairEdges: chimAlanStairEdges })

    expect(toSeat).not.toEqual([])
    expect(toSeat.some((point) => point.z > 0)).toBe(true)
    expect(toStand).not.toEqual([])
    expect(toSparkNeighbor).not.toEqual([])
    expect(toSparkNeighbor.at(-1)).toEqual(neighbor)
  })

  it('uses stable IDs for Spark, Rock, grass, retaining edges, and row fronts', () => {
    const ids = chimAlanRoom.objects.map((object) => object.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(expect.arrayContaining(['spark', 'rock', 'grass-east', 'retaining-wall', 'row-front-1', 'row-front-2', 'row-front-3']))
  })
})
