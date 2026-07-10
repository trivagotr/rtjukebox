import { findElevatedAStarPath, type DirectedStairEdge } from '../pathfinding/ElevatedAStar'
import type { GridPoint, RoomDefinition, TileDefinition } from '../rooms/RoomDefinition'

export class RoomController {
  readonly #room: RoomDefinition
  readonly #stairs: readonly DirectedStairEdge[]
  readonly #tilesByCoordinate: Map<string, TileDefinition>
  readonly #tilesByColumn: Map<string, readonly TileDefinition[]>

  constructor(room: RoomDefinition, stairs: readonly DirectedStairEdge[]) {
    this.#room = room
    this.#stairs = stairs
    this.#tilesByCoordinate = new Map(
      room.tiles.map((tile) => [`${tile.position.x},${tile.position.y},${tile.position.z}`, tile]),
    )
    const columns = new Map<string, TileDefinition[]>()
    for (const tile of room.tiles) {
      const key = `${tile.position.x},${tile.position.y}`
      const column = columns.get(key) ?? []
      column.push(tile)
      columns.set(key, column)
    }
    this.#tilesByColumn = new Map(
      [...columns].map(([key, column]) => [key, column.sort((left, right) => right.position.z - left.position.z)]),
    )
  }

  get room(): RoomDefinition {
    return this.#room
  }

  tileAt(x: number, y: number, z?: number): TileDefinition | null {
    if (z !== undefined) return this.#tilesByCoordinate.get(`${x},${y},${z}`) ?? null
    return this.#tilesByColumn.get(`${x},${y}`)?.[0] ?? null
  }

  tilesAt(x: number, y: number): readonly TileDefinition[] {
    return this.#tilesByColumn.get(`${x},${y}`) ?? []
  }

  isBlocked(point: GridPoint): boolean {
    return this.#room.objects.some(
      (object) =>
        object.blocked &&
        object.tile.x === point.x &&
        object.tile.y === point.y &&
        object.tile.z === point.z,
    )
  }

  findPath(start: GridPoint, goal: GridPoint): GridPoint[] {
    const goalTile = this.tileAt(goal.x, goal.y, goal.z)
    if (!goalTile?.walkable || this.isBlocked(goal)) return []

    return findElevatedAStarPath(start, goal, {
      blockedTiles: this.#room.objects.filter((object) => object.blocked).map((object) => object.tile),
      stairEdges: this.#stairs,
      walkableTiles: this.#room.tiles.filter((tile) => tile.walkable).map((tile) => tile.position),
    })
  }
}
