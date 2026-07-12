import { describe, expect, it } from 'vitest'

import { InteractionController } from '../src/game/InteractionController'
import type { SeatDefinition } from '../src/rooms/RoomDefinition'

const seat: SeatDefinition = {
  id: 'proof-seat',
  tile: { x: 8, y: 7, z: 1 },
  approach: { x: 7, y: 8, z: 0 },
  facing: 'ne',
  sitAnchor: { x: 2, y: -14 },
  foregroundObjectId: 'proof-seat-front',
}

describe('InteractionController', () => {
  it('plans approach, facing, seat anchor, and foreground occlusion as one interaction', () => {
    const controller = new InteractionController()
    const plan = controller.beginSit(seat)

    expect(controller.phase).toBe('approaching')
    expect(plan).toEqual({
      seatId: 'proof-seat',
      approach: { x: 7, y: 8, z: 0 },
      facing: 'ne',
      sitAnchor: { x: 2, y: -14 },
      foregroundObjectId: 'proof-seat-front',
    })
  })

  it('only enters sitting after reaching the exact approach tile', () => {
    const controller = new InteractionController()
    controller.beginSit(seat)

    expect(() => controller.arriveAtApproach({ x: 6, y: 8, z: 0 })).toThrow(/approach tile/i)
    expect(controller.arriveAtApproach({ x: 7, y: 8, z: 0 })).toEqual({
      action: 'sit',
      direction: 'ne',
      anchor: { x: 2, y: -14 },
      seatTile: { x: 8, y: 7, z: 1 },
    })
    expect(controller.phase).toBe('sitting')
  })

  it('stands before returning to the approach tile and clears the seat', () => {
    const controller = new InteractionController()
    controller.beginSit(seat)
    controller.arriveAtApproach(seat.approach)

    expect(controller.beginStand()).toEqual({
      action: 'stand',
      returnTo: { x: 7, y: 8, z: 0 },
      seatId: 'proof-seat',
    })
    expect(controller.phase).toBe('standing')

    controller.completeStand({ x: 7, y: 8, z: 0 })
    expect(controller.phase).toBe('idle')
    expect(controller.activeSeatId).toBeNull()
  })

  it('rejects overlapping seat interactions and invalid stand transitions', () => {
    const controller = new InteractionController()
    expect(() => controller.beginStand()).toThrow(/sitting/i)

    controller.beginSit(seat)
    expect(() => controller.beginSit({ ...seat, id: 'another-seat' })).toThrow(/interaction/i)
  })
})
