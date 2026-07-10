import type { Direction8 } from '../avatar/AvatarAppearance'
import type { NavigationEdge, NavigationNode } from '../pathfinding/NavigationGraph'
import generatedRooms from './data/image-rooms.generated.json'

export type ImageRoomId = 'library' | 'chim-alan'

export type ImageRoomSeat = Readonly<{
  id: string
  label: string
  approachNodeId: string
  sit: Readonly<{ x: number; y: number; z: number }>
  facing: Direction8
  foregroundMask: readonly Readonly<{ x: number; y: number }>[] | null
  occlusion: Readonly<{ x1: number; y1: number; x2: number; y2: number }> | null
  foregroundAsset: ImageRoomCutoutAsset
}>

export type ImageRoomActor = Readonly<{
  nodeId: string
  name: string
  label: string
}>

export type ImageRoomOccluder = Readonly<{
  id: string
  type: string
  points: readonly Readonly<{ x: number; y: number }>[]
  depthY: number
  asset: ImageRoomCutoutAsset
}>

export type ImageRoomCutoutAsset = Readonly<{
  url: string
  x: number
  y: number
  width: number
  height: number
}>

export type ImageRoomDefinition = Readonly<{
  id: ImageRoomId
  title: string
  spawnNodeId: string
  image: Readonly<{ url: string; width: number; height: number; sha256: string }>
  nodes: readonly NavigationNode[]
  edges: readonly NavigationEdge[]
  seats: readonly ImageRoomSeat[]
  occluders: readonly ImageRoomOccluder[]
  actors: Readonly<Partial<Record<'spark' | 'rock', ImageRoomActor>>>
}>

const rooms = (generatedRooms as unknown as { rooms: Record<ImageRoomId, ImageRoomDefinition> }).rooms

export const IMAGE_ROOMS: Readonly<Record<ImageRoomId, ImageRoomDefinition>> = Object.freeze({
  library: rooms.library,
  'chim-alan': rooms['chim-alan'],
})

export function roomPointToPixel(
  room: ImageRoomDefinition,
  point: Readonly<{ x: number; y: number }>,
): { x: number; y: number } {
  return {
    x: (point.x / 100) * room.image.width,
    y: (point.y / 100) * room.image.height,
  }
}
