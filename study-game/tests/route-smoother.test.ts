import { describe, expect, it } from 'vitest'

import type { NavigationEdge, NavigationNode } from '../src/pathfinding/NavigationGraph'
import { isElevatedSegmentWalkable } from '../src/pathfinding/ElevatedAStar'
import {
  isNavigationSegmentSafe,
  smoothElevatedRoute,
  smoothNavigationRoute,
} from '../src/pathfinding/RouteSmoother'

const point = (x: number, y: number, z = 0) => ({ x, y, z })

describe('smoothElevatedRoute', () => {
  it('collapses a fully walkable straight route to its exact endpoints', () => {
    const route = [point(0, 0), point(1, 0), point(2, 0), point(3, 0), point(4, 0)]

    expect(smoothElevatedRoute(route)).toEqual([point(0, 0), point(4, 0)])
  })

  it('preserves the detour around a blocked tile', () => {
    const blocked = [point(2, 0)]
    const route = [
      point(0, 0),
      point(1, 0),
      point(1, 1),
      point(2, 1),
      point(3, 1),
      point(3, 0),
      point(4, 0),
    ]

    const smoothed = smoothElevatedRoute(route, { blockedTiles: blocked })

    expect(smoothed[0]).toEqual(point(0, 0))
    expect(smoothed.at(-1)).toEqual(point(4, 0))
    expect(smoothed.length).toBeGreaterThan(2)
    for (let index = 1; index < smoothed.length; index += 1) {
      expect(isElevatedSegmentWalkable(smoothed[index - 1]!, smoothed[index]!, { blockedTiles: blocked })).toBe(true)
    }
  })

  it('does not cut a diagonal through a blocked orthogonal corner', () => {
    const route = [point(0, 0), point(0, 1), point(1, 1)]

    expect(smoothElevatedRoute(route, { blockedTiles: [point(1, 0)] })).toEqual(route)
  })

  it('keeps both sides of a directed stair as hard boundaries', () => {
    const route = [point(0, 0, 0), point(1, 0, 0), point(1, 0, 1), point(2, 0, 1)]
    const stairs = [{ from: point(1, 0, 0), to: point(1, 0, 1) }]

    expect(smoothElevatedRoute(route, { stairEdges: stairs })).toEqual(route)
  })

  it('never shortcuts through a coordinate absent from declared walkable geometry', () => {
    const route = [point(0, 0), point(0, 1), point(1, 1), point(2, 1), point(2, 0)]
    const walkableTiles = route

    const smoothed = smoothElevatedRoute(route, { walkableTiles })

    expect(smoothed.length).toBeGreaterThan(2)
    for (let index = 1; index < smoothed.length; index += 1) {
      expect(isElevatedSegmentWalkable(smoothed[index - 1]!, smoothed[index]!, { walkableTiles })).toBe(true)
    }
  })

  it('shortens a long safe zig-zag while keeping all resulting segments walkable', () => {
    const route = [
      point(0, 0), point(1, 0), point(1, 1), point(2, 1), point(2, 2),
      point(3, 2), point(3, 3), point(4, 3), point(4, 4), point(5, 4),
    ]

    const smoothed = smoothElevatedRoute(route)

    expect(smoothed.length).toBeLessThan(route.length)
    for (let index = 1; index < smoothed.length; index += 1) {
      expect(isElevatedSegmentWalkable(smoothed[index - 1]!, smoothed[index]!)).toBe(true)
    }
  })

  it('returns empty and single-point routes unchanged', () => {
    expect(smoothElevatedRoute([])).toEqual([])
    expect(smoothElevatedRoute([point(3, 4, 1)])).toEqual([point(3, 4, 1)])
  })
})

describe('smoothNavigationRoute', () => {
  const nodes: NavigationNode[] = [
    { id: 'a', x: 10, y: 10, z: 0 },
    { id: 'b', x: 20, y: 20, z: 0 },
    { id: 'c', x: 30, y: 30, z: 0 },
    { id: 'd', x: 40, y: 30, z: 0 },
  ]
  const edges: NavigationEdge[] = [
    { from: 'a', to: 'b', kind: 'walk' },
    { from: 'b', to: 'c', kind: 'walk' },
    { from: 'c', to: 'd', kind: 'walk' },
  ]

  it('removes only collinear walk nodes from room navigation routes', () => {
    expect(smoothNavigationRoute(nodes, edges).map((node) => node.id)).toEqual(['a', 'c', 'd'])
  })

  it('allows an explicit direct walk edge but never skips a stair edge', () => {
    const directEdges: NavigationEdge[] = [...edges, { from: 'a', to: 'd', kind: 'walk' }]
    expect(isNavigationSegmentSafe(nodes, directEdges)).toBe(true)
    expect(smoothNavigationRoute(nodes, directEdges).map((node) => node.id)).toEqual(['a', 'd'])

    const elevated = [nodes[0]!, { ...nodes[1]!, z: 1 }, { ...nodes[2]!, z: 1 }]
    const stairEdges: NavigationEdge[] = [
      { from: 'a', to: 'b', kind: 'stair' },
      { from: 'b', to: 'c', kind: 'walk' },
    ]
    expect(smoothNavigationRoute(elevated, stairEdges).map((node) => node.id)).toEqual(['a', 'b', 'c'])
  })
})
