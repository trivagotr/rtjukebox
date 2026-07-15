import { describe, expect, it, vi } from 'vitest'

import { RadioTEDUStudyAdapter } from '../src/adapters/RadioTEDUStudyAdapter'

function success<T>(data: T, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ success: true, data }),
  }
}

function failure(status: number, message: string) {
  return {
    ok: false,
    status,
    json: async () => ({ success: false, message }),
  }
}

function createAdapter(fetchImpl: ReturnType<typeof vi.fn>, globalPoints = 120) {
  return new RadioTEDUStudyAdapter({
    apiBase: 'https://radiotedu.com/jukebox/api/v1/study',
    accessToken: 'access-token',
    account: { id: 'user-1', displayName: 'Ada', authenticated: true },
    globalPoints,
    clientSessionId: 'webview-session-1',
    fetchImpl: fetchImpl as unknown as typeof fetch,
  })
}

describe('RadioTEDUStudyAdapter', () => {
  it('replaces the displayed Gold balance with the authoritative avatar purchase response', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(success({
      ownedItemIds: ['varsity-jacket'],
      points: {spendable_points: 65},
      spendable_points: 65,
    }, 201))
    const adapter = createAdapter(fetchImpl, 100)

    expect(adapter.session().points.global).toBe(100)
    await adapter.purchaseWearable('varsity-jacket', 'avatar-request-1')

    expect(adapter.session().points.global).toBe(65)
    expect(JSON.parse(fetchImpl.mock.calls[0]![1].body)).toEqual({
      itemId: 'varsity-jacket',
      idempotencyKey: 'avatar-request-1',
    })
  })

  it('uses Bearer auth and rotates the server heartbeat nonce', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(success({ session: { id: 'session-1' }, nonce: 'nonce-1' }, 201))
      .mockResolvedValueOnce(success({ session: { id: 'session-1' }, nonce: 'nonce-2', accepted_seconds: 10 }))
    const adapter = createAdapter(fetchImpl)

    await adapter.startStudySession('library', 'client-session-1')
    const accepted = await adapter.heartbeatStudySession({
      roomId: 'library', nodeId: 'front-left', seatId: 'front-left', position: { x: 4, y: 8 },
      interaction: 'seated', focused: true, foreground: true,
    })

    expect(accepted).toBe(10)
    expect(fetchImpl.mock.calls[0]![0]).toBe('https://radiotedu.com/jukebox/api/v1/study/sessions/start')
    expect(fetchImpl.mock.calls[0]![1].headers.Authorization).toBe('Bearer access-token')
    expect(JSON.parse(fetchImpl.mock.calls[1]![1].body)).toMatchObject({ nonce: 'nonce-1', seatId: 'front-left' })
  })

  it('finishes idempotently and refreshes the authoritative summary', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(success({ session: { id: 'session-1' }, nonce: 'nonce-1' }, 201))
      .mockResolvedValueOnce(success({ session: { id: 'session-1' }, awarded_points: 3, spendable_points: 123 }))
      .mockResolvedValueOnce(success({ todaySeconds: 600, monthSeconds: 3600, totalSeconds: 7200 }))
    const adapter = createAdapter(fetchImpl)

    await adapter.startStudySession('chim-alan', 'client-session-2')
    const summary = await adapter.finishStudySession()
    const secondFinish = await adapter.finishStudySession()

    expect(summary).toEqual({ todaySeconds: 600, monthSeconds: 3600, totalSeconds: 7200 })
    expect(secondFinish).toEqual(summary)
    expect(adapter.session().points.global).toBe(123)
    expect(fetchImpl.mock.calls.filter(call => String(call[0]).includes('/finish'))).toHaveLength(1)
    const finishCall = fetchImpl.mock.calls.find(call => String(call[0]).includes('/finish'))
    expect(finishCall?.[1]).toMatchObject({ keepalive: true })
  })

  it('maps room presence and server chat without accepting anonymous fallback', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(success({
        instance: {
          id: 'library-2', roomId: 'library', number: 2,
          occupancy: 3, capacity: 51, preferredInstanceFull: false,
        },
      }))
      .mockResolvedValueOnce(success({
        presence: [{
          userId: 'user-2', displayName: 'Selin', roomId: 'library', instanceId: 'library-2', nodeId: 'quiet-window',
          position: { x: 2, y: 3 }, seatId: 'quiet-window', equipped: { hat: 'beanie' },
        }],
      }))
      .mockResolvedValueOnce(success({
        message: { id: 'message-1', userId: 'user-1', displayName: 'Ada', roomId: 'library', instanceId: 'library-2', text: 'Hello', createdAt: 'now' },
      }, 201))
    const adapter = createAdapter(fetchImpl)

    await adapter.enterRoom('library', 'bottom-center-aisle')
    const presence = await adapter.refreshPresence('library')
    const message = await adapter.sendChat('Hello', 'library')

    expect(presence[0]).toMatchObject({ userId: 'user-2', seatId: 'quiet-window', equippedWearableIds: ['beanie'] })
    expect(message).toMatchObject({ id: 'message-1', text: 'Hello' })
    expect(adapter.roomInstance?.('library')).toMatchObject({ id: 'library-2', number: 2, occupancy: 2, capacity: 51 })
    expect(fetchImpl.mock.calls[0]![0]).toContain('/instances/join')
    expect(JSON.parse(fetchImpl.mock.calls[0]![1].body)).toMatchObject({
      roomId: 'library', nodeId: 'bottom-center-aisle', clientSessionId: 'webview-session-1',
    })
    expect(fetchImpl.mock.calls[1]![0]).toContain('/presence?roomId=library&instanceId=library-2')
    expect(JSON.parse(fetchImpl.mock.calls[2]![1].body)).toMatchObject({ instanceId: 'library-2' })
    expect(fetchImpl.mock.calls[2]![1].headers.Authorization).toBe('Bearer access-token')
  })

  it('waits for one in-flight room join before sending presence heartbeat', async () => {
    let resolveJoin!: (value: ReturnType<typeof success>) => void
    const joinResponse = new Promise<ReturnType<typeof success>>((resolve) => { resolveJoin = resolve })
    const fetchImpl = vi.fn()
      .mockReturnValueOnce(joinResponse)
      .mockResolvedValueOnce(success({ presence: {} }))
    const adapter = createAdapter(fetchImpl)

    const joining = adapter.enterRoom('chim-alan', 'entrance')
    const heartbeat = adapter.heartbeatPresence?.({
      roomId: 'chim-alan', nodeId: 'entrance', seatId: null, position: { x: 50, y: 90 },
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    resolveJoin(success({
      instance: {
        id: 'chim-alan-1', roomId: 'chim-alan', number: 1,
        occupancy: 1, capacity: 9, preferredInstanceFull: false,
      },
    }))
    await Promise.all([joining, heartbeat])

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchImpl.mock.calls[1]![1].body)).toMatchObject({
      roomId: 'chim-alan', instanceId: 'chim-alan-1', clientSessionId: 'webview-session-1',
    })
  })

  it('rejoins once when a stale presence assignment is rejected', async () => {
    const assigned = {
      instance: {
        id: 'library-1', roomId: 'library', number: 1,
        occupancy: 4, capacity: 51, preferredInstanceFull: false,
      },
    }
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(success(assigned))
      .mockResolvedValueOnce(failure(409, 'Study room instance rejoin required'))
      .mockResolvedValueOnce(success(assigned))
      .mockResolvedValueOnce(success({ presence: {} }))
    const adapter = createAdapter(fetchImpl)

    await adapter.enterRoom('library', 'bottom-center-aisle')
    await adapter.heartbeatPresence?.({
      roomId: 'library', nodeId: 'front-left', seatId: null, position: { x: 4, y: 8 },
    })

    expect(fetchImpl.mock.calls.filter((call) => String(call[0]).includes('/instances/join'))).toHaveLength(2)
    expect(fetchImpl).toHaveBeenCalledTimes(4)
  })
})
