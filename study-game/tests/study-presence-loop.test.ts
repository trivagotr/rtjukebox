import {describe, expect, it, vi} from 'vitest'

import {StudyPresenceLoop} from '../src/session/StudyPresenceLoop'

describe('StudyPresenceLoop', () => {
  it('keeps an idle user alive beyond the server TTL and stops on shutdown', async () => {
    const pulse = vi.fn().mockResolvedValue(undefined)
    const refresh = vi.fn().mockResolvedValue(undefined)
    let tick: (() => void) | undefined
    let intervalMs = 0
    const clearInterval = vi.fn()
    const loop = new StudyPresenceLoop(pulse, refresh, {
      setInterval: (handler, milliseconds) => {
        tick = handler
        intervalMs = milliseconds
        return 7
      },
      clearInterval,
    })

    loop.start()
    await loop.pulseNow()
    expect(intervalMs).toBe(10_000)
    for (let elapsed = 10; elapsed <= 40; elapsed += 10) {
      tick?.()
      await loop.pulseNow()
      expect(pulse).toHaveBeenCalledTimes((elapsed / 10) + 1)
    }

    expect(refresh).toHaveBeenCalledTimes(5)
    loop.stop()
    expect(clearInterval).toHaveBeenCalledWith(7)
  })

  it('absorbs transient heartbeat failures and continues the next pulse', async () => {
    const pulse = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined)
    let tick: (() => void) | undefined
    const loop = new StudyPresenceLoop(pulse, vi.fn().mockResolvedValue(undefined), {
      setInterval: (handler) => {
        tick = handler
        return 8
      },
      clearInterval: vi.fn(),
    })

    loop.start()
    await loop.pulseNow()
    tick?.()
    await loop.pulseNow()
    expect(pulse).toHaveBeenCalledTimes(2)
  })
})
