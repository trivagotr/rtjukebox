export type Direction8 = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

export type GridPoint = {
  x: number
  y: number
  z: number
}

export type TileDefinition = {
  position: GridPoint
  walkable: boolean
  stairLinks?: string[]
}

export type WorldObjectDefinition = {
  id: string
  tile: GridPoint
  blocked: boolean
  depthOffset?: number
}

export type SeatDefinition = {
  id: string
  tile: GridPoint
  approach: GridPoint
  facing: Direction8
  sitAnchor: { x: number; y: number }
  foregroundObjectId?: string
}

export type RoomCameraDefinition = {
  minZoom: number
  maxZoom: number
  startZoom: number
}

export type RoomDefinition = {
  id: 'engine-proof' | 'library' | 'chim-alan'
  spawn: GridPoint
  tiles: TileDefinition[]
  objects: WorldObjectDefinition[]
  seats: SeatDefinition[]
  camera: RoomCameraDefinition
}

export function gridPointKey(point: GridPoint): string {
  return `${point.x},${point.y},${point.z}`
}

export function sameGridPoint(left: GridPoint, right: GridPoint): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z
}
