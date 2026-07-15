type ImageRoomDepthPoint = Readonly<{ y: number; z: number }>

// Each Chim Alan terrace face spans about seven percentage points of source-image
// height. Navigation z records which terrace surface an actor stands on, so fold
// that elevation into render depth instead of treating every actor as ground-level.
const ELEVATION_DEPTH_STEP = 700

export function imageRoomActorDepth(point: ImageRoomDepthPoint, offset = 10): number {
  return point.y * 100 + point.z * ELEVATION_DEPTH_STEP + offset
}
