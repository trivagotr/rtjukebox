import { describe, expect, it } from 'vitest'

import { NavigationGraph } from '../src/pathfinding/NavigationGraph'

describe('NavigationGraph', () => {
  const nodes = [
    { id: 'spawn', x: 0, y: 0, z: 0 },
    { id: 'aisle', x: 3, y: 0, z: 0 },
    { id: 'stair-top', x: 3, y: 3, z: 1 },
    { id: 'seat', x: 6, y: 3, z: 1 },
    { id: 'blocked-shortcut', x: 3, y: 1, z: 0 },
  ]
  const edges = [
    { from: 'spawn', to: 'aisle', kind: 'walk' as const },
    { from: 'aisle', to: 'stair-top', kind: 'stair' as const },
    { from: 'stair-top', to: 'seat', kind: 'walk' as const },
    { from: 'spawn', to: 'blocked-shortcut', kind: 'walk' as const },
    { from: 'blocked-shortcut', to: 'seat', kind: 'stair' as const },
  ]

  it('uses A* across declared walk and stair edges', () => {
    const graph = new NavigationGraph(nodes, edges)
    expect(graph.findPath('spawn', 'seat', new Set(['blocked-shortcut']))).toEqual([
      'spawn',
      'aisle',
      'stair-top',
      'seat',
    ])
  })

  it('rejects elevation changes that are not explicitly stairs', () => {
    expect(() => new NavigationGraph(nodes, [
      { from: 'aisle', to: 'stair-top', kind: 'walk' },
    ])).toThrow(/elevation.*stair/i)
  })

  it('rejects unknown nodes and returns an empty path for blocked endpoints', () => {
    expect(() => new NavigationGraph(nodes, [{ from: 'missing', to: 'seat', kind: 'walk' }])).toThrow(/unknown node/i)
    const graph = new NavigationGraph(nodes, edges)
    expect(graph.findPath('spawn', 'missing')).toEqual([])
    expect(graph.findPath('spawn', 'seat', new Set(['seat']))).toEqual([])
  })
})
