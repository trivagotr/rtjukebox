import { describe, expect, it } from 'vitest'

import { SeatReservationBook } from '../src/game/SeatReservationBook'

describe('SeatReservationBook', () => {
  it('reserves a local seat idempotently for the same owner', () => {
    const book = new SeatReservationBook()

    expect(book.reserve('library', 'seat-a', 'local-user')).toBe(true)
    expect(book.reserve('library', 'seat-a', 'local-user')).toBe(true)
    expect(book.snapshot()).toEqual([{
      roomId: 'library',
      seatId: 'seat-a',
      ownerId: 'local-user',
      status: 'reserved',
      source: 'local',
    }])
  })

  it('blocks a local claim when a remote user occupies the seat', () => {
    const book = new SeatReservationBook()
    book.syncRemoteOccupants('library', [{ seatId: 'seat-a', ownerId: 'remote-user' }])

    expect(book.isAvailable('library', 'seat-a', 'local-user')).toBe(false)
    expect(book.reserve('library', 'seat-a', 'local-user')).toBe(false)

    book.syncRemoteOccupants('library', [])
    expect(book.isAvailable('library', 'seat-a', 'local-user')).toBe(true)
  })

  it('promotes a local reservation to occupied without duplicating it', () => {
    const book = new SeatReservationBook()
    book.reserve('chim-alan', 'seat-c2', 'local-user')

    expect(book.occupy('chim-alan', 'seat-c2', 'local-user')).toBe(true)
    expect(book.snapshot()).toEqual([expect.objectContaining({
      roomId: 'chim-alan',
      seatId: 'seat-c2',
      ownerId: 'local-user',
      status: 'occupied',
    })])
  })

  it('releases on cancellation, standing, and leaving a room without deleting another owner', () => {
    const book = new SeatReservationBook()
    book.reserve('library', 'seat-a', 'local-user')
    book.reserve('library', 'seat-b', 'other-local-user')
    book.reserve('chim-alan', 'seat-c', 'local-user')

    expect(book.release('library', 'seat-a', 'local-user')).toBe(true)
    expect(book.release('library', 'seat-b', 'local-user')).toBe(false)
    expect(book.releaseOwner('local-user', 'chim-alan')).toBe(1)
    expect(book.snapshot()).toEqual([expect.objectContaining({ ownerId: 'other-local-user' })])
  })

  it('lets remote occupancy replace a conflicting optimistic local reservation', () => {
    const book = new SeatReservationBook()
    book.reserve('library', 'seat-a', 'local-user')

    book.syncRemoteOccupants('library', [{ seatId: 'seat-a', ownerId: 'remote-user' }])

    expect(book.snapshot()).toEqual([expect.objectContaining({
      ownerId: 'remote-user',
      status: 'occupied',
      source: 'remote',
    })])
  })
})
