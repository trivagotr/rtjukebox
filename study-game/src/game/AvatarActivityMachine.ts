export type AvatarActivityState =
  | 'idle'
  | 'walking'
  | 'approaching-seat'
  | 'aligning-seat'
  | 'seated'
  | 'standing'

export type ActivityToken = number

export type AvatarActivitySnapshot = Readonly<{
  state: AvatarActivityState
  token: ActivityToken
  activeSeatId: string | null
}>

const LEGAL_TRANSITIONS: Readonly<Record<AvatarActivityState, ReadonlySet<AvatarActivityState>>> = {
  idle: new Set(['idle', 'walking', 'approaching-seat']),
  walking: new Set(['idle', 'walking', 'approaching-seat', 'standing']),
  'approaching-seat': new Set(['idle', 'walking', 'aligning-seat', 'standing']),
  'aligning-seat': new Set(['idle', 'walking', 'seated', 'standing']),
  seated: new Set(['standing']),
  standing: new Set(['idle', 'walking', 'approaching-seat']),
}

export class AvatarActivityMachine {
  #state: AvatarActivityState = 'idle'
  #token: ActivityToken = 0
  #activeSeatId: string | null = null

  beginWalk(): ActivityToken {
    return this.#begin('walking', null)
  }

  beginSeatApproach(seatId: string): ActivityToken {
    if (!seatId) throw new Error('Seat id is required for a seat approach')
    return this.#begin('approaching-seat', seatId)
  }

  beginStand(): ActivityToken {
    return this.#begin('standing', this.#activeSeatId)
  }

  cancel(): ActivityToken {
    return this.#begin('idle', null)
  }

  transition(token: ActivityToken, nextState: AvatarActivityState): boolean {
    if (!this.isCurrent(token)) return false
    if (!LEGAL_TRANSITIONS[this.#state].has(nextState)) {
      throw new Error(`Illegal avatar activity transition from ${this.#state} to ${nextState}`)
    }
    this.#state = nextState
    if (nextState === 'idle' || nextState === 'walking') this.#activeSeatId = null
    return true
  }

  isCurrent(token: ActivityToken): boolean {
    return token === this.#token
  }

  snapshot(): AvatarActivitySnapshot {
    return Object.freeze({
      state: this.#state,
      token: this.#token,
      activeSeatId: this.#activeSeatId,
    })
  }

  #begin(state: AvatarActivityState, activeSeatId: string | null): ActivityToken {
    this.#token += 1
    this.#state = state
    this.#activeSeatId = activeSeatId
    return this.#token
  }
}
