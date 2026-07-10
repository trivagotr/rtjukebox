import { describe, expect, it } from 'vitest'

import {
  findElevatedAStarPath,
  type GridPoint,
} from '../src/pathfinding/ElevatedAStar'

const GRID_SIZE = 12

const point = (x: number, y: number, z: number): GridPoint => ({ x, y, z })

const key = (value: GridPoint): string => `${value.x},${value.y},${value.z}`

const blockedExcept = (openTiles: readonly GridPoint[]): GridPoint[] => {
  const open = new Set(openTiles.map(key))
  const blocked: GridPoint[] = []

  for (let x = 0; x < GRID_SIZE; x += 1) {
    for (let y = 0; y < GRID_SIZE; y += 1) {
      const tile = point(x, y, 0)
      if (!open.has(key(tile))) {
        blocked.push(tile)
      }
    }
  }

  return blocked
}

const directionChanges = (path: readonly GridPoint[]): number => {
  let changes = 0
  let previousDelta: string | null = null

  for (let index = 1; index < path.length; index += 1) {
    const previous = path[index - 1]!
    const current = path[index]!
    const delta = `${current.x - previous.x},${current.y - previous.y},${current.z - previous.z}`

    if (previousDelta !== null && delta !== previousDelta) {
      changes += 1
    }

    previousDelta = delta
  }

  return changes
}

describe('findElevatedAStarPath', () => {
  it('returns a long shortest route with multiple direction changes', () => {
    const path = findElevatedAStarPath(
      point(0, 0, 0),
      point(7, 2, 0),
      {
        blockedTiles: blockedExcept([
          point(0, 0, 0),
          point(1, 0, 0),
          point(2, 0, 0),
          point(3, 0, 0),
          point(3, 1, 0),
          point(3, 2, 0),
          point(4, 2, 0),
          point(5, 2, 0),
          point(6, 2, 0),
          point(7, 2, 0),
        ]),
      },
    )

    expect(path).toEqual([
      point(0, 0, 0),
      point(1, 0, 0),
      point(2, 0, 0),
      point(3, 0, 0),
      point(3, 1, 0),
      point(3, 2, 0),
      point(4, 2, 0),
      point(5, 2, 0),
      point(6, 2, 0),
      point(7, 2, 0),
    ])
    expect(path.length).toBeGreaterThanOrEqual(10)
    expect(directionChanges(path)).toBeGreaterThanOrEqual(2)
  })

  it('returns an empty path when blocked tiles seal off the route', () => {
    const blocked: GridPoint[] = []

    for (let x = 0; x < GRID_SIZE; x += 1) {
      blocked.push(point(x, 1, 0))
    }

    expect(
      findElevatedAStarPath(point(0, 0, 0), point(0, 2, 0), {
        blockedTiles: blocked,
      }),
    ).toEqual([])
  })

  it('returns an empty path when elevation changes are not connected by a stair', () => {
    expect(
      findElevatedAStarPath(point(4, 4, 0), point(4, 4, 1)),
    ).toEqual([])
  })

  it('uses a directed stair edge to reach a higher tile', () => {
    const path = findElevatedAStarPath(
      point(0, 0, 0),
      point(2, 0, 1),
      {
        stairEdges: [
          {
            from: point(1, 0, 0),
            to: point(1, 0, 1),
          },
        ],
      },
    )

    expect(path).toEqual([
      point(0, 0, 0),
      point(1, 0, 0),
      point(1, 0, 1),
      point(2, 0, 1),
    ])
  })

  it('does not cut diagonally through blocked orthogonal neighbors', () => {
    expect(
      findElevatedAStarPath(point(0, 0, 0), point(1, 1, 0), {
        blockedTiles: [point(1, 0, 0), point(0, 1, 0)],
      }),
    ).toEqual([])
  })
})
