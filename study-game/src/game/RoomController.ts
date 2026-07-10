import { findElevatedAStarPath, type DirectedStairEdge } from '../pathfinding/ElevatedAStar'
import type { GridPoint, RoomDefinition, TileDefinition } from '../rooms/RoomDefinition'

export class RoomController {
  readonly #room: RoomDefinition
  readonly #stairs: readonly DirectedStairEdge[]
  readonly #tilesByCoordinate: Map<string, TileDefinition>

  constructor(room: RoomDefinition, stairs: readonly DirectedStairEdge[]) {
    this.#room = room
    this.#stairs = stairs
    this.#tilesByCoordinate = new Map(
      room.tiles.map((tile) => [`${tile.position.x},${tile.position.y}`, tile]),
    )
  }

  get room(): RoomDefinition {
    return this.#room
  }

  tileAt(x: number, y: number): TileDefinition | null {
    return this.#tilesByCoordinate.get(`${x},${y}`) ?? null
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
    const goalTile = this.tileAt(goal.x, goal.y)
    if (!goalTile?.walkable || goalTile.position.z !== goal.z || this.isBlocked(goal)) return []

    return findElevatedAStarPath(start, goal, {
      blockedTiles: this.#room.objects.filter((object) => object.blocked).map((object) => object.tile),
      stairEdges: this.#stairs,
    })
  }
}
