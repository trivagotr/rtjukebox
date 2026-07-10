export type StudyRoomId = 'library' | 'chim-alan'

export interface StudyAccount {
  id: string
  displayName: string
  authenticated: boolean
}

export interface StudyPointBalance {
  global: number
  studyToday: number
  dailyCap: number
  authoritative: boolean
}

export interface StudyPresence {
  userId: string
  displayName: string
  roomId: StudyRoomId
  nodeId: string
  seatId: string | null
  color: number
}

export interface StudyChatMessage {
  id: string
  userId: string
  displayName: string
  text: string
  createdAt: number
}

export interface StudySeatReservation {
  roomId: StudyRoomId
  seatId: string
  reservedAt: number
}

export interface StudySession {
  account: StudyAccount
  points: StudyPointBalance
  ownedWearableIds: readonly string[]
  equippedWearableIds: readonly string[]
}

export interface StudyAdapter {
  session(): StudySession
  presence(roomId: StudyRoomId): readonly StudyPresence[]
  enterRoom(roomId: StudyRoomId, nodeId: string): void
  reserveSeat(roomId: StudyRoomId, seatId: string): StudySeatReservation
  releaseSeat(): void
  equipWearable(id: string): StudySession
  purchaseWearable(id: string, idempotencyKey: string): StudySession
  sendChat(text: string): StudyChatMessage
}

export class StudyAdapterError extends Error {
  constructor(readonly code: string, message = code) {
    super(`${code}: ${message}`)
    this.name = 'StudyAdapterError'
  }
}
