import { describe, expect, it } from 'vitest'

import { AvatarActivityMachine } from '../src/game/AvatarActivityMachine'

describe('AvatarActivityMachine', () => {
  it('starts idle and exposes an immutable snapshot', () => {
    const machine = new AvatarActivityMachine()

    expect(machine.snapshot()).toEqual({
      state: 'idle',
      token: 0,
      activeSeatId: null,
    })
    expect(Object.isFrozen(machine.snapshot())).toBe(true)
  })

  it('gives each accepted touch intent a monotonically increasing token', () => {
    const machine = new AvatarActivityMachine()

    const firstWalk = machine.beginWalk()
    const seatApproach = machine.beginSeatApproach('library-window-seat')
    const secondWalk = machine.beginWalk()

    expect(seatApproach).toBeGreaterThan(firstWalk)
    expect(secondWalk).toBeGreaterThan(seatApproach)
    expect(machine.isCurrent(firstWalk)).toBe(false)
    expect(machine.isCurrent(seatApproach)).toBe(false)
    expect(machine.isCurrent(secondWalk)).toBe(true)
    expect(machine.snapshot()).toEqual({
      state: 'walking',
      token: secondWalk,
      activeSeatId: null,
    })
  })

  it('moves through approach, alignment, seated, standing, and idle', () => {
    const machine = new AvatarActivityMachine()
    const seatToken = machine.beginSeatApproach('library-window-seat')

    expect(machine.transition(seatToken, 'aligning-seat')).toBe(true)
    expect(machine.transition(seatToken, 'seated')).toBe(true)
    expect(machine.snapshot().activeSeatId).toBe('library-window-seat')

    const standToken = machine.beginStand()
    expect(machine.snapshot()).toEqual({
      state: 'standing',
      token: standToken,
      activeSeatId: 'library-window-seat',
    })
    expect(machine.transition(standToken, 'idle')).toBe(true)
    expect(machine.snapshot().activeSeatId).toBeNull()
  })

  it('supports walking retargets and a new walk after standing', () => {
    const machine = new AvatarActivityMachine()
    const first = machine.beginWalk()
    const second = machine.beginWalk()

    expect(machine.isCurrent(first)).toBe(false)
    expect(machine.snapshot().state).toBe('walking')
    expect(machine.transition(second, 'idle')).toBe(true)

    const seatToken = machine.beginSeatApproach('seat-a')
    machine.transition(seatToken, 'aligning-seat')
    machine.transition(seatToken, 'seated')
    const standToken = machine.beginStand()
    expect(machine.transition(standToken, 'walking')).toBe(true)
    expect(machine.snapshot().state).toBe('walking')
  })

  it('ignores stale arrival, sit, and stand callbacks', () => {
    const machine = new AvatarActivityMachine()
    const staleSeatToken = machine.beginSeatApproach('seat-a')
    const currentWalkToken = machine.beginWalk()

    expect(machine.transition(staleSeatToken, 'aligning-seat')).toBe(false)
    expect(machine.transition(staleSeatToken, 'seated')).toBe(false)
    expect(machine.transition(staleSeatToken, 'standing')).toBe(false)
    expect(machine.snapshot()).toEqual({
      state: 'walking',
      token: currentWalkToken,
      activeSeatId: null,
    })
  })

  it('rejects illegal transitions for the current token', () => {
    const machine = new AvatarActivityMachine()
    const walkToken = machine.beginWalk()

    expect(() => machine.transition(walkToken, 'seated')).toThrow(/walking.*seated/i)
  })

  it('cancels to idle while invalidating every outstanding callback', () => {
    const machine = new AvatarActivityMachine()
    const oldToken = machine.beginSeatApproach('seat-a')
    const cancelToken = machine.cancel()

    expect(cancelToken).toBeGreaterThan(oldToken)
    expect(machine.transition(oldToken, 'aligning-seat')).toBe(false)
    expect(machine.snapshot()).toEqual({ state: 'idle', token: cancelToken, activeSeatId: null })
  })
})
