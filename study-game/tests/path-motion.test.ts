import { describe, expect, it } from 'vitest'

import {
  buildMotionPath,
  sampleMotionPath,
  sampleMotionPathAtTime,
  walkFrameAtDistance,
} from '../src/game/PathMotion'

describe('PathMotion', () => {
  const motion = buildMotionPath([
    { id: 'a', x: 0, y: 0, z: 0 },
    { id: 'b', x: 30, y: 0, z: 0 },
    { id: 'c', x: 30, y: 40, z: 1 },
  ])

  it('builds one cumulative constant-speed path across every waypoint', () => {
    expect(motion.totalLength).toBe(70)
    expect(motion.segments.map((segment) => [segment.startDistance, segment.endDistance])).toEqual([
      [0, 30],
      [30, 70],
    ])
  })

  it('samples continuously without restarting progress at a waypoint', () => {
    expect(sampleMotionPath(motion, 15)).toEqual(expect.objectContaining({ x: 15, y: 0, segmentIndex: 0 }))
    expect(sampleMotionPath(motion, 30)).toEqual(expect.objectContaining({ x: 30, y: 0, segmentIndex: 1 }))
    expect(sampleMotionPath(motion, 50)).toEqual(expect.objectContaining({ x: 30, y: 20, segmentIndex: 1 }))
    expect(sampleMotionPath(motion, 70)).toEqual(expect.objectContaining({ x: 30, y: 40, segmentIndex: 1, z: 1 }))
  })

  it('clamps before the start and after the destination', () => {
    expect(sampleMotionPath(motion, -10)).toEqual(expect.objectContaining({ x: 0, y: 0 }))
    expect(sampleMotionPath(motion, 100)).toEqual(expect.objectContaining({ x: 30, y: 40 }))
  })

  it('samples elapsed time at one configured world speed', () => {
    expect(sampleMotionPathAtTime(motion, 150, 100)).toEqual(expect.objectContaining({
      x: 15,
      y: 0,
      distance: 15,
      complete: false,
      direction: { x: 1, y: 0 },
    }))
    expect(sampleMotionPathAtTime(motion, 500, 100)).toEqual(expect.objectContaining({
      x: 30,
      y: 20,
      distance: 50,
      complete: false,
      direction: { x: 0, y: 1 },
    }))
    expect(sampleMotionPathAtTime(motion, 900, 100)).toEqual(expect.objectContaining({
      x: 30,
      y: 40,
      distance: 70,
      complete: true,
    }))
  })

  it('rejects a non-positive or non-finite walking speed', () => {
    expect(() => sampleMotionPathAtTime(motion, 100, 0)).toThrow(/speed/i)
    expect(() => sampleMotionPathAtTime(motion, 100, Number.NaN)).toThrow(/speed/i)
  })

  it('keeps walk frames continuous across waypoint boundaries', () => {
    expect(walkFrameAtDistance(29, 4, 10)).toBe(2)
    expect(walkFrameAtDistance(31, 4, 10)).toBe(3)
    expect(walkFrameAtDistance(41, 4, 10)).toBe(0)
  })
})
