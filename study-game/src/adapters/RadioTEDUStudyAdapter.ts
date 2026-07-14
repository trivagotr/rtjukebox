import {
  StudyAdapterError,
  type StudyAccount,
  type StudyAdapter,
  type StudyChatMessage,
  type StudyHeartbeatInput,
  type StudyPresence,
  type StudyRoomId,
  type StudySeatReservation,
  type StudySession,
  type StudyTimeSummary,
} from './StudyAdapter'

const STARTER_WEARABLES = Object.freeze(['short-hair', 'radio-hoodie', 'jeans', 'sneakers', 'bucket-hat'])
const EMPTY_SUMMARY: StudyTimeSummary = Object.freeze({ todaySeconds: 0, monthSeconds: 0, totalSeconds: 0 })

interface ApiResponse<T> {
  success?: boolean
  data?: T
  message?: string
  error?: string
}

interface ActiveRemoteSession {
  id: string
  nonce: string
}

export interface RadioTEDUStudyAdapterConfig {
  apiBase: string
  accessToken: string
  account: StudyAccount
  globalPoints?: number
  fetchImpl?: typeof fetch
  now?: () => number
}

export class RadioTEDUStudyAdapter implements StudyAdapter {
  readonly authoritativeInventory = true
  readonly #apiBase: string
  readonly #accessToken: string
  readonly #fetch: typeof fetch
  readonly #now: () => number
  readonly #account: StudyAccount
  readonly #owned = new Set<string>(STARTER_WEARABLES)
  readonly #equipped = new Set<string>()
  readonly #presence = new Map<StudyRoomId, readonly StudyPresence[]>()
  #globalPoints: number
  #summary: StudyTimeSummary = EMPTY_SUMMARY
  #activeSession: ActiveRemoteSession | null = null
  #activeSeat: StudySeatReservation | null = null

  constructor(config: RadioTEDUStudyAdapterConfig) {
    if (!config.account.authenticated || !config.accessToken.trim()) {
      throw new StudyAdapterError('AUTH_REQUIRED')
    }
    this.#apiBase = config.apiBase.replace(/\/+$/, '')
    this.#accessToken = config.accessToken
    this.#fetch = config.fetchImpl ?? fetch
    this.#now = config.now ?? Date.now
    this.#account = Object.freeze({ ...config.account })
    this.#globalPoints = nonNegativeInteger(config.globalPoints)
  }

