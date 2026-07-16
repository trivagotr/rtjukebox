import {
  StudyAdapterError,
  type StudyAccount,
  type StudyAdapter,
  type StudyChatMessage,
  type StudyHeartbeatInput,
  type StudyPresence,
  type StudyRoomId,
  type StudyRoomInstance,
  type StudySeatReservation,
  type StudySession,
  type StudyTimeSummary,
} from './StudyAdapter'
import { getOrCreateStudyClientSessionId, normalizeStudyClientSessionId } from './StudyClientSession'

const STARTER_WEARABLES = Object.freeze(['short-hair', 'radio-hoodie', 'jeans', 'sneakers', 'bucket-hat'])
const LEGACY_TO_CLIENT_WEARABLE: Readonly<Record<string, string>> = Object.freeze({
  'default-hair': 'short-hair',
  'default-top': 'radio-hoodie',
  'default-bottom': 'jeans',
  'default-shoes': 'sneakers',
})
const CLIENT_TO_LEGACY_WEARABLE: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(Object.entries(LEGACY_TO_CLIENT_WEARABLE).map(([legacy, client]) => [client, legacy])),
)
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
  clientSessionId?: string
}

export class RadioTEDUStudyAdapter implements StudyAdapter {
  readonly authoritativeInventory = true
  readonly #apiBase: string
  readonly #accessToken: string
  readonly #fetch: typeof fetch
  readonly #now: () => number
  readonly #account: StudyAccount
  readonly #clientSessionId: string
  readonly #owned = new Set<string>(STARTER_WEARABLES)
  readonly #equipped = new Set<string>()
  readonly #presence = new Map<StudyRoomId, readonly StudyPresence[]>()
  readonly #instances = new Map<StudyRoomId, StudyRoomInstance>()
  readonly #roomJoins = new Map<StudyRoomId, Promise<StudyRoomInstance>>()
  #globalPoints: number
  #summary: StudyTimeSummary = EMPTY_SUMMARY
  #activeSession: ActiveRemoteSession | null = null
  #activeSeat: StudySeatReservation | null = null
  #activeRoomId: StudyRoomId | null = null

  constructor(config: RadioTEDUStudyAdapterConfig) {
    if (!config.account.authenticated || !config.accessToken.trim()) {
      throw new StudyAdapterError('AUTH_REQUIRED')
    }
    this.#apiBase = config.apiBase.replace(/\/+$/, '')
    this.#accessToken = config.accessToken
    this.#fetch = config.fetchImpl ?? globalThis.fetch.bind(globalThis)
    this.#now = config.now ?? Date.now
    this.#account = Object.freeze({ ...config.account })
    this.#clientSessionId = normalizeStudyClientSessionId(config.clientSessionId)
      ?? getOrCreateStudyClientSessionId(typeof sessionStorage === 'undefined' ? null : sessionStorage, this.#now)
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
      for (const id of profile.ownedItemIds) {
        if (typeof id === 'string') this.#owned.add(clientWearableId(id))
      }
    }
    this.#equipped.clear()
    for (const id of Object.values(profile.equipped ?? {})) {
      if (typeof id === 'string') this.#equipped.add(clientWearableId(id))
    }
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

  roomInstance(roomId: StudyRoomId): StudyRoomInstance | null {
    return this.#instances.get(roomId) ?? null
  }

  async enterRoom(roomId: StudyRoomId, nodeId: string): Promise<void> {
    this.releaseSeat()
    const returningToRoom = this.#activeRoomId !== null && this.#activeRoomId !== roomId
    this.#activeRoomId = roomId
    if (!returningToRoom && this.#instances.has(roomId)) return
    await this.#joinRoom(roomId, nodeId)
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
    await this.#request('/avatar/equip', {
      method: 'POST', body: { itemId: serverWearableId(id), slot },
    })
    this.#equipped.add(id)
    return this.session()
  }

