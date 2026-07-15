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

export interface TimedMotionSample extends MotionSample {
  distance: number
  complete: boolean
  direction: Readonly<{ x: number; y: number }>
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

export function sampleMotionPathAtTime(
  path: MotionPath,
  elapsedMs: number,
  pixelsPerSecond: number,
): TimedMotionSample {
  if (!Number.isFinite(pixelsPerSecond) || pixelsPerSecond <= 0) {
    throw new Error('Walking speed must be a positive finite number')
  }

  const distance = Math.max(0, Math.min(path.totalLength, (Math.max(0, elapsedMs) / 1_000) * pixelsPerSecond))
  const sample = sampleMotionPath(path, distance)
  const segmentLength = Math.hypot(sample.to.x - sample.from.x, sample.to.y - sample.from.y)
  return {
    ...sample,
    distance,
    complete: distance >= path.totalLength,
    direction: Object.freeze({
      x: segmentLength === 0 ? 0 : (sample.to.x - sample.from.x) / segmentLength,
      y: segmentLength === 0 ? 0 : (sample.to.y - sample.from.y) / segmentLength,
    }),
  }
}

export function walkFrameAtDistance(
  travelledDistance: number,
  frameCount: number,
  stridePixels: number,
): number {
  if (!Number.isInteger(frameCount) || frameCount <= 0) throw new Error('Walk frame count must be a positive integer')
  if (!Number.isFinite(stridePixels) || stridePixels <= 0) throw new Error('Walk stride must be a positive number')
  return Math.floor(Math.max(0, travelledDistance) / stridePixels) % frameCount
}
