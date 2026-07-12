import type { DirectedStairEdge } from '../pathfinding/ElevatedAStar'
import type { RoomDefinition, TileDefinition } from './RoomDefinition'

const point = (x: number, y: number, z: number) => ({ x, y, z })

const tiles: TileDefinition[] = []
for (let y = 0; y < 12; y += 1) {
  for (let x = 0; x < 12; x += 1) {
    const outsideAmphitheatre = x < 2 || x > 10
    const belowFirstRow = y < 6
    const firstStairLanding = x === 10 && y === 6
    if (outsideAmphitheatre || belowFirstRow || firstStairLanding) {
      tiles.push({ position: point(x, y, 0), walkable: true })
    }
  }
}

for (const row of [
  { z: 1, y: [6, 7] as const, nextLandingY: 8 },
  { z: 2, y: [8, 9] as const, nextLandingY: 10 },
  { z: 3, y: [10, 11] as const, nextLandingY: null },
]) {
  for (const y of row.y) {
    for (let x = 2; x <= 10; x += 1) tiles.push({ position: point(x, y, row.z), walkable: true })
  }
  if (row.nextLandingY !== null) {
    tiles.push({ position: point(10, row.nextLandingY, row.z), walkable: true })
  }
}

const stairPairs: Array<readonly [number, number, number, number]> = [
  [10, 6, 0, 1],
  [10, 8, 1, 2],
  [10, 10, 2, 3],
]

export const chimAlanStairEdges: readonly DirectedStairEdge[] = stairPairs.flatMap(([x, y, fromZ, toZ]) => [
  { from: point(x, y, fromZ), to: point(x, y, toZ) },
  { from: point(x, y, toZ), to: point(x, y, fromZ) },
])

export const chimAlanVisualMetadata = {
  ground: 'grass',
  rows: ['lower', 'middle', 'upper'],
  actorLabel: 'rtAI - AI Host',
  elevationLevels: [0, 1, 2, 3],
} as const

const seatRows = [
  { z: 1, y: 7, approachY: 6, front: 'row-front-1' },
  { z: 2, y: 9, approachY: 8, front: 'row-front-2' },
  { z: 3, y: 11, approachY: 10, front: 'row-front-3' },
] as const

const seats = seatRows.flatMap(({ z, y, approachY, front }, rowIndex) =>
  [3, 5, 7].map((x, seatIndex) => ({
    id: `chim-seat-${rowIndex + 1}-${seatIndex + 1}`,
    tile: point(x, y, z),
    approach: point(x, approachY, z),
    facing: 's' as const,
    sitAnchor: { x: 0, y: -10 },
    foregroundObjectId: front,
  })),
)

export const chimAlanRoom: RoomDefinition = {
  id: 'chim-alan',
  spawn: point(1, 1, 0),
  tiles,
  objects: [
    { id: 'spark', tile: point(6, 4, 0), blocked: true },
    { id: 'rock', tile: point(3, 3, 0), blocked: true },
    { id: 'grass-east', tile: point(10, 3, 0), blocked: false, depthOffset: 8 },
    { id: 'retaining-wall', tile: point(1, 8, 0), blocked: true },
    { id: 'row-front-1', tile: point(2, 7, 1), blocked: false, depthOffset: 80 },
    { id: 'row-front-2', tile: point(2, 9, 2), blocked: false, depthOffset: 80 },
    { id: 'row-front-3', tile: point(2, 11, 3), blocked: false, depthOffset: 80 },
  ],
  seats,
  camera: { minZoom: 0.68, maxZoom: 1.4, startZoom: 0.95 },
}