  async initialize(): Promise<void> {
    const [profile, summary] = await Promise.all([
      this.#request<{
        ownedItemIds?: unknown
        equipped?: Record<string, unknown>
        points?: { spendable_points?: unknown }
      }>('/avatar/me'),
      this.fetchSummary(),
    ])
    if (Array.isArray(profile.ownedItemIds)) {
      this.#owned.clear()
      for (const id of profile.ownedItemIds) if (typeof id === 'string') this.#owned.add(id)
    }
    this.#equipped.clear()
    for (const id of Object.values(profile.equipped ?? {})) if (typeof id === 'string') this.#equipped.add(id)
    this.#globalPoints = nonNegativeInteger(profile.points?.spendable_points, this.#globalPoints)
    this.#summary = summary
  }

  session(): StudySession {
    return {
      account: this.#account,
      points: {
        global: this.#globalPoints,
        studyToday: Math.floor(this.#summary.todaySeconds / 60),
        dailyCap: 25,
        authoritative: true,
      },
      ownedWearableIds: [...this.#owned],
      equippedWearableIds: [...this.#equipped],
    }
  }

  presence(roomId: StudyRoomId): readonly StudyPresence[] {
    return this.#presence.get(roomId) ?? []
  }

  enterRoom(): void {
    this.releaseSeat()
  }

  reserveSeat(roomId: StudyRoomId, seatId: string): StudySeatReservation {
    if (this.#activeSeat) throw new StudyAdapterError('SEAT_ALREADY_RESERVED')
    if (this.presence(roomId).some((entry) => entry.userId !== this.#account.id && entry.seatId === seatId)) {
      throw new StudyAdapterError('SEAT_OCCUPIED')
    }
    this.#activeSeat = Object.freeze({ roomId, seatId, reservedAt: this.#now() })
    return this.#activeSeat
  }

  releaseSeat(): void {
    this.#activeSeat = null
  }

  async equipWearable(id: string, slot?: string): Promise<StudySession> {
    if (!this.#owned.has(id)) throw new StudyAdapterError('WEARABLE_NOT_OWNED', id)
    if (!slot) throw new StudyAdapterError('WEARABLE_SLOT_REQUIRED', id)
    await this.#request('/avatar/equip', { method: 'POST', body: { itemId: id, slot } })
    this.#equipped.add(id)
    return this.session()
  }

  async purchaseWearable(id: string, idempotencyKey: string): Promise<StudySession> {
    const data = await this.#request<{
      ownedItemIds?: unknown
      points?: { spendable_points?: unknown }
    }>('/avatar/purchase', { method: 'POST', body: { itemId: id, idempotencyKey } })
    for (const itemId of Array.isArray(data.ownedItemIds) ? data.ownedItemIds : []) {
      if (typeof itemId === 'string') this.#owned.add(itemId)
    }
    this.#globalPoints = nonNegativeInteger(data.points?.spendable_points, this.#globalPoints)
    return this.session()
  }

  async startStudySession(roomId: StudyRoomId, clientSessionId: string): Promise<void> {
    const data = await this.#request<{ session?: { id?: unknown }; nonce?: unknown }>('/sessions/start', {
      method: 'POST', body: { location: roomId, clientSessionId },
    })
    if (typeof data.session?.id !== 'string' || typeof data.nonce !== 'string') {
      throw new StudyAdapterError('INVALID_SESSION_RESPONSE')
    }
    this.#activeSession = { id: data.session.id, nonce: data.nonce }
  }

  async heartbeatStudySession(input: StudyHeartbeatInput): Promise<number> {
    if (!this.#activeSession) throw new StudyAdapterError('SESSION_NOT_ACTIVE')
    const active = this.#activeSession
    const data = await this.#request<{ nonce?: unknown; accepted_seconds?: unknown; acceptedSeconds?: unknown }>(
      `/sessions/${encodeURIComponent(active.id)}/heartbeat`,
      {
        method: 'POST',
        body: {
          nonce: active.nonce,
          roomId: input.roomId,
          nodeId: input.nodeId,
          seatId: input.seatId,
          position: input.position,
          interaction: input.interaction,
          focused: input.focused,
          foreground: input.foreground,
        },
      },
    )
    if (typeof data.nonce !== 'string') throw new StudyAdapterError('INVALID_HEARTBEAT_RESPONSE')
    this.#activeSession = { id: active.id, nonce: data.nonce }
    return nonNegativeInteger(data.accepted_seconds ?? data.acceptedSeconds)
  }

  async finishStudySession(): Promise<StudyTimeSummary> {
    if (!this.#activeSession) return this.#summary
    const active = this.#activeSession
    this.#activeSession = null
    try {
      await this.#request(`/sessions/${encodeURIComponent(active.id)}/finish`, {
        method: 'POST', body: { nonce: active.nonce }, keepalive: true,
      })
    } catch (error) {
      this.#activeSession = active
      throw error
    }
    return this.fetchSummary()
  }

  async fetchSummary(): Promise<StudyTimeSummary> {
    const data = await this.#request<Partial<StudyTimeSummary>>('/summary')
    this.#summary = {
      todaySeconds: nonNegativeInteger(data.todaySeconds),
      monthSeconds: nonNegativeInteger(data.monthSeconds),
      totalSeconds: nonNegativeInteger(data.totalSeconds),
    }
    return this.#summary
  }

  async refreshPresence(roomId: StudyRoomId): Promise<readonly StudyPresence[]> {
    const data = await this.#request<{ presence?: unknown }>(`/presence?roomId=${encodeURIComponent(roomId)}`)
    const entries = Array.isArray(data.presence) ? data.presence : []
    const mapped = entries.flatMap((value) => {
      const row = value as Record<string, unknown>
      if (typeof row.userId !== 'string' || row.userId === this.#account.id || typeof row.displayName !== 'string' || typeof row.nodeId !== 'string') return []
      const equipped = row.equipped && typeof row.equipped === 'object' ? Object.values(row.equipped) : []
      return [{
        userId: row.userId,
        displayName: row.displayName.slice(0, 80),
        roomId,
        nodeId: row.nodeId,
        seatId: typeof row.seatId === 'string' ? row.seatId : null,
        color: colorForUser(row.userId),
        equippedWearableIds: equipped.filter((id): id is string => typeof id === 'string'),
      } satisfies StudyPresence]
    })
    this.#presence.set(roomId, mapped)
    return mapped
  }

  async heartbeatPresence(input: Omit<StudyHeartbeatInput, 'interaction' | 'focused' | 'foreground'>): Promise<void> {
    await this.#request('/presence/heartbeat', {
      method: 'POST',
      body: { roomId: input.roomId, nodeId: input.nodeId, seatId: input.seatId, position: input.position },
    })
  }

  async refreshChat(roomId: StudyRoomId): Promise<readonly StudyChatMessage[]> {
    const data = await this.#request<{ messages?: unknown }>(`/chat?roomId=${encodeURIComponent(roomId)}`)
    return (Array.isArray(data.messages) ? data.messages : []).flatMap(mapRemoteMessage)
  }

  async sendChat(text: string, roomId: StudyRoomId = 'library'): Promise<StudyChatMessage> {
    const data = await this.#request<{ message?: unknown }>('/chat', { method: 'POST', body: { roomId, text } })
    const messages = mapRemoteMessage(data.message)
    if (!messages[0]) throw new StudyAdapterError('INVALID_CHAT_RESPONSE')
    return messages[0]
  }

  async #request<T = Record<string, never>>(
    path: string,
    options: { method?: 'GET' | 'POST'; body?: Record<string, unknown>; keepalive?: boolean } = {},
  ): Promise<T> {
    const response = await this.#fetch(`${this.#apiBase}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.#accessToken}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      keepalive: options.keepalive,
    })
    const payload = await response.json() as ApiResponse<T>
    if (!response.ok || payload.success === false || payload.data === undefined) {
      throw new StudyAdapterError('REMOTE_REQUEST_FAILED', payload.message ?? payload.error ?? `HTTP ${response.status}`)
    }
    return payload.data
  }
}

function nonNegativeInteger(value: unknown, fallback = 0) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback
}

function colorForUser(userId: string) {
  let hash = 0
  for (const character of userId) hash = ((hash * 31) + character.charCodeAt(0)) >>> 0
  const palette = [0xd99249, 0x4f91c7, 0x9d6fc0, 0x58a879, 0xc75f78, 0xc2a14d]
  return palette[hash % palette.length]!
}

function mapRemoteMessage(value: unknown): StudyChatMessage[] {
  const row = value as Record<string, unknown> | null
  if (!row || typeof row.id !== 'string' || typeof row.userId !== 'string' || typeof row.displayName !== 'string' || typeof row.text !== 'string') return []
  const parsedTime = typeof row.createdAt === 'number' ? row.createdAt : Date.parse(String(row.createdAt ?? ''))
  return [{
    id: row.id,
    userId: row.userId,
    displayName: row.displayName.slice(0, 80),
    text: row.text.slice(0, 180),
    createdAt: Number.isFinite(parsedTime) ? parsedTime : Date.now(),
  }]
}
