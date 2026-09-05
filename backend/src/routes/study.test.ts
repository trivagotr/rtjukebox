import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDbQuery,
  mockClientQuery,
  mockClientRelease,
  mockPoolConnect,
  mockAwardUserPoints,
  mockSpendUserPoints,
  mockSendSuccess,
  mockSendError,
  mockAuthMiddleware,
  mockWebAuthMiddleware,
  mockWebCsrf,
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
  router.post = vi.fn((path: string, ...routeHandlers: Array<(...args: any[]) => any>) => {
    handlers.post[path] = routeHandlers[routeHandlers.length - 1]!;
    return router;
  });

  const clientQuery = vi.fn();
  const clientRelease = vi.fn();

  return {
    mockDbQuery: vi.fn(),
    mockClientQuery: clientQuery,
    mockClientRelease: clientRelease,
    mockPoolConnect: vi.fn().mockResolvedValue({query: clientQuery, release: clientRelease}),
    mockAwardUserPoints: vi.fn(),
    mockSpendUserPoints: vi.fn(),
    mockSendSuccess: vi.fn(),
    mockSendError: vi.fn(),
    mockAuthMiddleware: vi.fn(),
    mockWebAuthMiddleware: vi.fn(),
    mockWebCsrf: vi.fn(),
    mockRouteHandlers: handlers,
    mockRouter: router,
  };
});

vi.mock('../db', () => ({
  db: {
    pool: {connect: mockPoolConnect},
    query: mockDbQuery,
  },
}));

vi.mock('../middleware/auth', () => ({
  authMiddleware: mockAuthMiddleware,
}));

vi.mock('../services/webSession', () => ({
  webAuthMiddleware: mockWebAuthMiddleware,
  requireWebCsrf: mockWebCsrf,
}));

vi.mock('../utils/response', () => ({
  sendSuccess: mockSendSuccess,
  sendError: mockSendError,
}));

vi.mock('../services/gamification', () => ({
  awardUserPoints: mockAwardUserPoints,
  spendUserPoints: mockSpendUserPoints,
}));

vi.mock('../services/economy', () => ({
  getEconomyRule: vi.fn().mockResolvedValue({
    ruleKey: 'study_minute',
    direction: 'earn',
    amount: 1,
    dailyCap: 25,
    category: 'social',
    enabled: true,
    description: 'Verified Study minute',
    version: 1,
  }),
}));

vi.mock('express', () => ({
  default: {
    Router: vi.fn(() => mockRouter),
  },
  Router: vi.fn(() => mockRouter),
}));

import { handleStudyHealth, handleStudyHome, handleStudyPlayerReport, hashStudyNonce, invalidateStudyPresenceCache, invalidateStudyChatCache, handleUpdateUsername, pruneExpiredStudyChatMessages } from './study';

