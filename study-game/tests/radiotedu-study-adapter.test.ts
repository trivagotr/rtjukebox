import { describe, expect, it, vi } from 'vitest'

import { RadioTEDUStudyAdapter } from '../src/adapters/RadioTEDUStudyAdapter'

function success<T>(data: T, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ success: true, data }),
  }
}

function createAdapter(fetchImpl: ReturnType<typeof vi.fn>) {
  return new RadioTEDUStudyAdapter({
    apiBase: 'https://radiotedu.com/jukebox/api/v1/study',
    accessToken: 'access-token',
    account: { id: 'user-1', displayName: 'Ada', authenticated: true },
    globalPoints: 120,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  })
}

describe('RadioTEDUStudyAdapter', () => {
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
      .mockResolvedValueOnce(success({ session: { id: 'session-1' }, awarded_points: 3 }))
      .mockResolvedValueOnce(success({ todaySeconds: 600, monthSeconds: 3600, totalSeconds: 7200 }))
    const adapter = createAdapter(fetchImpl)

    await adapter.startStudySession('chim-alan', 'client-session-2')
    const summary = await adapter.finishStudySession()
    const secondFinish = await adapter.finishStudySession()

    expect(summary).toEqual({ todaySeconds: 600, monthSeconds: 3600, totalSeconds: 7200 })
    expect(secondFinish).toEqual(summary)
    expect(fetchImpl.mock.calls.filter(call => String(call[0]).includes('/finish'))).toHaveLength(1)
    const finishCall = fetchImpl.mock.calls.find(call => String(call[0]).includes('/finish'))
    expect(finishCall?.[1]).toMatchObject({ keepalive: true })
  })

  it('maps room presence and server chat without accepting anonymous fallback', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(success({
        presence: [{
          userId: 'user-2', displayName: 'Selin', roomId: 'library', nodeId: 'quiet-window',
          position: { x: 2, y: 3 }, seatId: 'quiet-window', equipped: { hat: 'beanie' },
        }],
      }))
      .mockResolvedValueOnce(success({
        message: { id: 'message-1', userId: 'user-1', displayName: 'Ada', roomId: 'library', text: 'Hello', createdAt: 'now' },
      }, 201))
    const adapter = createAdapter(fetchImpl)

    const presence = await adapter.refreshPresence('library')
    const message = await adapter.sendChat('Hello', 'library')

    expect(presence[0]).toMatchObject({ userId: 'user-2', seatId: 'quiet-window', equippedWearableIds: ['beanie'] })
    expect(message).toMatchObject({ id: 'message-1', text: 'Hello' })
    expect(fetchImpl.mock.calls[1]![1].headers.Authorization).toBe('Bearer access-token')
  })
})
