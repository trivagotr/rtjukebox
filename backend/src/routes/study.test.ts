import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDbQuery,
  mockAwardUserPoints,
  mockSendSuccess,
  mockSendError,
  mockAuthMiddleware,
  mockRouteHandlers,
  mockRouter,
} = vi.hoisted(() => {
  const handlers: Record<string, Record<string, (...args: any[]) => any>> = {
    get: {},
    post: {},
  };

  const router: any = {};
  router.use = vi.fn(() => router);
  router.get = vi.fn((path: string, handler: (...args: any[]) => any) => {
    handlers.get[path] = handler;
    return router;
  });
  router.post = vi.fn((path: string, handler: (...args: any[]) => any) => {
    handlers.post[path] = handler;
    return router;
  });

  return {
    mockDbQuery: vi.fn(),
    mockAwardUserPoints: vi.fn(),
    mockSendSuccess: vi.fn(),
    mockSendError: vi.fn(),
    mockAuthMiddleware: vi.fn(),
    mockRouteHandlers: handlers,
    mockRouter: router,
  };
});

vi.mock('../db', () => ({
  db: {
    query: mockDbQuery,
  },
}));

vi.mock('../middleware/auth', () => ({
  authMiddleware: mockAuthMiddleware,
}));

vi.mock('../utils/response', () => ({
  sendSuccess: mockSendSuccess,
  sendError: mockSendError,
}));

vi.mock('../services/gamification', () => ({
  awardUserPoints: mockAwardUserPoints,
}));

vi.mock('express', () => ({
  default: {
    Router: vi.fn(() => mockRouter),
  },
  Router: vi.fn(() => mockRouter),
}));

import { hashStudyNonce } from './study';