  async purchaseWearable(id: string, idempotencyKey: string): Promise<StudySession> {
    const data = await this.#request<{
      ownedItemIds?: unknown
      points?: { spendable_points?: unknown }
      spendable_points?: unknown
    }>('/avatar/purchase', {
      method: 'POST', body: { itemId: serverWearableId(id), idempotencyKey },
    })
    for (const itemId of Array.isArray(data.ownedItemIds) ? data.ownedItemIds : []) {
      if (typeof itemId === 'string') this.#owned.add(clientWearableId(itemId))
    }
    this.#globalPoints = nonNegativeInteger(
      data.points?.spendable_points ?? data.spendable_points,
      this.#globalPoints,
    )
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
      const data = await this.#request<{
        spendable_points?: unknown
        points?: { spendable_points?: unknown }
      }>(`/sessions/${encodeURIComponent(active.id)}/finish`, {
        method: 'POST', body: { nonce: active.nonce }, keepalive: true,
      })
      this.#globalPoints = nonNegativeInteger(
        data.points?.spendable_points ?? data.spendable_points,
        this.#globalPoints,
      )
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
    const instance = await this.#ensureRoomJoined(roomId)
    const data = await this.#request<{ presence?: unknown }>(
      `/presence?roomId=${encodeURIComponent(roomId)}&instanceId=${encodeURIComponent(instance.id)}`,
    )
    const entries = Array.isArray(data.presence) ? data.presence : []
    const mapped = entries.flatMap((value) => {
      const row = value as Record<string, unknown>
      if (
        typeof row.userId !== 'string' || row.userId === this.#account.id
        || typeof row.displayName !== 'string' || typeof row.nodeId !== 'string'
        || row.instanceId !== instance.id
      ) return []
      const equipped = row.equipped && typeof row.equipped === 'object' ? Object.values(row.equipped) : []
      return [{
        userId: row.userId,
        displayName: row.displayName.slice(0, 80),
        roomId,
        nodeId: row.nodeId,
        seatId: typeof row.seatId === 'string' ? row.seatId : null,
        color: colorForUser(row.userId),
        equippedWearableIds: equipped
          .filter((id): id is string => typeof id === 'string')
          .map(clientWearableId),
      } satisfies StudyPresence]
    })
    this.#presence.set(roomId, mapped)
    this.#publishRoomInstance(Object.freeze({
      ...instance,
      occupancy: Math.min(instance.capacity, mapped.length + 1),
    }))
    return mapped
  }

  async heartbeatPresence(input: Omit<StudyHeartbeatInput, 'interaction' | 'focused' | 'foreground'>): Promise<void> {
    let instance = await this.#ensureRoomJoined(input.roomId, input.nodeId)
    const send = () => this.#request('/presence/heartbeat', {
      method: 'POST' as const,
      body: {
        roomId: input.roomId, instanceId: instance.id, clientSessionId: this.#clientSessionId,
        nodeId: input.nodeId, seatId: input.seatId, position: input.position,
      },
    })
    try {
      await send()
    } catch {
      this.#instances.delete(input.roomId)
      instance = await this.#joinRoom(input.roomId, input.nodeId)
      await send()
    }
  }

  async refreshChat(roomId: StudyRoomId): Promise<readonly StudyChatMessage[]> {
    const instance = await this.#ensureRoomJoined(roomId)
    const data = await this.#request<{ messages?: unknown }>(
      `/chat?roomId=${encodeURIComponent(roomId)}&instanceId=${encodeURIComponent(instance.id)}`,
    )
    return (Array.isArray(data.messages) ? data.messages : []).flatMap(mapRemoteMessage)
  }

  async sendChat(text: string, roomId: StudyRoomId = 'library'): Promise<StudyChatMessage> {
    const instance = await this.#ensureRoomJoined(roomId)
    const data = await this.#request<{ message?: unknown }>('/chat', {
      method: 'POST', body: { roomId, instanceId: instance.id, text },
    })
    const messages = mapRemoteMessage(data.message)
    if (!messages[0]) throw new StudyAdapterError('INVALID_CHAT_RESPONSE')
    return messages[0]
  }

  async #ensureRoomJoined(roomId: StudyRoomId, nodeId = 'spawn'): Promise<StudyRoomInstance> {
    const pending = this.#roomJoins.get(roomId)
    if (pending) return pending
    const instance = this.#instances.get(roomId)
    if (instance && this.#activeRoomId === roomId) return instance
    this.#activeRoomId = roomId
    return this.#joinRoom(roomId, nodeId)
  }

  async #joinRoom(roomId: StudyRoomId, nodeId: string): Promise<StudyRoomInstance> {
    const pending = this.#roomJoins.get(roomId)
    if (pending) return pending
    const preferredInstanceId = this.#instances.get(roomId)?.id ?? null
    const joining = this.#request<{ instance?: unknown }>('/instances/join', {
      method: 'POST',
      body: {
        roomId,
        preferredInstanceId,
        nodeId,
        position: { x: 0, y: 0 },
        clientSessionId: this.#clientSessionId,
      },
    }).then((data) => mapRoomInstance(data.instance, roomId))
    this.#roomJoins.set(roomId, joining)
    try {
      const instance = await joining
      this.#publishRoomInstance(instance)
      return instance
    } catch (error) {
      this.#instances.delete(roomId)
      throw error
    } finally {
      if (this.#roomJoins.get(roomId) === joining) this.#roomJoins.delete(roomId)
    }
  }

  #publishRoomInstance(instance: StudyRoomInstance): void {
    this.#instances.set(instance.roomId, instance)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('radiotedu:study-instance-changed', { detail: { instance } }))
    }
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

function clientWearableId(id: string) {
  return LEGACY_TO_CLIENT_WEARABLE[id] ?? id
}

function serverWearableId(id: string) {
  return CLIENT_TO_LEGACY_WEARABLE[id] ?? id
}

function mapRoomInstance(value: unknown, expectedRoomId: StudyRoomId): StudyRoomInstance {
  const row = value as Record<string, unknown> | null
  const number = nonNegativeInteger(row?.number)
  const occupancy = nonNegativeInteger(row?.occupancy)
  const capacity = nonNegativeInteger(row?.capacity)
  if (
    !row || row.roomId !== expectedRoomId || typeof row.id !== 'string'
    || row.id !== `${expectedRoomId}-${number}` || number < 1 || capacity < 1 || occupancy > capacity
  ) {
    throw new StudyAdapterError('INVALID_ROOM_INSTANCE_RESPONSE')
  }
  return Object.freeze({
    id: row.id,
    roomId: expectedRoomId,
    number,
    occupancy,
    capacity,
    preferredInstanceFull: row.preferredInstanceFull === true,
  })
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
