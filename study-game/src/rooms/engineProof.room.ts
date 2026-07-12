import type { DirectedStairEdge } from '../pathfinding/ElevatedAStar'
import type { RoomDefinition, TileDefinition } from './RoomDefinition'

const raisedPlatform = (x: number, y: number): boolean => x >= 7 && x <= 10 && y >= 2 && y <= 5

const tiles: TileDefinition[] = []
for (let y = 0; y < 12; y += 1) {
  for (let x = 0; x < 12; x += 1) {
    tiles.push({
      position: { x, y, z: raisedPlatform(x, y) ? 1 : 0 },
      walkable: true,
    })
  }
}

export const engineProofStairEdges: DirectedStairEdge[] = [
  {
    from: { x: 11, y: 5, z: 0 },
    to: { x: 10, y: 5, z: 1 },
  },
  {
    from: { x: 10, y: 5, z: 1 },
    to: { x: 11, y: 5, z: 0 },
  },
]

export const engineProofRoom: RoomDefinition = {
  id: 'engine-proof',
  spawn: { x: 0, y: 11, z: 0 },
  tiles,
  objects: [
    { id: 'proof-block-a', tile: { x: 4, y: 8, z: 0 }, blocked: true },
    { id: 'proof-block-b', tile: { x: 5, y: 7, z: 0 }, blocked: true },
    { id: 'proof-block-c', tile: { x: 7, y: 7, z: 0 }, blocked: true },
    { id: 'proof-chair', tile: { x: 8, y: 4, z: 1 }, blocked: true },
    { id: 'proof-chair-front', tile: { x: 8, y: 4, z: 1 }, blocked: false, depthOffset: 80 },
  ],
  seats: [
    {
      id: 'proof-chair',
      tile: { x: 8, y: 4, z: 1 },
      approach: { x: 8, y: 5, z: 1 },
      facing: 'nw',
      sitAnchor: { x: 1, y: -11 },
      foregroundObjectId: 'proof-chair-front',
    },
  ],
  camera: {
    minZoom: 0.72,
    maxZoom: 1.35,
    startZoom: 1,
  },
}