describe('study router', () => {
  beforeEach(() => {
    mockDbQuery.mockReset();
    mockAwardUserPoints.mockReset();
    mockSendSuccess.mockReset();
    mockSendError.mockReset();
  });

  it('requires auth before exposing Study session and avatar endpoints', () => {
    expect(mockRouter.use).toHaveBeenCalledWith(mockAuthMiddleware);
  });

  it('starts one authenticated Çim alan session and closes parallel active sessions', async () => {
    const handler = mockRouteHandlers.post['/sessions/start'];
    expect(handler).toBeTypeOf('function');
    mockDbQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 'session-1', location: 'chim-alan', status: 'active', session_type: 'study', pomodoro_target_minutes: null, started_at: 'now', last_heartbeat_at: 'now' }],
      });

    await handler(
      { body: { location: 'chim-alan', clientSessionId: 'client-1' }, user: { id: 'user-1', role: 'user' } },
      {},
    );

    expect(mockDbQuery.mock.calls[0][0]).toContain('UPDATE study_sessions');
    expect(mockDbQuery.mock.calls[1][0]).toContain('INSERT INTO study_sessions');
    expect(mockDbQuery.mock.calls[1][1][0]).toBe('user-1');
    expect(mockDbQuery.mock.calls[1][1][1]).toBe('chim-alan');
    expect(mockDbQuery.mock.calls[1][1][4]).toBe('study');
    expect(mockDbQuery.mock.calls[1][1][5]).toBeNull();
    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        session: expect.objectContaining({ id: 'session-1', location: 'chim-alan' }),
        nonce: expect.any(String),
      }),
      'Study session started',
      undefined,
      201,
    );
  });

  it('starts a Pomodoro session with server-normalized target minutes', async () => {
    const handler = mockRouteHandlers.post['/sessions/start'];
    mockDbQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'session-1',
          location: 'library',
          status: 'active',
          session_type: 'pomodoro',
          pomodoro_target_minutes: 50,
          started_at: 'now',
          last_heartbeat_at: 'now',
        }],
      });

    await handler(
      {
        body: {
          location: 'library',
          clientSessionId: 'client-pomodoro-1',
          sessionType: 'pomodoro',
          pomodoroTargetMinutes: 50,
        },
        user: { id: 'user-1', role: 'user' },
      },
      {},
    );

    expect(mockDbQuery.mock.calls[1][0]).toContain('session_type, pomodoro_target_minutes');
    expect(mockDbQuery.mock.calls[1][1][4]).toBe('pomodoro');
    expect(mockDbQuery.mock.calls[1][1][5]).toBe(50);
    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        session: expect.objectContaining({
          session_type: 'pomodoro',
          pomodoro_target_minutes: 50,
        }),
      }),
      'Study session started',
      undefined,
      201,
    );
  });

  it('defaults Pomodoro to 25 minutes and clamps custom durations server-side', async () => {
    const handler = mockRouteHandlers.post['/sessions/start'];
    mockDbQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 'session-1', location: 'library', status: 'active', session_type: 'pomodoro', pomodoro_target_minutes: 25 }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 'session-2', location: 'library', status: 'active', session_type: 'pomodoro', pomodoro_target_minutes: 120 }],
      });

    await handler(
      {
        body: { location: 'library', clientSessionId: 'client-pomodoro-2', sessionType: 'pomodoro' },
        user: { id: 'user-1', role: 'user' },
      },
      {},
    );
    await handler(
      {
        body: { location: 'library', clientSessionId: 'client-pomodoro-3', sessionType: 'pomodoro', pomodoroTargetMinutes: 999 },
        user: { id: 'user-1', role: 'user' },
      },
      {},
    );

    expect(mockDbQuery.mock.calls[1][1][5]).toBe(25);
    expect(mockDbQuery.mock.calls[3][1][5]).toBe(120);
  });

  it('rejects guest users before creating sessions', async () => {
    const handler = mockRouteHandlers.post['/sessions/start'];

    await handler(
      { body: { location: 'chim-alan', clientSessionId: 'client-1' }, user: { id: 'guest-1', role: 'guest' } },
      {},
    );

    expect(mockSendError).toHaveBeenCalledWith({}, 'Registered account required', 403);
    expect(mockDbQuery).not.toHaveBeenCalled();
  });

  it('rejects replayed or forged heartbeat nonces', async () => {
    const handler = mockRouteHandlers.post['/sessions/:id/heartbeat'];
    mockDbQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'session-1',
          user_id: 'user-1',
          location: 'chim-alan',
          status: 'active',
          current_nonce_hash: hashStudyNonce('server-nonce'),
          last_heartbeat_at: new Date(Date.now() - 60_000),
          valid_heartbeat_count: 2,
          eligible_seconds: 120,
        },
      ],
    });

    await handler(
      {
        params: { id: 'session-1' },
        body: { nonce: 'attacker-nonce', focused: true, foreground: true, position: { x: 13, y: 18 }, interaction: 'seated' },
        user: { id: 'user-1', role: 'user' },
      },
      {},
    );

    expect(mockSendError).toHaveBeenCalledWith({}, 'Invalid session nonce', 409);
    expect(mockDbQuery).toHaveBeenCalledTimes(1);
  });

  it('rotates heartbeat nonce and stores only server-capped eligible seconds', async () => {
    const handler = mockRouteHandlers.post['/sessions/:id/heartbeat'];
    mockDbQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'session-1',
            user_id: 'user-1',
            location: 'chim-alan',
            status: 'active',
            current_nonce_hash: hashStudyNonce('server-nonce'),
            last_heartbeat_at: new Date(Date.now() - 10 * 60_000),
            valid_heartbeat_count: 2,
            eligible_seconds: 120,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 'session-1', location: 'chim-alan', status: 'active', last_heartbeat_at: 'now' }],
      });

    await handler(
      {
        params: { id: 'session-1' },
        body: { nonce: 'server-nonce', focused: true, foreground: true, position: { x: 13, y: 18 }, interaction: 'seated', seat_id: 'chim-upper-seat-12' },
        user: { id: 'user-1', role: 'user' },
      },
      {},
    );

    expect(mockDbQuery.mock.calls[1][0]).toContain('INSERT INTO study_session_events');
    expect(mockDbQuery.mock.calls[1][0]).toContain('seat_id');
    expect(mockDbQuery.mock.calls[1][1]).toContain('chim-upper-seat-12');
    expect(mockDbQuery.mock.calls[2][1][1]).toBe(300);
    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ nonce: expect.any(String), accepted_seconds: 300 }),
      'Study heartbeat accepted',
    );
  });

  it('finishes once, awards capped global points, and records an idempotent finish', async () => {
    const handler = mockRouteHandlers.post['/sessions/:id/finish'];
    mockDbQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'session-1',
            user_id: 'user-1',
            location: 'chim-alan',
            status: 'active',
            current_nonce_hash: hashStudyNonce('finish-nonce'),
            valid_heartbeat_count: 4,
            eligible_seconds: 25 * 60,
            awarded_points: 0,
            session_type: 'pomodoro',
            pomodoro_target_minutes: 25,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ awarded_today: '6' }] })
      .mockResolvedValueOnce({
        rows: [{ id: 'session-1', location: 'chim-alan', status: 'finished', session_type: 'pomodoro', pomodoro_target_minutes: 25, awarded_points: 19 }],
      });
    mockAwardUserPoints.mockResolvedValueOnce({ awarded: 19 });

    await handler(
      { params: { id: 'session-1' }, body: { nonce: 'finish-nonce' }, user: { id: 'user-1', role: 'user' } },
      {},
    );

    expect(mockAwardUserPoints).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      amount: 19,
      sourceType: 'pomodoro_session',
      sourceId: 'session-1',
      metadata: expect.objectContaining({
        session_type: 'pomodoro',
        pomodoro_target_minutes: 25,
        eligible_seconds: 25 * 60,
        valid_heartbeat_count: 4,
      }),
    }));
    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ awarded_points: 19 }),
      'Study session finished',
    );
  });

  it('counts both Study and Pomodoro awards against the same daily cap', async () => {
    const handler = mockRouteHandlers.post['/sessions/:id/finish'];
    mockDbQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'session-1',
            user_id: 'user-1',
            location: 'library',
            status: 'active',
            current_nonce_hash: hashStudyNonce('finish-nonce'),
            valid_heartbeat_count: 4,
            eligible_seconds: 25 * 60,
            awarded_points: 0,
            session_type: 'pomodoro',
            pomodoro_target_minutes: 25,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ awarded_today: '24' }] })
      .mockResolvedValueOnce({
        rows: [{ id: 'session-1', location: 'library', status: 'finished', session_type: 'pomodoro', pomodoro_target_minutes: 25, awarded_points: 1 }],
      });

    await handler(
      { params: { id: 'session-1' }, body: { nonce: 'finish-nonce' }, user: { id: 'user-1', role: 'user' } },
      {},
    );

    expect(mockDbQuery.mock.calls[1][0]).toContain("source_type IN ('study_session', 'pomodoro_session')");
    expect(mockAwardUserPoints).toHaveBeenCalledWith(expect.objectContaining({
      amount: 1,
      sourceType: 'pomodoro_session',
    }));
  });

  it('rejects avatar purchases that would make spendable points negative', async () => {
    const handler = mockRouteHandlers.post['/avatar/purchase'];
    expect(handler).toBeTypeOf('function');
    mockDbQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ item_id: 'spark-hoodie', cost_points: 80, is_default: false }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ spendable_points: 20 }] })
      .mockResolvedValueOnce({ rows: [] });

    await handler(
      { body: { itemId: 'spark-hoodie' }, user: { id: 'user-1', role: 'user' } },
      {},
    );

    expect(mockDbQuery.mock.calls[0][0]).toBe('BEGIN');
    expect(mockSendError).toHaveBeenCalledWith({}, 'Not enough points', 400);
    expect(mockDbQuery.mock.calls.some(call => call[0] === 'ROLLBACK')).toBe(true);
    expect(mockDbQuery.mock.calls.some(call => String(call[0]).includes('UPDATE user_points'))).toBe(false);
  });

  it('purchases avatar clothes by spending global points in one transaction', async () => {
    const handler = mockRouteHandlers.post['/avatar/purchase'];
    mockDbQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ item_id: 'spark-hoodie', cost_points: 80, is_default: false }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ spendable_points: 120 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await handler(
      { body: { itemId: 'spark-hoodie' }, user: { id: 'user-1', role: 'user' } },
      {},
    );

    expect(mockDbQuery.mock.calls[0][0]).toBe('BEGIN');
    expect(mockDbQuery.mock.calls.some(call => String(call[0]).includes('INSERT INTO avatar_inventory'))).toBe(true);
    expect(mockDbQuery.mock.calls.some(call => String(call[0]).includes('UPDATE user_points'))).toBe(true);
    expect(mockDbQuery.mock.calls.some(call => call[0] === 'COMMIT')).toBe(true);
    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      {
        ownedItemIds: ['spark-hoodie'],
        points: expect.objectContaining({
          spendable_points: 40,
        }),
      },
      'Avatar item purchased',
      undefined,
      201,
    );
  });

  it('does not spend points again when purchasing an already owned avatar item', async () => {
    const handler = mockRouteHandlers.post['/avatar/purchase'];
    mockDbQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ item_id: 'spark-hoodie', cost_points: 80, is_default: false }] })
      .mockResolvedValueOnce({ rows: [{ item_id: 'spark-hoodie' }] })
      .mockResolvedValueOnce({ rows: [] });

    await handler(
      { body: { itemId: 'spark-hoodie' }, user: { id: 'user-1', role: 'user' } },
      {},
    );

    expect(mockDbQuery.mock.calls[0][0]).toBe('BEGIN');
    expect(mockDbQuery.mock.calls.some(call => String(call[0]).includes('UPDATE user_points'))).toBe(false);
    expect(mockDbQuery.mock.calls.some(call => call[0] === 'COMMIT')).toBe(true);
    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      { ownedItemIds: ['spark-hoodie'] },
      'Avatar item already owned',
    );
  });

  it('rejects equipping paid avatar clothes the user does not own', async () => {
    const handler = mockRouteHandlers.post['/avatar/equip'];
    expect(handler).toBeTypeOf('function');
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    await handler(
      { body: { slot: 'top', itemId: 'spark-hoodie' }, user: { id: 'user-1', role: 'user' } },
      {},
    );

    expect(mockSendError).toHaveBeenCalledWith({}, 'Avatar item is not owned', 403);
    expect(mockDbQuery).toHaveBeenCalledTimes(1);
  });
});
