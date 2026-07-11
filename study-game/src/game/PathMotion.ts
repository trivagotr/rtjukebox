export interface MotionWaypoint {
  id: string
  x: number
  y: number
  z: number
}

export interface MotionSegment {
  from: MotionWaypoint
  to: MotionWaypoint
  length: number
  startDistance: number
  endDistance: number
}

export interface MotionPath {
  segments: readonly MotionSegment[]
  totalLength: number
}

export interface MotionSample {
  x: number
  y: number
  z: number
  segmentIndex: number
  segmentProgress: number
  from: MotionWaypoint
  to: MotionWaypoint
}

export function buildMotionPath(points: readonly MotionWaypoint[]): MotionPath {
  const segments: MotionSegment[] = []
  let totalLength = 0
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]!
    const to = points[index]!
    const length = Math.hypot(to.x - from.x, to.y - from.y)
    if (length === 0) continue
    segments.push({ from, to, length, startDistance: totalLength, endDistance: totalLength + length })
    totalLength += length
  }
  return { segments, totalLength }
}

export function sampleMotionPath(path: MotionPath, requestedDistance: number): MotionSample {
  if (path.segments.length === 0) throw new Error('Cannot sample an empty motion path')
  const distance = Math.max(0, Math.min(requestedDistance, path.totalLength))
  let segmentIndex = path.segments.findIndex((segment, index) =>
    distance < segment.endDistance || index === path.segments.length - 1,
  )
  if (segmentIndex < 0) segmentIndex = path.segments.length - 1
  const segment = path.segments[segmentIndex]!
  const segmentProgress = Math.max(0, Math.min(1, (distance - segment.startDistance) / segment.length))
  return {
    x: segment.from.x + (segment.to.x - segment.from.x) * segmentProgress,
    y: segment.from.y + (segment.to.y - segment.from.y) * segmentProgress,
    z: segment.from.z + (segment.to.z - segment.from.z) * segmentProgress,
    segmentIndex,
    segmentProgress,
    from: segment.from,
    to: segment.to,
  }
}