function createHealthResponse() {
  const response: any = {
    set: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  return response;
}

function queueStudySessionStart(row: Record<string, unknown>, userId = 'user-1') {
  mockClientQuery
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce({ rows: [{ id: userId }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [row], rowCount: 1 })
    .mockResolvedValueOnce(undefined);
}

describe('study router', () => {
  beforeEach(() => {
    mockDbQuery.mockReset();
    mockClientQuery.mockReset();
    mockClientRelease.mockReset();
    mockPoolConnect.mockClear();
    mockAwardUserPoints.mockReset();
    mockAwardUserPoints.mockResolvedValue({
      applied: true,
      amount: 1,
      awarded: 1,
      spendablePoints: 1,
      ledgerId: 'ledger-study',
    });
    mockSpendUserPoints.mockReset();
    mockSpendUserPoints.mockResolvedValue({
      applied: true,
      amount: -80,
      awarded: 0,
      spendablePoints: 40,
      ledgerId: 'ledger-avatar',
    });
    mockSendSuccess.mockReset();
    mockSendError.mockReset();
  });

  it('requires auth before exposing Study session and avatar endpoints', () => {
    expect(mockRouter.use).toHaveBeenCalledWith(mockWebAuthMiddleware);
    expect(mockRouter.use).toHaveBeenCalledWith(mockWebCsrf);
  });

  it('reports readiness only when the database and all player Study tables are available', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [{
        study_sessions: true,
        study_room_presence: true,
        study_world_chat_messages: true,
        study_player_reports: true,
        avatar_items: true,
        avatar_inventory: true,
        avatar_equipment: true,
        user_points: true,
      }],
    });
    const response = createHealthResponse();

    await handleStudyHealth({} as any, response);

    expect(response.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      status: 'ok', service: 'study', database: 'ok', schema: 'ready',
    }));
  });

  it('fails Study readiness closed when its database check fails', async () => {
    mockDbQuery.mockRejectedValueOnce(new Error('database unavailable'));
    const response = createHealthResponse();

    await handleStudyHealth({} as any, response);

    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      status: 'unavailable', service: 'study', database: 'unavailable',
    }));
  });

  it('returns all five Study rooms and server-ranked home leaderboards', async () => {
    const currentUserId = '11111111-1111-4111-8111-111111111111';
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ today_seconds: '60', month_seconds: '120', total_seconds: '300' }] })
      .mockResolvedValueOnce({ rows: [{ room_id: 'library', occupancy: '4', instance_count: '1' }] })
      .mockResolvedValueOnce({ rows: [{
        user_id: currentUserId, display_name: 'Study user',
        week_seconds: '60', month_seconds: '120', all_seconds: '300', streak_days: '2',
      }] });

    await handleStudyHome({ user: { id: currentUserId, role: 'user' } } as any, {} as any);

    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        rooms: expect.arrayContaining([
          expect.objectContaining({ roomId: 'library', occupancy: 4, capacity: 60 }),
          expect.objectContaining({ roomId: 'chim-alan', capacity: 60 }),
          expect.objectContaining({ roomId: 'grass-amphitheatre', capacity: 60 }),
          expect.objectContaining({ roomId: 'sports-center', capacity: 60 }),
          expect.objectContaining({ roomId: 'auditorium', capacity: 60 }),
          expect.objectContaining({ roomId: 'learning-lab', capacity: 60 }),
        ]),
        leaderboard: expect.objectContaining({
          week: expect.arrayContaining([expect.objectContaining({ userId: currentUserId, rank: 1 })]),
        }),
      }),
      'Study home fetched',
    );
  });

  it('requires both players to be live in the same room instance before accepting a report', async () => {
    const reporterId = '11111111-1111-4111-8111-111111111111';
    const targetId = '22222222-2222-4222-8222-222222222222';
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'report-1', created_at: 'now', status: 'open' }] });

    await handleStudyPlayerReport({
      user: { id: reporterId, role: 'user' },
      body: {
        targetUserId: targetId,
        roomId: 'sports-center',
        instanceId: 'sports-center-1',
        reason: 'spam',
        idempotencyKey: 'report-1',
      },
    } as any, {} as any);

    expect(mockDbQuery.mock.calls[0][0]).toContain('study_room_presence');
    expect(mockDbQuery.mock.calls[1][0]).toContain('study_player_reports');
    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      { report: { id: 'report-1', created_at: 'now', status: 'open' } },
      'Social report received',
      undefined,
      201,
    );
  });

  it('rejects reuse of a report request key with different report details', async () => {
    const reporterId = '11111111-1111-4111-8111-111111111111';
    const targetId = '22222222-2222-4222-8222-222222222222';
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })
      .mockResolvedValueOnce({ rows: [] });

    await handleStudyPlayerReport({
      user: { id: reporterId, role: 'user' },
      body: {
        targetUserId: targetId,
        roomId: 'library',
        instanceId: 'library-1',
        reason: 'harassment',
        idempotencyKey: 'reused-report-key',
      },
    } as any, {} as any);

    expect(mockDbQuery.mock.calls[1][0]).toContain('study_player_reports.target_user_id = EXCLUDED.target_user_id');
    expect(mockSendSuccess).not.toHaveBeenCalled();
    expect(mockSendError).toHaveBeenCalledWith(
      {},
      'That report request key was already used for different report details.',
      409,
      'STUDY_REPORT_IDEMPOTENCY_CONFLICT',
    );
  });

  it('registers a dedicated abuse limiter before the report handler', () => {
    const registration = mockRouter.post.mock.calls.find((call: any[]) => call[0] === '/moderation/reports');
    expect(registration).toHaveLength(3);
    expect(registration?.[2]).toBe(handleStudyPlayerReport);
  });

  it('serializes Study starts on one pinned transaction and per-user row lock', async () => {
    const handler = mockRouteHandlers.post['/sessions/start'];
    expect(handler).toBeTypeOf('function');
    queueStudySessionStart({
      id: 'session-1',
      location: 'chim-alan',
      status: 'active',
      session_type: 'study',
      pomodoro_target_minutes: null,
      started_at: 'now',
      last_heartbeat_at: 'now',
    });

    await handler(
      { body: { location: 'chim-alan', clientSessionId: 'client-1' }, user: { id: 'user-1', role: 'user' } },
      {},
    );

    expect(mockPoolConnect).toHaveBeenCalledOnce();
    expect(mockDbQuery).not.toHaveBeenCalled();
    expect(mockClientQuery.mock.calls[0][0]).toBe('BEGIN');
    expect(mockClientQuery.mock.calls[1]).toEqual([
      'SELECT id FROM users WHERE id = $1 FOR UPDATE',
      ['user-1'],
    ]);
    expect(mockClientQuery.mock.calls[2][0]).toContain('UPDATE study_sessions');
    expect(mockClientQuery.mock.calls[3][0]).toContain('INSERT INTO study_sessions');
    expect(mockClientQuery.mock.calls[3][1][0]).toBe('user-1');
    expect(mockClientQuery.mock.calls[3][1][1]).toBe('chim-alan');
    expect(mockClientQuery.mock.calls[3][1][4]).toBe('study');
    expect(mockClientQuery.mock.calls[3][1][5]).toBeNull();
    expect(mockClientQuery.mock.calls[4][0]).toBe('COMMIT');
    expect(mockClientRelease).toHaveBeenCalledOnce();
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
    queueStudySessionStart({
      id: 'session-1',
      location: 'library',
      status: 'active',
      session_type: 'pomodoro',
      pomodoro_target_minutes: 50,
      started_at: 'now',
      last_heartbeat_at: 'now',
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

    expect(mockClientQuery.mock.calls[3][0]).toContain('session_type, pomodoro_target_minutes');
    expect(mockClientQuery.mock.calls[3][1][4]).toBe('pomodoro');
    expect(mockClientQuery.mock.calls[3][1][5]).toBe(50);
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
    queueStudySessionStart({
      id: 'session-1',
      location: 'library',
      status: 'active',
      session_type: 'pomodoro',
      pomodoro_target_minutes: 25,
    });
    queueStudySessionStart({
      id: 'session-2',
      location: 'library',
      status: 'active',
      session_type: 'pomodoro',
      pomodoro_target_minutes: 120,
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

    expect(mockClientQuery.mock.calls[3][1][5]).toBe(25);
    expect(mockClientQuery.mock.calls[8][1][5]).toBe(120);
  });

  it('rejects guest users before creating sessions', async () => {
    const handler = mockRouteHandlers.post['/sessions/start'];

    await handler(
      { body: { location: 'chim-alan', clientSessionId: 'client-1' }, user: { id: 'guest-1', role: 'guest' } },
      {},
    );

    expect(mockSendError).toHaveBeenCalledWith({}, 'Registered account required', 403);
    expect(mockDbQuery).not.toHaveBeenCalled();
    expect(mockPoolConnect).not.toHaveBeenCalled();
  });

  it('rejects replayed or forged heartbeat nonces', async () => {
    const handler = mockRouteHandlers.post['/sessions/:id/heartbeat'];
    mockClientQuery
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'session-1',
            user_id: 'user-1',
            location: 'grass-amphitheatre',
            status: 'active',
            current_nonce_hash: hashStudyNonce('server-nonce'),
            last_heartbeat_at: new Date(Date.now() - 60_000),
            valid_heartbeat_count: 2,
            eligible_seconds: 120,
          },
        ],
      })
      .mockResolvedValueOnce(undefined);

    await handler(
      {
        params: { id: 'session-1' },
        body: { nonce: 'attacker-nonce', focused: true, foreground: true, position: { x: 13, y: 18 }, interaction: 'seated' },
        user: { id: 'user-1', role: 'user' },
      },
      {},
    );

    expect(mockSendError).toHaveBeenCalledWith({}, 'Invalid session nonce', 409);
    expect(mockClientQuery.mock.calls[1][0]).toContain('FOR UPDATE');
    expect(mockClientQuery.mock.calls[2][0]).toBe('ROLLBACK');
    expect(mockClientRelease).toHaveBeenCalledOnce();
  });

  it('rotates heartbeat nonce and awards zero seconds after a heartbeat break', async () => {
    const handler = mockRouteHandlers.post['/sessions/:id/heartbeat'];
    mockClientQuery
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'session-1',
            user_id: 'user-1',
            location: 'grass-amphitheatre',
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
        rows: [{ id: 'session-1', location: 'grass-amphitheatre', status: 'active', last_heartbeat_at: 'now' }],
      })
      .mockResolvedValueOnce(undefined);

    await handler(
      {
        params: { id: 'session-1' },
        body: { nonce: 'server-nonce', focused: true, foreground: true, position: { x: 13, y: 18 }, interaction: 'seated', seat_id: 'amfi-b2' },
        user: { id: 'user-1', role: 'user' },
      },
      {},
    );

    expect(mockClientQuery.mock.calls[2][0]).toContain('INSERT INTO study_session_events');
    expect(mockClientQuery.mock.calls[2][0]).toContain('seat_id');
    expect(mockClientQuery.mock.calls[2][1]).toContain('amfi-b2');
    expect(mockClientQuery.mock.calls[3][1][1]).toBe(0);
    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ nonce: expect.any(String), accepted_seconds: 0 }),
      'Study heartbeat accepted',
    );
  });

  it('uses the first eligible heartbeat only as a server timing anchor', async () => {
    const handler = mockRouteHandlers.post['/sessions/:id/heartbeat'];
    mockClientQuery
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [{
          id: 'session-1', user_id: 'user-1', location: 'library', status: 'active',
          current_nonce_hash: hashStudyNonce('first-nonce'),
          last_heartbeat_at: new Date(Date.now() - 60_000),
          valid_heartbeat_count: 0, eligible_seconds: 0,
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 'session-1', location: 'library', status: 'active', last_heartbeat_at: 'now' }],
      })
      .mockResolvedValueOnce(undefined);

    await handler(
      {
        params: { id: 'session-1' },
        body: {
          nonce: 'first-nonce', focused: true, foreground: true,
          position: { x: 5, y: 6 }, interaction: 'seated', seat_id: 'front-left',
        },
        user: { id: 'user-1', role: 'user' },
      },
      {},
    );

    expect(mockClientQuery.mock.calls[3][1][1]).toBe(0);
    expect(mockClientQuery.mock.calls[3][1][2]).toBe(true);
    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ accepted_seconds: 0 }),
      'Study heartbeat accepted',
    );
  });

  it('finishes once, awards capped global points, and records an idempotent finish', async () => {
    const handler = mockRouteHandlers.post['/sessions/:id/finish'];
    mockClientQuery
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [{ id: 'user-1' }] })
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
      })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [{ id: 'user-1' }] })
      .mockResolvedValueOnce({
        rows: [{ id: 'session-1', location: 'chim-alan', status: 'finished', session_type: 'pomodoro', pomodoro_target_minutes: 25, awarded_points: 19 }],
      })
      .mockResolvedValueOnce({
        rows: [{ spendable_points: 119 }],
      })
      .mockResolvedValueOnce(undefined);
    mockAwardUserPoints.mockResolvedValueOnce({
      applied: true,
      awarded: 19,
      spendablePoints: 119,
    });

    await handler(
      { params: { id: 'session-1' }, body: { nonce: 'finish-nonce' }, user: { id: 'user-1', role: 'user' } },
      {},
    );
    await handler(
      { params: { id: 'session-1' }, body: { nonce: 'finish-nonce' }, user: { id: 'user-1', role: 'user' } },
      {},
    );

    expect(mockAwardUserPoints).toHaveBeenCalledOnce();
    expect(mockAwardUserPoints).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        amount: 19,
        sourceType: 'economy:study_minute',
        sourceId: 'session-1',
        idempotencyKey: 'study:finish:session-1',
        metadata: expect.objectContaining({
          session_type: 'pomodoro',
          pomodoro_target_minutes: 25,
          eligible_seconds: 25 * 60,
          valid_heartbeat_count: 4,
        }),
      }),
      expect.objectContaining({ query: mockClientQuery }),
    );
    expect(mockClientQuery.mock.calls[1][0]).toContain('users');
    expect(mockClientQuery.mock.calls[2][0]).toContain('FOR UPDATE');
    expect(mockSendSuccess).toHaveBeenNthCalledWith(
      1,
      {},
      expect.objectContaining({ awarded_points: 19, spendable_points: 119 }),
      'Study session finished',
    );
    expect(mockSendSuccess).toHaveBeenNthCalledWith(
      2,
      {},
      expect.objectContaining({ awarded_points: 19, spendable_points: 119 }),
      'Study session already finished',
    );
  });

  it('counts both Study and Pomodoro awards against the same daily cap', async () => {
    const handler = mockRouteHandlers.post['/sessions/:id/finish'];
    mockClientQuery
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [{ id: 'user-1' }] })
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
      })
      .mockResolvedValueOnce(undefined);

    await handler(
      { params: { id: 'session-1' }, body: { nonce: 'finish-nonce' }, user: { id: 'user-1', role: 'user' } },
      {},
    );

    expect(mockClientQuery.mock.calls[3][0]).toContain("source_type = 'economy:study_minute'");
    expect(mockAwardUserPoints).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 1, sourceType: 'economy:study_minute' }),
      expect.objectContaining({ query: mockClientQuery }),
    );
  });

  it('rejects avatar purchases that would make spendable points negative', async () => {
    const handler = mockRouteHandlers.post['/avatar/purchase'];
    expect(handler).toBeTypeOf('function');
    mockClientQuery
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [{ item_id: 'spark-hoodie', cost_points: 80, is_default: false }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce(undefined);
    mockSpendUserPoints.mockRejectedValueOnce(new Error('INSUFFICIENT_GOLD'));

    await handler(
      { body: { itemId: 'spark-hoodie', idempotencyKey: 'avatar-purchase-1' }, user: { id: 'user-1', role: 'user' } },
      {},
    );

    expect(mockClientQuery.mock.calls[0][0]).toBe('BEGIN');
    expect(mockSendError).toHaveBeenCalledWith({}, 'Not enough points', 400);
    expect(mockClientQuery.mock.calls.some(call => call[0] === 'ROLLBACK')).toBe(true);
    expect(mockClientQuery.mock.calls.some(call => String(call[0]).includes('INSERT INTO avatar_inventory'))).toBe(false);
  });

  it('purchases avatar clothes by spending global points in one transaction', async () => {
    const handler = mockRouteHandlers.post['/avatar/purchase'];
    mockClientQuery
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [{ item_id: 'spark-hoodie', cost_points: 80, is_default: false }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ item_id: 'spark-hoodie' }] })
      .mockResolvedValueOnce(undefined);

    await handler(
      { body: { itemId: 'spark-hoodie', idempotencyKey: 'avatar-purchase-1' }, user: { id: 'user-1', role: 'user' } },
      {},
    );

    expect(mockClientQuery.mock.calls[0][0]).toBe('BEGIN');
    expect(mockSpendUserPoints).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        amount: 80,
        idempotencyKey: 'avatar-purchase-1',
        sourceType: 'avatar_purchase',
        sourceId: 'spark-hoodie',
      }),
      expect.objectContaining({query: mockClientQuery}),
    );
    expect(mockClientQuery.mock.calls.some(call => String(call[0]).includes('INSERT INTO avatar_inventory'))).toBe(true);
    expect(mockClientQuery.mock.calls.some(call => call[0] === 'COMMIT')).toBe(true);
    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      {
        ownedItemIds: ['spark-hoodie'],
        points: expect.objectContaining({
          spendable_points: 40,
        }),
        spendable_points: 40,
        replayed: false,
      },
      'Avatar item purchased',
      undefined,
      201,
    );
  });

  it('does not spend points again when purchasing an already owned avatar item', async () => {
    const handler = mockRouteHandlers.post['/avatar/purchase'];
    mockClientQuery
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [{ item_id: 'spark-hoodie', cost_points: 80, is_default: false }] })
      .mockResolvedValueOnce({ rows: [{ item_id: 'spark-hoodie' }] })
      .mockResolvedValueOnce({ rows: [{ spendable_points: 40 }] })
      .mockResolvedValueOnce(undefined);

    await handler(
      { body: { itemId: 'spark-hoodie', idempotencyKey: 'avatar-purchase-1' }, user: { id: 'user-1', role: 'user' } },
      {},
    );

    expect(mockClientQuery.mock.calls[0][0]).toBe('BEGIN');
    expect(mockSpendUserPoints).not.toHaveBeenCalled();
    expect(mockClientQuery.mock.calls.some(call => call[0] === 'COMMIT')).toBe(true);
    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      { ownedItemIds: ['spark-hoodie'], spendable_points: 40, replayed: true },
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

  it('returns server-computed daily monthly and all-time Study seconds', async () => {
    const handler = mockRouteHandlers.get['/summary'];
    expect(handler).toBeTypeOf('function');
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ today_seconds: '600', month_seconds: '3600', total_seconds: '7200' }],
    });

    await handler({ user: { id: 'user-1', role: 'user' } }, {});

    expect(mockDbQuery.mock.calls[0][0]).toContain('SUM(eligible_seconds)');
    expect(mockDbQuery.mock.calls[0][1]).toEqual(['user-1']);
    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      { todaySeconds: 600, monthSeconds: 3600, totalSeconds: 7200 },
      'Study summary fetched',
    );
  });

  it('does not count focused heartbeats unless the avatar is seated in a real seat', async () => {
    const handler = mockRouteHandlers.post['/sessions/:id/heartbeat'];
    mockClientQuery
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [{
          id: 'session-1', user_id: 'user-1', location: 'library', status: 'active',
          current_nonce_hash: hashStudyNonce('server-nonce'),
          last_heartbeat_at: new Date(Date.now() - 60_000),
          valid_heartbeat_count: 2, eligible_seconds: 120,
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 'session-1', location: 'library', status: 'active', last_heartbeat_at: 'now' }],
      })
      .mockResolvedValueOnce(undefined);

    await handler(
      {
        params: { id: 'session-1' },
        body: {
          nonce: 'server-nonce', focused: true, foreground: true,
          position: { x: 5, y: 6 }, interaction: 'walking', seat_id: 'front-left',
        },
        user: { id: 'user-1', role: 'user' },
      },
      {},
    );

    expect(mockClientQuery.mock.calls[3][1][1]).toBe(0);
    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ accepted_seconds: 0 }),
      'Study heartbeat accepted',
    );
  });

  it('atomically assigns overflow users under a physical-room advisory lock', async () => {
    const handler = mockRouteHandlers.post['/instances/join'];
    expect(handler).toBeTypeOf('function');
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ locked: true }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ instance_id: 'library-1', occupancy: '60' }] })
      .mockResolvedValueOnce({ rows: [{ instance_id: 'library-2' }] })
      .mockResolvedValueOnce({ rows: [] });

    await handler(
      {
        body: {
          roomId: 'library', preferredInstanceId: 'library-1',
          nodeId: 'bottom-center-aisle', position: { x: 432.86, y: 1254 },
          clientSessionId: 'webview-session-1',
        },
        user: { id: 'user-52', role: 'user' },
      },
      {},
    );

    expect(mockPoolConnect).toHaveBeenCalledTimes(1);
    expect(mockClientQuery.mock.calls[0][0]).toBe('BEGIN');
    expect(mockClientQuery.mock.calls[1][0]).toContain('pg_advisory_xact_lock');
    expect(mockClientQuery.mock.calls[1][1]).toEqual(['study-instance:library']);
    expect(mockClientQuery.mock.calls[4][0]).toContain('INSERT INTO study_room_presence');
    expect(mockClientQuery.mock.calls[4][1]).toEqual([
      'user-52', 'library', 'library-2', 'webview-session-1',
      'bottom-center-aisle', 432.86, 1254,
    ]);
    expect(mockClientQuery.mock.calls[5][0]).toBe('COMMIT');
    expect(mockClientRelease).toHaveBeenCalledTimes(1);
    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      { instance: {
        id: 'library-2', roomId: 'library', number: 2,
        occupancy: 1, capacity: 60, preferredInstanceFull: true,
      } },
      'Study room instance assigned',
    );
  });

  it('rejects a preferred instance from another physical room before opening a transaction', async () => {
    const handler = mockRouteHandlers.post['/instances/join'];
    expect(handler).toBeTypeOf('function');

    await handler(
      {
        body: {
          roomId: 'library', preferredInstanceId: 'chim-alan-1',
          nodeId: 'bottom-center-aisle', position: { x: 432.86, y: 1254 },
          clientSessionId: 'webview-session-1',
        },
        user: { id: 'user-1', role: 'user' },
      },
      {},
    );

    expect(mockPoolConnect).not.toHaveBeenCalled();
    expect(mockSendError).toHaveBeenCalledWith({}, 'Invalid Study room instance', 400);
  });

  it('keeps a recent reconnect in its assigned instance and reports live occupancy', async () => {
    const handler = mockRouteHandlers.post['/instances/join'];
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ locked: true }] })
      .mockResolvedValueOnce({ rows: [{ instance_id: 'library-1' }] })
      .mockResolvedValueOnce({ rows: [{ instance_id: 'library-1', occupancy: '17' }] })
      .mockResolvedValueOnce({ rows: [{ instance_id: 'library-1' }] })
      .mockResolvedValueOnce({ rows: [] });

    await handler(
      {
        body: {
          roomId: 'library', nodeId: 'bottom-center-aisle', position: { x: 50, y: 80 },
          clientSessionId: 'webview-session-1',
        },
        user: { id: 'user-1', role: 'user' },
      },
      {},
    );

    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      { instance: expect.objectContaining({ id: 'library-1', occupancy: 17, capacity: 60 }) },
      'Study room instance assigned',
    );
  });

  it('honors an explicit room choice instead of pinning an active user to a stale instance', async () => {
    const handler = mockRouteHandlers.post['/instances/join'];
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ locked: true }] })
      .mockResolvedValueOnce({ rows: [{ instance_id: 'library-1' }] })
      .mockResolvedValueOnce({ rows: [
        { instance_id: 'library-1', occupancy: '17' },
        { instance_id: 'library-2', occupancy: '4' },
      ] })
      .mockResolvedValueOnce({ rows: [{ instance_id: 'library-2' }] })
      .mockResolvedValueOnce({ rows: [] });

    await handler(
      {
        body: {
          roomId: 'library', preferredInstanceId: 'library-2',
          nodeId: 'bottom-center-aisle', position: { x: 50, y: 80 },
          clientSessionId: 'webview-session-1',
        },
        user: { id: 'user-1', role: 'user' },
      },
      {},
    );

    expect(mockClientQuery.mock.calls[4][1][2]).toBe('library-2');
    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      { instance: expect.objectContaining({ id: 'library-2', occupancy: 5, capacity: 60 }) },
      'Study room instance assigned',
    );
  });

  it('upserts authenticated room presence without trusting elapsed seconds', async () => {
    const handler = mockRouteHandlers.post['/presence/heartbeat'];
    expect(handler).toBeTypeOf('function');
    mockDbQuery.mockResolvedValueOnce({
      rows: [{
        user_id: 'user-1', room_id: 'library', node_id: 'front-left', seat_id: 'front-left',
        position_x: 4, position_y: 8, last_heartbeat_at: 'now',
      }],
    });

    await handler(
      {
        body: {
          roomId: 'library', instanceId: 'library-2', clientSessionId: 'webview-session-1',
          nodeId: 'front-left', seatId: 'front-left',
          position: { x: 4, y: 8 }, studiedSecondsToday: 999999,
        },
        user: { id: 'user-1', role: 'user' },
      },
      {},
    );

    expect(mockDbQuery.mock.calls[0][0]).toContain('UPDATE study_room_presence');
    expect(mockDbQuery.mock.calls[0][0]).toContain("CONCAT($2::text, ':', $3::text");
    expect(mockDbQuery.mock.calls[0][0]).toContain('instance_id = $3');
    expect(mockDbQuery.mock.calls[0][0]).toContain('client_session_id = $4');
    expect(mockDbQuery.mock.calls[0][0]).not.toMatch(/studied_seconds_today\s*=\s*\$\d+/);
    expect(mockDbQuery.mock.calls[0][1]).toEqual([
      'user-1', 'library', 'library-2', 'webview-session-1',
      'front-left', 4, 8, 'front-left',
    ]);
    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ presence: expect.objectContaining({ roomId: 'library', seatId: 'front-left' }) }),
      'Study presence updated',
    );
  });

  it('preserves fractional image-room coordinates in presence heartbeats', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user-1', room_id: 'library', position_x: 43.7799, position_y: 51.999 }] });
    await mockRouteHandlers.post['/presence/heartbeat']({
      user: { id: 'user-1', role: 'user' },
      body: { roomId: 'library', instanceId: 'library-1', clientSessionId: 'precision-qa', nodeId: 'spawn', seatId: null, position: { x: 43.7799, y: 51.999 } },
    }, {});
    expect(mockDbQuery.mock.calls[0][1].slice(5, 7)).toEqual([43.7799, 51.999]);
    expect(mockSendSuccess).toHaveBeenCalledWith({}, expect.objectContaining({ presence: expect.objectContaining({ position: { x: 43.7799, y: 51.999 } }) }), 'Study presence updated');
  });

  it('fetches presence only from the assigned logical room instance', async () => {
    const handler = mockRouteHandlers.get['/presence'];
    mockDbQuery.mockResolvedValueOnce({
      rows: [{
        user_id: 'user-2', room_id: 'library', instance_id: 'library-2',
        node_id: 'front-left', position_x: 4, position_y: 8, seat_id: null,
        presence_mode: 'studying', last_heartbeat_at: 'now', display_name: 'Ada', equipped: {},
      }],
    });

    await handler(
      { query: { roomId: 'library', instanceId: 'library-2' }, user: { id: 'user-1', role: 'user' } },
      {},
    );

    expect(mockDbQuery.mock.calls[0][0]).toMatch(/SELECT p\.user_id, p\.room_id, p\.instance_id,/);
    expect(mockDbQuery.mock.calls[0][0]).toContain('p.instance_id = $2');
    expect(mockDbQuery.mock.calls[0][1]).toEqual(['library', 'library-2', 35]);
    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      { presence: [expect.objectContaining({ userId: 'user-2', instanceId: 'library-2' })] },
      'Study presence fetched',
    );
  });

  it('rejects invalid snake-case presence seat identifiers', async () => {
    const handler = mockRouteHandlers.post['/presence/heartbeat'];

    await handler(
      {
        body: {
          room_id: 'library', node_id: 'front-left', seat_id: '../invalid',
          position: { x: 4, y: 8 },
        },
        user: { id: 'user-1', role: 'user' },
      },
      {},
    );

    expect(mockDbQuery).not.toHaveBeenCalled();
    expect(mockSendError).toHaveBeenCalledWith({}, 'Invalid Study presence payload', 400);
  });

  it('normalizes and stores registered-user chat with a server timestamp', async () => {
    const handler = mockRouteHandlers.post['/chat'];
    expect(handler).toBeTypeOf('function');
    mockDbQuery.mockResolvedValueOnce({
      rows: [{
        id: 'message-1', user_id: 'user-1', display_name: 'Ada', room_id: 'library',
        message_text: 'Hello Social', created_at: 'now',
      }],
    });

    await handler(
      {
        body: { roomId: 'library', instanceId: 'library-2', text: '  Hello   Social  ' },
        user: { id: 'user-1', role: 'user' },
      },
      {},
    );

    expect(mockDbQuery).toHaveBeenCalledTimes(1);
    expect(mockDbQuery.mock.calls[0][0]).toContain('pg_try_advisory_xact_lock');
    expect(mockDbQuery.mock.calls[0][0]).toContain('WHERE acquired AND recent_count < $6');
    expect(mockDbQuery.mock.calls[0][0]).toContain('duplicate.message_text = $4');
    expect(mockDbQuery.mock.calls[0][0]).toContain('instance_id = $3');
    expect(mockDbQuery.mock.calls[0][1]).toEqual([
      'library', 'user-1', 'library-2', 'Hello Social', 10, 5, 3,
    ]);
    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      { message: expect.objectContaining({ id: 'message-1', text: 'Hello Social', displayName: 'Ada' }) },
      'Social message sent',
      undefined,
      201,
    );
  });

  it('blocks unsafe chat before any database write', async () => {
    const handler = mockRouteHandlers.post['/chat'];

    await handler(
      {
        body: { roomId: 'library', instanceId: 'library-2', text: 'f.u.c.k' },
        user: { id: 'user-1', role: 'user' },
      },
      {},
    );

    expect(mockDbQuery).not.toHaveBeenCalled();
    expect(mockSendError).toHaveBeenCalledWith(
      {},
      'Message blocked by Social room safety rules.',
      422,
      'CHAT_CONTENT_BLOCKED',
    );
  });

  it('prunes only Social messages at least six hours old', async () => {
    mockDbQuery.mockResolvedValueOnce({ rowCount: 3 });
    expect(await pruneExpiredStudyChatMessages()).toBe(3);
    expect(mockDbQuery).toHaveBeenCalledWith("DELETE FROM study_world_chat_messages WHERE created_at <= NOW() - INTERVAL '6 hours'");
  });

  it('expires cached messages at the six-hour boundary', async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    try {
      invalidateStudyChatCache();
      mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 'expiring', user_id: 'user-1', display_name: 'Ada', message_text: 'Hello', created_at: new Date(now - 6 * 60 * 60_000 + 100) }] });
      const req = { query: { roomId: 'library', instanceId: 'library-1' }, user: { id: 'user-1', role: 'user' } };
      await mockRouteHandlers.get['/chat'](req, {});
      clock.mockReturnValue(now + 99);
      await mockRouteHandlers.get['/chat'](req, {});
      expect(mockDbQuery).toHaveBeenCalledTimes(1);
      clock.mockReturnValue(now + 100);
      mockDbQuery.mockResolvedValueOnce({ rows: [] });
      await mockRouteHandlers.get['/chat'](req, {});
      expect(mockDbQuery).toHaveBeenCalledTimes(2);
      expect(mockSendSuccess).toHaveBeenLastCalledWith({}, { messages: [] }, 'Social messages fetched');
    } finally { clock.mockRestore(); }
  });

  it('fetches chat only from one logical room instance', async () => {
    const handler = mockRouteHandlers.get['/chat'];
    mockDbQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'safe', user_id: 'user-1', display_name: 'Ada', room_id: 'library',
          instance_id: 'library-2', message_text: 'Ready for a focus session?', created_at: 'now',
        },
        {
          id: 'unsafe', user_id: 'user-2', display_name: 'Eve', room_id: 'library',
          instance_id: 'library-2', message_text: 'f.u.c.k', created_at: 'now',
        },
      ],
    });

    await handler(
      { query: { roomId: 'library', instanceId: 'library-2' }, user: { id: 'user-1', role: 'user' } },
      {},
    );

    expect(mockDbQuery.mock.calls[0][0]).toContain('m.instance_id = $2');
    expect(mockDbQuery.mock.calls[0][0]).toContain("m.created_at > NOW() - INTERVAL '6 hours'");
    expect(mockDbQuery.mock.calls[0][1]).toEqual(['library', 'library-2']);
    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      { messages: [expect.objectContaining({ id: 'safe', text: 'Ready for a focus session?' })] },
      'Social messages fetched',
    );
  });

  it('distinguishes expired membership from a rate limit without inserting chat', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: null, room_active: false }] });
    await mockRouteHandlers.post['/chat'](
      { body: { roomId: 'sca-office', instanceId: 'sca-office-1', text: 'Hello' }, user: { id: 'user-1', role: 'user' } }, {},
    );
    expect(mockSendError).toHaveBeenCalledWith({}, 'Rejoin this room before sending a message.', 409, 'CHAT_ROOM_NOT_JOINED');
    expect(mockSendSuccess).not.toHaveBeenCalled();
  });

  it('returns 429 when the atomic chat insert is denied by the rate limit', async () => {
    const handler = mockRouteHandlers.post['/chat'];
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    await handler(
      {
        body: { roomId: 'library', instanceId: 'library-1', text: 'Too fast' },
        user: { id: 'user-1', role: 'user' },
      },
      {},
    );

    expect(mockDbQuery).toHaveBeenCalledTimes(1);
    expect(mockSendError).toHaveBeenCalledWith(
      {},
      'Social chat rate limit exceeded',
      429,
      'CHAT_RATE_LIMITED',
    );
    expect(mockSendSuccess).not.toHaveBeenCalled();
  });

  it('accepts the hat slot for owned avatar equipment', async () => {
    const handler = mockRouteHandlers.post['/avatar/equip'];
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ item_id: 'bucket-hat' }] })
      .mockResolvedValueOnce({ rows: [] });

    await handler(
      { body: { slot: 'hat', itemId: 'bucket-hat' }, user: { id: 'user-1', role: 'user' } },
      {},
    );

    expect(mockDbQuery.mock.calls[1][1]).toEqual(['user-1', 'hat', 'bucket-hat']);
    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      { equipped: { hat: 'bucket-hat' } },
      'Avatar item equipped',
    );
  });

  it('shares one database read across 60 concurrent room observers', async () => {
    invalidateStudyPresenceCache();
    let resolve!: (value: { rows: never[] }) => void;
    mockDbQuery.mockReturnValueOnce(new Promise(r => { resolve = r; }));
    const req = { user: { id: 'qa', role: 'user' }, query: { roomId: 'library', instanceId: 'library-1' } };
    const requests = Array.from({ length: 60 }, () => mockRouteHandlers.get['/presence'](req, {}));
    expect(mockDbQuery).toHaveBeenCalledTimes(1);
    resolve({ rows: [] });
    await Promise.all(requests);
    expect(mockSendSuccess).toHaveBeenCalledTimes(60);
  });

  it('does not cache an in-flight read invalidated by a movement update', async () => {
    invalidateStudyPresenceCache();
    let resolve!: (value: { rows: never[] }) => void;
    mockDbQuery.mockReturnValueOnce(new Promise(r => { resolve = r; }));
    const req = { user: { id: 'qa', role: 'user' }, query: { roomId: 'library', instanceId: 'library-1' } };
    const first = mockRouteHandlers.get['/presence'](req, {});
    invalidateStudyPresenceCache('library', 'library-1');
    resolve({ rows: [] });
    await first;
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    await mockRouteHandlers.get['/presence'](req, {});
    expect(mockDbQuery).toHaveBeenCalledTimes(2);
  });

  it('retries the database after a shared presence read fails', async () => {
    invalidateStudyPresenceCache();
    mockDbQuery.mockRejectedValueOnce(new Error('temporary database failure'));
    const req = { user: { id: 'qa', role: 'user' }, query: { roomId: 'library', instanceId: 'library-1' } };
    await mockRouteHandlers.get['/presence'](req, {});
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    await mockRouteHandlers.get['/presence'](req, {});
    expect(mockDbQuery).toHaveBeenCalledTimes(2);
    expect(mockSendSuccess).toHaveBeenCalledTimes(1);
  });

  it('serves repeated presence queries from cache and invalidates on presence update', async () => {
    const presenceGet = mockRouteHandlers.get['/presence'];
    invalidateStudyPresenceCache();

    mockDbQuery.mockResolvedValueOnce({
      rows: [{
        user_id: 'user-1',
        room_id: 'library',
        instance_id: 'library-1',
        node_id: 'spawn',
        position_x: 100,
        position_y: 200,
        seat_id: null,
        presence_mode: 'studying',
        last_heartbeat_at: new Date(),
        display_name: 'User One',
        equipped: {},
      }],
    });

    const req1 = {
      user: { id: 'user-1', role: 'user' },
      query: { roomId: 'library', instanceId: 'library-1' },
    };
    await presenceGet(req1, {});
    expect(mockDbQuery).toHaveBeenCalledTimes(1);

    // Second call should be served from memory cache without hitting DB
    await presenceGet(req1, {});
    expect(mockDbQuery).toHaveBeenCalledTimes(1);

    // Invalidate cache
    invalidateStudyPresenceCache('library', 'library-1');

    mockDbQuery.mockResolvedValueOnce({
      rows: [{
        user_id: 'user-1',
        room_id: 'library',
        instance_id: 'library-1',
        node_id: 'spawn',
        position_x: 150,
        position_y: 250,
        seat_id: null,
        presence_mode: 'studying',
        last_heartbeat_at: new Date(),
        display_name: 'User One',
        equipped: {},
      }],
    });

    // Third call hits DB again because cache was invalidated
    await presenceGet(req1, {});
    expect(mockDbQuery).toHaveBeenCalledTimes(2);
  });

  it('serves repeated chat queries from cache and invalidates on cache reset', async () => {
    const chatGet = mockRouteHandlers.get['/chat'];
    invalidateStudyChatCache();

    mockDbQuery.mockResolvedValueOnce({
      rows: [{
        id: 'msg-1',
        user_id: 'user-1',
        display_name: 'User One',
        room_id: 'library',
        instance_id: 'library-1',
        message_text: 'hello world',
        created_at: new Date(),
      }],
    });

    const req = {
      user: { id: 'user-1', role: 'user' },
      query: { roomId: 'library', instanceId: 'library-1' },
    };
    await chatGet(req, {});
    expect(mockDbQuery).toHaveBeenCalledTimes(1);

    // Second call served from cache
    await chatGet(req, {});
    expect(mockDbQuery).toHaveBeenCalledTimes(1);

    // Invalidate
    invalidateStudyChatCache('library', 'library-1');

    mockDbQuery.mockResolvedValueOnce({
      rows: [{
        id: 'msg-2',
        user_id: 'user-1',
        display_name: 'User One',
        room_id: 'library',
        instance_id: 'library-1',
        message_text: 'second message',
        created_at: new Date(),
      }],
    });

    await chatGet(req, {});
    expect(mockDbQuery).toHaveBeenCalledTimes(2);
  });

  it('updates username for registered users and rejects invalid or taken usernames', async () => {
    // Rejects invalid format
    const reqInvalid: any = {
      user: { id: 'user-1', is_guest: false },
      body: { username: 'a!' },
    };
    await handleUpdateUsername(reqInvalid, {} as any);
    expect(mockSendError).toHaveBeenCalledWith(
      {},
      expect.stringContaining('Username must be 3-20 characters'),
      400,
      'INVALID_USERNAME'
    );

    // Rejects taken username
    mockSendError.mockReset();
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 'user-2' }] });
    const reqTaken: any = {
      user: { id: 'user-1', is_guest: false },
      body: { username: 'taken_user' },
    };
    await handleUpdateUsername(reqTaken, {} as any);
    expect(mockSendError).toHaveBeenCalledWith(
      {},
      expect.stringContaining('already taken'),
      409,
      'USERNAME_TAKEN'
    );

    // Updates successfully
    mockSendSuccess.mockReset();
    mockDbQuery
      .mockResolvedValueOnce({ rows: [] }) // not taken
      .mockResolvedValueOnce({ rows: [{ id: 'user-1', username: 'new_hero', display_name: 'Original Name' }] }); // update
    const reqSuccess: any = {
      user: { id: 'user-1', is_guest: false },
      body: { username: 'new_hero' },
    };
    await handleUpdateUsername(reqSuccess, {} as any);
    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      { username: 'new_hero', displayName: 'new_hero' },
      'Username updated successfully'
    );
  });

});
