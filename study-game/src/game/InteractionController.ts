import type { GridPoint, SeatDefinition } from '../rooms/RoomDefinition'
import { sameGridPoint } from '../rooms/RoomDefinition'

export type InteractionPhase = 'idle' | 'approaching' | 'sitting' | 'standing'

type SeatInteractionPlan = {
  seatId: string
  approach: GridPoint
  facing: SeatDefinition['facing']
  sitAnchor: SeatDefinition['sitAnchor']
  foregroundObjectId?: string
}

export class InteractionController {
  private currentSeat: SeatDefinition | null = null
  private currentPhase: InteractionPhase = 'idle'

  get phase(): InteractionPhase {
    return this.currentPhase
  }

  get activeSeatId(): string | null {
    return this.currentSeat?.id ?? null
  }

  beginSit(seat: SeatDefinition): SeatInteractionPlan {
    if (this.currentPhase !== 'idle') {
      throw new Error('Another interaction is already active')
    }

    this.currentSeat = structuredClone(seat)
    this.currentPhase = 'approaching'
    return {
      seatId: seat.id,
      approach: { ...seat.approach },
      facing: seat.facing,
      sitAnchor: { ...seat.sitAnchor },
      ...(seat.foregroundObjectId ? { foregroundObjectId: seat.foregroundObjectId } : {}),
    }
  }

  arriveAtApproach(position: GridPoint) {
    if (this.currentPhase !== 'approaching' || !this.currentSeat) {
      throw new Error('No seat approach is active')
    }
    if (!sameGridPoint(position, this.currentSeat.approach)) {
      throw new Error('Avatar must reach the exact approach tile before sitting')
    }

    this.currentPhase = 'sitting'
    return {
      action: 'sit' as const,
      direction: this.currentSeat.facing,
      anchor: { ...this.currentSeat.sitAnchor },
      seatTile: { ...this.currentSeat.tile },
    }
  }

  beginStand() {
    if (this.currentPhase !== 'sitting' || !this.currentSeat) {
      throw new Error('Avatar must be sitting before standing')
    }

    this.currentPhase = 'standing'
    return {
      action: 'stand' as const,
      returnTo: { ...this.currentSeat.approach },
      seatId: this.currentSeat.id,
    }
  }

  completeStand(position: GridPoint): void {
    if (this.currentPhase !== 'standing' || !this.currentSeat) {
      throw new Error('No stand transition is active')
    }
    if (!sameGridPoint(position, this.currentSeat.approach)) {
      throw new Error('Avatar must return to the approach tile after standing')
    }

    this.currentSeat = null
    this.currentPhase = 'idle'
  }
}
