import { describe, expect, it } from 'vitest'

import { findElevatedAStarPath } from '../src/pathfinding/ElevatedAStar'
import { gridPointKey } from '../src/rooms/RoomDefinition'
import { libraryRoom } from '../src/rooms/library.room'

const pointKey = (point: { x: number; y: number; z: number }): string => gridPointKey(point)

describe('library room data', () => {
  it('defines a complete unique 12x12 flat grid with a clear spawn', () => {
    const keys = libraryRoom.tiles.map((tile) => pointKey(tile.position))

    expect(libraryRoom.tiles).toHaveLength(144)
    expect(new Set(keys).size).toBe(keys.length)
    expect(libraryRoom.tiles.every((tile) => tile.walkable)).toBe(true)
    expect(libraryRoom.tiles.some((tile) => pointKey(tile.position) === pointKey(libraryRoom.spawn))).toBe(true)
    expect(libraryRoom.objects.some((object) => object.blocked && pointKey(object.tile) === pointKey(libraryRoom.spawn))).toBe(false)
  })

  it('keeps all room points in bounds and derives blockers from placed objects', () => {
    const inBounds = (point: { x: number; y: number; z: number }): boolean =>
      point.z === 0 && point.x >= 0 && point.x < 12 && point.y >= 0 && point.y < 12
    const blockedObjectKeys = libraryRoom.objects.filter((object) => object.blocked).map((object) => pointKey(object.tile))

    expect(libraryRoom.objects.length).toBeGreaterThan(30)
    expect(libraryRoom.objects.every((object) => inBounds(object.tile))).toBe(true)
    expect(libraryRoom.seats.every((seat) => inBounds(seat.tile) && inBounds(seat.approach))).toBe(true)
    expect(new Set(blockedObjectKeys).size).toBe(blockedObjectKeys.length)
    expect(libraryRoom.blockedTiles).toEqual(blockedObjectKeys)
    expect(['wall-', 'bookcase-', 'desk-', 'lamp-', 'plant-', 'sofa-'].every((prefix) =>
      libraryRoom.objects.some((object) => object.id.startsWith(prefix)),
    )).toBe(true)
  })

  it('routes around all three desk groups from the spawn', () => {
    const blocked = libraryRoom.objects.filter((object) => object.blocked).map((object) => object.tile)
    const groups = ['desk-north', 'desk-center', 'desk-south']

    for (const group of groups) {
      const desk = libraryRoom.objects.find((object) => object.id === `${group}-surface`)
      expect(desk).toBeDefined()
      if (!desk) throw new Error(`Missing ${group}`)
      const target = { x: desk.tile.x, y: desk.tile.y - 1, z: 0 }
      const path = findElevatedAStarPath(libraryRoom.spawn, target, { blockedTiles: blocked })

      expect(path.length).toBeGreaterThan(0)
      expect(path.map(pointKey)).not.toContain(pointKey(desk.tile))
    }
  })

  it('provides reachable approach data for at least three chair types', () => {
    const blocked = libraryRoom.objects.filter((object) => object.blocked).map((object) => object.tile)
    const types = new Set(libraryRoom.seats.map((seat) => seat.id.split('-')[1]))

    expect(types.size).toBeGreaterThanOrEqual(3)
    expect(libraryRoom.seats.length).toBeGreaterThanOrEqual(6)
    for (const seat of libraryRoom.seats) {
      expect(seat.approach).not.toEqual(seat.tile)
      expect(seat.facing).toMatch(/^(n|ne|e|se|s|sw|w|nw)$/)
      expect(seat.sitAnchor).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }))
      expect(seat.foregroundObjectId).toBeTruthy()
      expect(libraryRoom.objects.some((object) => object.id === seat.foregroundObjectId && !object.blocked)).toBe(true)
      expect(findElevatedAStarPath(libraryRoom.spawn, seat.approach, { blockedTiles: blocked }).length).toBeGreaterThan(0)
    }
  })
})
