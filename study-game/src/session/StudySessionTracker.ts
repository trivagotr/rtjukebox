import type { StudyHeartbeatInput, StudyRoomId, StudyTimeSummary } from '../adapters/StudyAdapter'

const HEARTBEAT_INTERVAL_MS = 10_000
const EMPTY_SUMMARY: StudyTimeSummary = Object.freeze({ todaySeconds: 0, monthSeconds: 0, totalSeconds: 0 })

export interface StudySessionTransport {
  startStudySession(roomId: StudyRoomId, clientSessionId: string): Promise<void>
  heartbeatStudySession(input: StudyHeartbeatInput): Promise<number>
  finishStudySession(): Promise<StudyTimeSummary>
}

export interface StudySessionTrackerOptions {
  now?: () => number
  clientSessionId?: () => string
  setInterval?: (handler: () => void, milliseconds: number) => unknown
  clearInterval?: (handle: unknown) => void
  onChange?: (snapshot: StudySessionSnapshot) => void
}

export interface StudySessionSnapshot {
  running: boolean
  activeSeconds: number
  roomId: StudyRoomId | null
  seatId: string | null
  focused: boolean
  foreground: boolean
  summary: StudyTimeSummary
}

interface ActiveSeat {
  roomId: StudyRoomId
  seatId: string
  nodeId: string
  position: { x: number; y: number }
}

export class StudySessionTracker {
  readonly #adapter: StudySessionTransport
  readonly #now: () => number
  readonly #clientSessionId: () => string
  readonly #setInterval: (handler: () => void, milliseconds: number) => unknown
  readonly #clearInterval: (handle: unknown) => void
  readonly #onChange?: (snapshot: StudySessionSnapshot) => void
  #active: ActiveSeat | null = null
  #heartbeatHandle: unknown = null
  #focused = true
  #foreground = true
  #eligibleStartedAt: number | null = null
  #eligibleMilliseconds = 0
  #summary: StudyTimeSummary = EMPTY_SUMMARY
  #stopRequested = false
  #finishPromise: Promise<void> | null = null

  constructor(adapter: StudySessionTransport, options: StudySessionTrackerOptions = {}) {
    this.#adapter = adapter
    this.#now = options.now ?? Date.now
    this.#clientSessionId = options.clientSessionId ?? (() => `study-${this.#now()}-${Math.random().toString(36).slice(2, 10)}`)
    this.#setInterval = options.setInterval ?? ((handler, milliseconds) => globalThis.setInterval(handler, milliseconds))
    this.#clearInterval = options.clearInterval ?? ((handle) => globalThis.clearInterval(handle as ReturnType<typeof setInterval>))
    this.#onChange = options.onChange
  }

  async seated(roomId: StudyRoomId, seatId: string, position: { x: number; y: number }): Promise<void> {
    if (this.#active) await this.stood()
    await this.#adapter.startStudySession(roomId, this.#clientSessionId())
    this.#active = { roomId, seatId, nodeId: `seat:${seatId}`, position: { ...position } }
    this.#eligibleMilliseconds = 0
    this.#eligibleStartedAt = this.#isEligible() ? this.#now() : null
    this.#heartbeatHandle = this.#setInterval(() => { void this.heartbeat().catch(() => undefined) }, HEARTBEAT_INTERVAL_MS)
    this.#notify()
  }

  async heartbeat(): Promise<number> {
    if (!this.#active || this.#stopRequested) return 0
    return this.#adapter.heartbeatStudySession({
      ...this.#active,
      interaction: 'seated',
      focused: this.#focused,
      foreground: this.#foreground,
    })
  }

  async stood(): Promise<void> {
    if (!this.#active) return
    if (this.#finishPromise) return this.#finishPromise
    this.#flushEligibility()
    this.#stopRequested = true
    if (this.#heartbeatHandle !== null) this.#clearInterval(this.#heartbeatHandle)
    this.#heartbeatHandle = null
    this.#eligibleStartedAt = null
    const finish = async () => {
      this.#summary = await this.#adapter.finishStudySession()
      this.#active = null
      this.#eligibleMilliseconds = 0
      this.#stopRequested = false
      this.#notify()
    }
    this.#finishPromise = finish()
    try {
      await this.#finishPromise
    } finally {
      this.#finishPromise = null
    }
  }

  setAttention(focused: boolean, foreground: boolean): void {
    this.#flushEligibility()
    this.#focused = focused
    this.#foreground = foreground
    this.#eligibleStartedAt = this.#active && !this.#stopRequested && this.#isEligible() ? this.#now() : null
    this.#notify()
  }

  setSummary(summary: StudyTimeSummary): void {
    this.#summary = { ...summary }
    this.#notify()
  }

  snapshot(): StudySessionSnapshot {
    const liveMilliseconds = this.#eligibleStartedAt === null ? 0 : Math.max(0, this.#now() - this.#eligibleStartedAt)
    return {
      running: this.#active !== null,
      activeSeconds: Math.floor((this.#eligibleMilliseconds + liveMilliseconds) / 1_000),
      roomId: this.#active?.roomId ?? null,
      seatId: this.#active?.seatId ?? null,
      focused: this.#focused,
      foreground: this.#foreground,
      summary: { ...this.#summary },
    }
  }

  async dispose(): Promise<void> {
    await this.stood()
  }

  #isEligible() {
    return this.#focused && this.#foreground
  }

  #flushEligibility() {
    if (this.#eligibleStartedAt !== null) {
      this.#eligibleMilliseconds += Math.max(0, this.#now() - this.#eligibleStartedAt)
      this.#eligibleStartedAt = null
    }
  }

  #notify() {
    this.#onChange?.(this.snapshot())
  }
}
