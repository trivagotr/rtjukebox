import {
  StudyAdapterError,
  type StudyAdapter,
  type StudyAccount,
  type StudyChatMessage,
  type StudyPresence,
  type StudyRoomId,
  type StudySeatReservation,
  type StudySession,
} from './StudyAdapter'

const OWNED = Object.freeze([
  'short-hair', 'radio-hoodie', 'varsity-jacket', 'jeans', 'black-cargos',
  'sneakers', 'boots', 'bucket-hat', 'beanie',
])

const FAKE_PRESENCE: readonly StudyPresence[] = Object.freeze([
  { userId: 'local-selin', displayName: 'Selin', roomId: 'library', nodeId: 'approach:quiet-window', seatId: 'quiet-window', color: 0xd99249 },
  { userId: 'local-mert', displayName: 'Mert', roomId: 'library', nodeId: 'approach:corner-sofa', seatId: 'corner-sofa', color: 0x4f91c7 },
  { userId: 'local-deniz', displayName: 'Deniz', roomId: 'chim-alan', nodeId: 'row-2-mid', seatId: 'amfi-b2', color: 0x9d6fc0 },
])

export interface LocalStudyAdapterOptions {
  now?: () => number
  chatLimit?: number
  chatWindowMs?: number
  account?: StudyAccount
  globalPoints?: number
}

export class LocalStudyAdapter implements StudyAdapter {
  readonly #now: () => number
  readonly #chatLimit: number
  readonly #chatWindowMs: number
  readonly #account: StudyAccount
  readonly #globalPoints: number
  readonly #equipped = new Set<string>()
  readonly #chatTimestamps: number[] = []
  #activeSeat: StudySeatReservation | null = null
  #activeRoom: StudyRoomId = 'library'
  #activeNodeId = 'spawn'
  #messageSequence = 0

  constructor(options: LocalStudyAdapterOptions = {}) {
    this.#now = options.now ?? Date.now
    this.#chatLimit = options.chatLimit ?? 5
    this.#chatWindowMs = options.chatWindowMs ?? 10_000
    this.#account = options.account ?? { id: 'local-student', displayName: 'TEDU Student', authenticated: true }
    this.#globalPoints = Math.max(0, Math.floor(options.globalPoints ?? 240))
  }

  session(): StudySession {
    return {
      account: this.#account,
      points: { global: this.#globalPoints, studyToday: 0, dailyCap: 60, authoritative: false },
      ownedWearableIds: OWNED,
      equippedWearableIds: [...this.#equipped],
    }
  }

  presence(roomId: StudyRoomId): readonly StudyPresence[] {
    return FAKE_PRESENCE.filter((entry) => entry.roomId === roomId)
  }

  enterRoom(roomId: StudyRoomId, nodeId: string): void {
    this.releaseSeat()
    this.#activeRoom = roomId
    this.#activeNodeId = nodeId
  }

  reserveSeat(roomId: StudyRoomId, seatId: string): StudySeatReservation {
    if (this.#activeSeat) throw new StudyAdapterError('SEAT_ALREADY_RESERVED')
    if (FAKE_PRESENCE.some((entry) => entry.roomId === roomId && entry.seatId === seatId)) {
      throw new StudyAdapterError('SEAT_OCCUPIED')
    }
    const reservation = Object.freeze({ roomId, seatId, reservedAt: this.#now() })
    this.#activeRoom = roomId
    this.#activeNodeId = `seat:${seatId}`
    this.#activeSeat = reservation
    return reservation
  }

  releaseSeat(): void {
    this.#activeSeat = null
  }

  equipWearable(id: string): StudySession {
    if (!OWNED.includes(id)) throw new StudyAdapterError('WEARABLE_NOT_OWNED', id)
    this.#equipped.add(id)
    return this.session()
  }

  purchaseWearable(_id: string, _idempotencyKey: string): StudySession {
    throw new StudyAdapterError('LOCAL_POINTS_READ_ONLY')
  }

  sendChat(text: string): StudyChatMessage {
    const normalized = text.trim().replace(/\s+/g, ' ')
    if (!normalized) throw new StudyAdapterError('CHAT_EMPTY')
    if (normalized.length > 180) throw new StudyAdapterError('CHAT_TOO_LONG')
    const now = this.#now()
    while (this.#chatTimestamps.length && now - this.#chatTimestamps[0]! >= this.#chatWindowMs) this.#chatTimestamps.shift()
    if (this.#chatTimestamps.length >= this.#chatLimit) throw new StudyAdapterError('CHAT_RATE_LIMITED')
    this.#chatTimestamps.push(now)
    return {
      id: `local-message-${++this.#messageSequence}`,
      userId: 'local-student',
      displayName: 'TEDU Student',
      text: normalized,
      createdAt: now,
    }
  }
}
