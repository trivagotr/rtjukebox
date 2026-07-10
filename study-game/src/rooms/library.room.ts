import type { RoomDefinition, TileDefinition, WorldObjectDefinition } from './RoomDefinition'

const GRID_SIZE = 12

const tiles: TileDefinition[] = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => ({
  position: { x: index % GRID_SIZE, y: Math.floor(index / GRID_SIZE), z: 0 },
  walkable: true,
}))

const point = (x: number, y: number) => ({ x, y, z: 0 })

const objects: WorldObjectDefinition[] = [
  ...Array.from({ length: 12 }, (_, x) => ({ id: `wall-north-${x}`, tile: point(x, 0), blocked: true })),
  ...Array.from({ length: 12 }, (_, x) => ({ id: `wall-south-${x}`, tile: point(x, 11), blocked: true })),
  ...Array.from({ length: 10 }, (_, y) => ({ id: `wall-west-${y + 1}`, tile: point(0, y + 1), blocked: true })),
  ...Array.from({ length: 10 }, (_, y) => ({ id: `wall-east-${y + 1}`, tile: point(11, y + 1), blocked: true })),
  { id: 'bookcase-northwest', tile: point(2, 1), blocked: true },
  { id: 'bookcase-north-center', tile: point(5, 1), blocked: true },
  { id: 'bookcase-northeast', tile: point(9, 1), blocked: true },
  { id: 'bookcase-west', tile: point(1, 5), blocked: true },
  { id: 'bookcase-east', tile: point(10, 5), blocked: true },
  { id: 'bookcase-southwest', tile: point(2, 9), blocked: true },
  { id: 'bookcase-southeast', tile: point(9, 9), blocked: true },
  { id: 'desk-north-surface', tile: point(3, 3), blocked: true },
  { id: 'desk-north-leg-left', tile: point(2, 3), blocked: true },
  { id: 'desk-north-leg-right', tile: point(4, 3), blocked: true },
  { id: 'desk-center-surface', tile: point(6, 5), blocked: true },
  { id: 'desk-center-leg-left', tile: point(5, 5), blocked: true },
  { id: 'desk-center-leg-right', tile: point(7, 5), blocked: true },
  { id: 'desk-south-surface', tile: point(8, 8), blocked: true },
  { id: 'desk-south-leg-left', tile: point(7, 8), blocked: true },
  { id: 'desk-south-leg-right', tile: point(9, 8), blocked: true },
  { id: 'sofa-reading', tile: point(3, 6), blocked: true },
  { id: 'sofa-window', tile: point(8, 2), blocked: true },
  { id: 'sofa-lounge', tile: point(5, 9), blocked: true },
  { id: 'lamp-reading', tile: point(4, 6), blocked: true },
  { id: 'lamp-window', tile: point(7, 2), blocked: true },
  { id: 'lamp-lounge', tile: point(6, 9), blocked: true },
  { id: 'plant-west', tile: point(2, 7), blocked: true },
  { id: 'plant-east', tile: point(9, 6), blocked: true },
  { id: 'plant-entry', tile: point(4, 10), blocked: true },
  { id: 'chair-wood-north', tile: point(3, 4), blocked: true },
  { id: 'chair-wood-north-front', tile: point(3, 4), blocked: false, depthOffset: 80 },
  { id: 'chair-metal-center', tile: point(6, 6), blocked: true },
  { id: 'chair-metal-center-front', tile: point(6, 6), blocked: false, depthOffset: 80 },
  { id: 'chair-upholstered-south', tile: point(8, 9), blocked: true },
  { id: 'chair-upholstered-south-front', tile: point(8, 9), blocked: false, depthOffset: 80 },
  { id: 'chair-wood-window', tile: point(6, 3), blocked: true },
  { id: 'chair-wood-window-front', tile: point(6, 3), blocked: false, depthOffset: 80 },
  { id: 'chair-metal-lounge', tile: point(5, 10), blocked: true },
  { id: 'chair-metal-lounge-front', tile: point(5, 10), blocked: false, depthOffset: 80 },
  { id: 'chair-upholstered-reading', tile: point(2, 6), blocked: true },
  { id: 'chair-upholstered-reading-front', tile: point(2, 6), blocked: false, depthOffset: 80 },
]

const blockedTiles = objects.filter((object) => object.blocked).map((object) => `${object.tile.x},${object.tile.y},${object.tile.z}`)

export const libraryRoom = {
  id: 'library' as const,
  spawn: point(1, 10),
  tiles,
  objects,
  blockedTiles,
  seats: [
    { id: 'chair-wood-north', tile: point(3, 4), approach: point(3, 5), facing: 'n' as const, sitAnchor: { x: 0, y: -10 }, foregroundObjectId: 'chair-wood-north-front' },
    { id: 'chair-metal-center', tile: point(6, 6), approach: point(6, 7), facing: 'n' as const, sitAnchor: { x: 0, y: -10 }, foregroundObjectId: 'chair-metal-center-front' },
    { id: 'chair-upholstered-south', tile: point(8, 9), approach: point(8, 10), facing: 'n' as const, sitAnchor: { x: 0, y: -10 }, foregroundObjectId: 'chair-upholstered-south-front' },
    { id: 'chair-wood-window', tile: point(6, 3), approach: point(6, 4), facing: 's' as const, sitAnchor: { x: 0, y: 10 }, foregroundObjectId: 'chair-wood-window-front' },
    { id: 'chair-metal-lounge', tile: point(5, 10), approach: point(6, 10), facing: 'w' as const, sitAnchor: { x: -10, y: 0 }, foregroundObjectId: 'chair-metal-lounge-front' },
    { id: 'chair-upholstered-reading', tile: point(2, 6), approach: point(1, 6), facing: 'e' as const, sitAnchor: { x: 10, y: 0 }, foregroundObjectId: 'chair-upholstered-reading-front' },
  ],
  camera: { minZoom: 0.72, maxZoom: 1.35, startZoom: 1 },
} satisfies RoomDefinition & { readonly blockedTiles: readonly string[] }

export const libraryRoomMetadata = Object.freeze({ gridWidth: GRID_SIZE, gridHeight: GRID_SIZE, blockedTileCount: blockedTiles.length })
