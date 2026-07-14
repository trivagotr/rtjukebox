import { describe, expect, it, vi } from 'vitest'

import { StudySessionTracker } from '../src/session/StudySessionTracker'

function createClock() {
  let now = 1_000
  return {
    now: () => now,
    advance: (milliseconds: number) => { now += milliseconds },
  }
}

describe('StudySessionTracker', () => {
  it('starts only after seating and finishes when the avatar stands', async () => {
    const clock = createClock()
    const adapter = {
      startStudySession: vi.fn().mockResolvedValue(undefined),
      heartbeatStudySession: vi.fn().mockResolvedValue(10),
      finishStudySession: vi.fn().mockResolvedValue({ todaySeconds: 31, monthSeconds: 31, totalSeconds: 31 }),
    }
    const tracker = new StudySessionTracker(adapter, {
      now: clock.now,
      clientSessionId: () => 'client-session-1',
      setInterval: vi.fn(() => 1),
      clearInterval: vi.fn(),
    })

    expect(tracker.snapshot().running).toBe(false)
    await tracker.seated('library', 'front-left', { x: 4, y: 8 })
    clock.advance(31_000)

    expect(adapter.startStudySession).toHaveBeenCalledWith('library', 'client-session-1')
    expect(tracker.snapshot()).toMatchObject({ running: true, activeSeconds: 31, seatId: 'front-left' })

    await tracker.stood()

    expect(adapter.finishStudySession).toHaveBeenCalledTimes(1)
    expect(tracker.snapshot()).toMatchObject({
      running: false,
      activeSeconds: 0,
      summary: { todaySeconds: 31, monthSeconds: 31, totalSeconds: 31 },
    })
  })

  it('pauses the visible timer and sends zero-eligibility heartbeats while hidden', async () => {
    const clock = createClock()
    const adapter = {
      startStudySession: vi.fn().mockResolvedValue(undefined),
      heartbeatStudySession: vi.fn().mockResolvedValue(0),
      finishStudySession: vi.fn().mockResolvedValue({ todaySeconds: 10, monthSeconds: 10, totalSeconds: 10 }),
    }
    const tracker = new StudySessionTracker(adapter, {
      now: clock.now,
      clientSessionId: () => 'client-session-2',
      setInterval: vi.fn(() => 1),
      clearInterval: vi.fn(),
    })

    await tracker.seated('chim-alan', 'amfi-c2', { x: 12, y: 8 })
    clock.advance(10_000)
    tracker.setAttention(true, false)
    clock.advance(25_000)

    expect(tracker.snapshot().activeSeconds).toBe(10)
    await tracker.heartbeat()
    expect(adapter.heartbeatStudySession).toHaveBeenCalledWith(expect.objectContaining({
      roomId: 'chim-alan', seatId: 'amfi-c2', focused: true, foreground: false,
    }))
  })

  it('finishes the old session before starting a different seat', async () => {
    const adapter = {
      startStudySession: vi.fn().mockResolvedValue(undefined),
      heartbeatStudySession: vi.fn().mockResolvedValue(0),
      finishStudySession: vi.fn().mockResolvedValue({ todaySeconds: 0, monthSeconds: 0, totalSeconds: 0 }),
    }
    const tracker = new StudySessionTracker(adapter, {
      now: () => 1_000,
      clientSessionId: vi.fn().mockReturnValueOnce('first-session').mockReturnValueOnce('second-session'),
      setInterval: vi.fn(() => 1),
      clearInterval: vi.fn(),
    })

    await tracker.seated('library', 'front-left', { x: 4, y: 8 })
    await tracker.seated('library', 'front-right', { x: 6, y: 8 })

    expect(adapter.finishStudySession).toHaveBeenCalledTimes(1)
    expect(adapter.startStudySession).toHaveBeenLastCalledWith('library', 'second-session')
  })

  it('retains a failed finish so standing or disposal can retry it', async () => {
    const adapter = {
      startStudySession: vi.fn().mockResolvedValue(undefined),
      heartbeatStudySession: vi.fn().mockResolvedValue(0),
      finishStudySession: vi.fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({ todaySeconds: 12, monthSeconds: 12, totalSeconds: 12 }),
    }
    const tracker = new StudySessionTracker(adapter, {
      setInterval: vi.fn(() => 1),
      clearInterval: vi.fn(),
    })

    await tracker.seated('library', 'front-left', { x: 4, y: 8 })
    await expect(tracker.stood()).rejects.toThrow('offline')

    expect(tracker.snapshot()).toMatchObject({ running: true, roomId: 'library', seatId: 'front-left' })
    await tracker.dispose()

    expect(adapter.finishStudySession).toHaveBeenCalledTimes(2)
    expect(tracker.snapshot()).toMatchObject({
      running: false,
      summary: { todaySeconds: 12, monthSeconds: 12, totalSeconds: 12 },
    })
  })
})
