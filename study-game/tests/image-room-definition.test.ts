import { describe, expect, it } from 'vitest'

import { NavigationGraph } from '../src/pathfinding/NavigationGraph'
import { IMAGE_ROOMS, roomPointToPixel } from '../src/rooms/ImageRoomDefinition'

describe('IMAGE_ROOMS', () => {
  it('routes from each exact room spawn to every configured seat', () => {
    for (const room of Object.values(IMAGE_ROOMS)) {
      const graph = new NavigationGraph(room.nodes, room.edges)
      for (const seat of room.seats) {
        const path = graph.findPath(room.spawnNodeId, seat.approachNodeId)
        expect(path, `${room.id}:${seat.id}`).not.toEqual([])
        expect(path.at(-1)).toBe(seat.approachNodeId)
      }
    }
  })

  it('keeps Chim Alan stairs elevated and exposes Spark plus Rock as world actors', () => {
    const room = IMAGE_ROOMS['chim-alan']
    const graph = new NavigationGraph(room.nodes, room.edges)
    const path = graph.findPath(room.spawnNodeId, 'row-3-mid')
    const levels = new Set(path.map((id) => graph.node(id)?.z))

    expect(levels).toEqual(new Set([0, 1, 2, 3]))
    expect(room.actors.spark).toEqual(expect.objectContaining({ name: 'Spark', label: 'rtAI - AI Host' }))
    expect(room.actors.rock).toEqual(expect.objectContaining({ name: 'Rock' }))
  })

  it('maps percentage navigation coordinates to exact source-image pixels', () => {
    const room = IMAGE_ROOMS.library
    expect(roomPointToPixel(room, { x: 50, y: 25 })).toEqual({ x: 470.5, y: 418 })
  })
})
