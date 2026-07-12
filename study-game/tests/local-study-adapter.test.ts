import { describe, expect, it } from 'vitest'

import { LocalStudyAdapter } from '../src/adapters/LocalStudyAdapter'

describe('LocalStudyAdapter', () => {
  it('provides a deterministic signed-in account, global balance, inventory, and social presence', () => {
    const adapter = new LocalStudyAdapter({ now: () => 1_000 })
    const session = adapter.session()

    expect(session.account).toEqual({ id: 'local-student', displayName: 'TEDU Student', authenticated: true })
    expect(session.points).toEqual({ global: 240, studyToday: 0, dailyCap: 60, authoritative: false })
    expect(session.ownedWearableIds).toContain('beanie')
    expect(adapter.presence('library').map((entry) => entry.displayName)).toEqual(['Selin', 'Mert'])
  })

  it('accepts only public app account presentation for embedded mode', () => {
    const adapter = new LocalStudyAdapter({
      account: {id: 'user-42', displayName: 'Ada', authenticated: true},
      globalPoints: 915,
    })

    expect(adapter.session().account).toEqual({id: 'user-42', displayName: 'Ada', authenticated: true})
    expect(adapter.session().points.global).toBe(915)
  })

  it('owns seat occupancy and rejects conflicting reservations', () => {
    const adapter = new LocalStudyAdapter({ now: () => 1_000 })

    expect(() => adapter.reserveSeat('library', 'quiet-window')).toThrowError(/SEAT_OCCUPIED/)
    expect(adapter.reserveSeat('library', 'front-left').seatId).toBe('front-left')
    expect(() => adapter.reserveSeat('library', 'front-left')).toThrowError(/SEAT_ALREADY_RESERVED/)
    adapter.releaseSeat()
    expect(adapter.reserveSeat('chim-alan', 'amfi-c2').roomId).toBe('chim-alan')
  })

  it('rejects unowned equipment and never mutates the displayed global balance', () => {
    const adapter = new LocalStudyAdapter({ now: () => 1_000 })

    expect(() => adapter.equipWearable('premium-cap')).toThrowError(/WEARABLE_NOT_OWNED/)
    expect(adapter.equipWearable('beanie').equippedWearableIds).toContain('beanie')
    expect(() => adapter.purchaseWearable('premium-cap', 'fake-key')).toThrowError(/LOCAL_POINTS_READ_ONLY/)
    expect(adapter.session().points.global).toBe(240)
    expect('awardPoints' in adapter).toBe(false)
  })

  it('normalizes chat and rate-limits repeated messages', () => {
    let now = 1_000
    const adapter = new LocalStudyAdapter({ now: () => now, chatLimit: 2, chatWindowMs: 10_000 })

    expect(adapter.sendChat('  hello   library  ').text).toBe('hello library')
    now += 1
    adapter.sendChat('second')
    expect(() => adapter.sendChat('third')).toThrowError(/CHAT_RATE_LIMITED/)
    now += 10_001
    expect(adapter.sendChat('allowed again').text).toBe('allowed again')
  })
})
