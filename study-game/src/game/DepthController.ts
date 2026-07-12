import type { GridPoint } from '../rooms/RoomDefinition'

export class DepthController {
  tile(point: GridPoint, offset = 0): number {
    return (point.x + point.y) * 100 + point.z * 24 + offset
  }

  avatar(point: GridPoint): number {
    return this.tile(point, 55)
  }

  foreground(point: GridPoint): number {
    return this.tile(point, 72)
  }
}
