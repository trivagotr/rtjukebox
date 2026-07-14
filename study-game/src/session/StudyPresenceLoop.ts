const PRESENCE_INTERVAL_MS = 10_000

export interface StudyPresenceLoopOptions {
  setInterval?: (handler: () => void, milliseconds: number) => unknown
  clearInterval?: (handle: unknown) => void
}

export class StudyPresenceLoop {
  readonly #pulse: () => Promise<void>
  readonly #refresh: () => Promise<void>
  readonly #setInterval: (handler: () => void, milliseconds: number) => unknown
  readonly #clearInterval: (handle: unknown) => void
  #handle: unknown = null
  #currentRun: Promise<void> | null = null

  constructor(
    pulse: () => Promise<void>,
    refresh: () => Promise<void>,
    options: StudyPresenceLoopOptions = {},
  ) {
    this.#pulse = pulse
    this.#refresh = refresh
    this.#setInterval = options.setInterval
      ?? ((handler, milliseconds) => globalThis.setInterval(handler, milliseconds))
    this.#clearInterval = options.clearInterval
      ?? ((handle) => globalThis.clearInterval(handle as ReturnType<typeof setInterval>))
  }

  start(): void {
    if (this.#handle !== null) return
    const tick = () => { void this.pulseNow() }
    this.#handle = this.#setInterval(tick, PRESENCE_INTERVAL_MS)
    tick()
  }

  stop(): void {
    if (this.#handle === null) return
    this.#clearInterval(this.#handle)
    this.#handle = null
  }

  pulseNow(): Promise<void> {
    if (this.#currentRun) return this.#currentRun
    const run = Promise.allSettled([this.#pulse(), this.#refresh()])
      .then(() => undefined)
      .finally(() => {
        if (this.#currentRun === run) this.#currentRun = null
      })
    this.#currentRun = run
    return run
  }
}
