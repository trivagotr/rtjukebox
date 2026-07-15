import { describe, expect, it } from 'vitest'

import { resolveTouchIntent, type TouchIntentResolverInput } from '../src/game/TouchIntentResolver'

const baseInput = (overrides: Partial<TouchIntentResolverInput> = {}): TouchIntentResolverInput => ({
  world: { x: 100, y: 100 },
  uiConsumed: false,
  seated: false,
  activeSeatIntentId: null,
  nodes: [
    { id: 'floor-a', x: 100, y: 100, reachable: true },
    { id: 'blocked-floor', x: 220, y: 100, reachable: false },
  ],
  seats: [
    { id: 'seat-a', x: 110, y: 100, reachable: true, occupied: false },
    { id: 'seat-b', x: 300, y: 100, reachable: true, occupied: true },
  ],
  players: [],
  ...overrides,
})

describe('resolveTouchIntent', () => {
  it('lets a seat hit area win over a nearby floor node', () => {
    expect(resolveTouchIntent(baseInput())).toEqual({
      kind: 'sit',
      seatId: 'seat-a',
      target: { x: 110, y: 100 },
    })
  })

  it('turns any world tap into stand while the local avatar is seated', () => {
    expect(resolveTouchIntent(baseInput({ seated: true }))).toEqual({ kind: 'stand' })
  })

  it('does nothing when the UI has already consumed the touch', () => {
    expect(resolveTouchIntent(baseInput({ uiConsumed: true }))).toEqual({
      kind: 'ignored',
      reason: 'ui-consumed',
    })
  })

  it('rejects occupied seats and unreachable floor targets', () => {
    expect(resolveTouchIntent(baseInput({ world: { x: 300, y: 100 } }))).toEqual({
      kind: 'blocked',
      reason: 'occupied-seat',
      target: { x: 300, y: 100 },
    })
    expect(resolveTouchIntent(baseInput({ world: { x: 220, y: 100 }, seats: [] }))).toEqual({
      kind: 'blocked',
      reason: 'unreachable',
      target: { x: 220, y: 100 },
    })
  })

  it('returns one walk intent for a reachable floor target', () => {
    expect(resolveTouchIntent(baseInput({ seats: [] }))).toEqual({
      kind: 'walk',
      nodeId: 'floor-a',
      target: { x: 100, y: 100 },
    })
  })

  it('returns one player interaction before considering the floor', () => {
    expect(resolveTouchIntent(baseInput({
      seats: [],
      players: [{ userId: 'user-2', x: 105, y: 102 }],
    }))).toEqual({
      kind: 'interact-player',
      userId: 'user-2',
    })
  })

  it('does not enqueue the same seat interaction twice', () => {
    expect(resolveTouchIntent(baseInput({ activeSeatIntentId: 'seat-a' }))).toEqual({
      kind: 'ignored',
      reason: 'duplicate-seat',
    })
  })

  it('returns a blocked intent when no world target is close enough', () => {
    expect(resolveTouchIntent(baseInput({ world: { x: 600, y: 500 } }))).toEqual({
      kind: 'blocked',
      reason: 'no-target',
      target: { x: 600, y: 500 },
    })
  })
})
