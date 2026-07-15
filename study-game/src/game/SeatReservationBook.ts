export type SeatReservationStatus = 'reserved' | 'occupied'
export type SeatReservationSource = 'local' | 'remote'

export type SeatReservationRecord = Readonly<{
  roomId: string
  seatId: string
  ownerId: string
  status: SeatReservationStatus
  source: SeatReservationSource
}>

export type RemoteSeatOccupant = Readonly<{
  seatId: string
  ownerId: string
}>

const reservationKey = (roomId: string, seatId: string): string => `${roomId}\u0000${seatId}`

export class SeatReservationBook {
  readonly #reservations = new Map<string, SeatReservationRecord>()

  reserve(roomId: string, seatId: string, ownerId: string): boolean {
    const key = reservationKey(roomId, seatId)
    const existing = this.#reservations.get(key)
    if (existing) return existing.ownerId === ownerId
    this.#reservations.set(key, Object.freeze({
      roomId,
      seatId,
      ownerId,
      status: 'reserved',
      source: 'local',
    }))
    return true
  }

  occupy(roomId: string, seatId: string, ownerId: string): boolean {
    const key = reservationKey(roomId, seatId)
    const existing = this.#reservations.get(key)
    if (existing && existing.ownerId !== ownerId) return false
    this.#reservations.set(key, Object.freeze({
      roomId,
      seatId,
      ownerId,
      status: 'occupied',
      source: existing?.source ?? 'local',
    }))
    return true
  }

  isAvailable(roomId: string, seatId: string, ownerId?: string): boolean {
    const existing = this.#reservations.get(reservationKey(roomId, seatId))
    return !existing || existing.ownerId === ownerId
  }

  release(roomId: string, seatId: string, ownerId: string): boolean {
    const key = reservationKey(roomId, seatId)
    const existing = this.#reservations.get(key)
    if (!existing || existing.ownerId !== ownerId) return false
    return this.#reservations.delete(key)
  }

  releaseOwner(ownerId: string, roomId?: string): number {
    let released = 0
    for (const [key, reservation] of this.#reservations) {
      if (reservation.ownerId !== ownerId || (roomId && reservation.roomId !== roomId)) continue
      this.#reservations.delete(key)
      released += 1
    }
    return released
  }

  syncRemoteOccupants(roomId: string, occupants: readonly RemoteSeatOccupant[]): void {
    for (const [key, reservation] of this.#reservations) {
      if (reservation.roomId === roomId && reservation.source === 'remote') this.#reservations.delete(key)
    }
    for (const occupant of occupants) {
      this.#reservations.set(reservationKey(roomId, occupant.seatId), Object.freeze({
        roomId,
        seatId: occupant.seatId,
        ownerId: occupant.ownerId,
        status: 'occupied',
        source: 'remote',
      }))
    }
  }

  snapshot(): readonly SeatReservationRecord[] {
    return Object.freeze([...this.#reservations.values()]
      .sort((left, right) => `${left.roomId}:${left.seatId}`.localeCompare(`${right.roomId}:${right.seatId}`)))
  }
}
