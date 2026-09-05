import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDbQuery,
  mockClientQuery,
  mockClientRelease,
  mockPoolConnect,
  mockSendSuccess,
  mockSendError,
  mockAwardUserPoints,
  mockSpendUserPoints,
  mockAuthMiddleware,
  mockWebAuthMiddleware,
  mockRequireWebCsrf,
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

  const clientQuery = vi.fn();
  const clientRelease = vi.fn();

  return {
    mockDbQuery: vi.fn(),
    mockClientQuery: clientQuery,
    mockClientRelease: clientRelease,
    mockPoolConnect: vi.fn().mockResolvedValue({ query: clientQuery, release: clientRelease }),
    mockSendSuccess: vi.fn(),
    mockSendError: vi.fn(),
    mockAwardUserPoints: vi.fn(),
    mockSpendUserPoints: vi.fn(),
    mockAuthMiddleware: vi.fn(),
    mockWebAuthMiddleware: vi.fn(),
    mockRequireWebCsrf: vi.fn(),
    mockRouteHandlers: handlers,
    mockRouter: router,
  };
});

vi.mock('../db', () => ({
  db: {
    pool: { connect: mockPoolConnect },
    query: mockDbQuery,
  },
}));

vi.mock('../middleware/auth', () => ({
  authMiddleware: mockAuthMiddleware,
}));

vi.mock('../services/webSession', () => ({
  webAuthMiddleware: mockWebAuthMiddleware,
  requireWebCsrf: mockRequireWebCsrf,
}));

vi.mock('../utils/response', () => ({
  sendSuccess: mockSendSuccess,
  sendError: mockSendError,
}));

vi.mock('../services/gamification', async () => {
  const actual = await vi.importActual<typeof import('../services/gamification')>('../services/gamification');
  return {
    ...actual,
    awardUserPoints: mockAwardUserPoints,
    spendUserPoints: mockSpendUserPoints,
  };
});

vi.mock('express', () => ({
  Router: vi.fn(() => mockRouter),
}));

import './gamification';
describe('gamification router', () => {
  beforeEach(() => {
    mockDbQuery.mockReset();
    mockClientQuery.mockReset();
    mockClientRelease.mockReset();
    mockPoolConnect.mockClear();
    mockSendSuccess.mockReset();
    mockSendError.mockReset();
    mockAwardUserPoints.mockReset().mockResolvedValue({
      applied: true,
      amount: 10,
      awarded: 10,
      spendablePoints: 10,
      ledgerId: 'ledger-1',
    });
    mockSpendUserPoints.mockReset().mockResolvedValue({
      applied: true,
      amount: -50,
      awarded: 0,
      spendablePoints: 20,
      ledgerId: 'ledger-spend-1',
    });
  });

  it('requires auth before exposing gamification endpoints', () => {
    expect(mockRouter.use).toHaveBeenNthCalledWith(1, mockWebAuthMiddleware);
    expect(mockRouter.use).toHaveBeenNthCalledWith(2, mockRequireWebCsrf);
    expect(mockRouter.use).toHaveBeenCalledWith('/games/:gameId/score', expect.any(Function));
    expect(mockRouter.use).toHaveBeenCalledWith('/games/:gameId/start', expect.any(Function));
    expect(mockRouteHandlers.post['/games/:gameId/start']).toBeTypeOf('function');
    expect(mockRouter.use).toHaveBeenCalledWith('/social-arcade', expect.any(Function));
    expect(mockRouteHandlers.post['/social-arcade/pool-dive/start']).toBeTypeOf('function');
    expect(mockRouteHandlers.post['/social-arcade/pool-dive/sessions/:sessionId/action']).toBeTypeOf('function');
  });

  it('issues a one-time proof for a registered client-timed mobile game', async () => {
    const handler = mockRouteHandlers.post['/games/:gameId/start'];
    mockDbQuery.mockResolvedValueOnce({
      rows: [{
        id: 'game-1',
        metadata: { verification: 'client-timed-session', surface: 'mobile' },
      }],
    });

    await handler({
      params: { gameId: 'game-1' },
      body: { client_round_id: 'round-1', submission_source: 'mobile_game' },
      user: { id: 'user-1', role: 'user' },
    }, {});

    expect(mockSendError).not.toHaveBeenCalled();
    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        session: expect.objectContaining({game_id: 'game-1', client_round_id: 'round-1'}),
        nonce: expect.any(String),
        minimum_play_seconds: 3,
      }),
      'Verified game session started',
      undefined,
      201,
    );
    expect(mockAwardUserPoints).not.toHaveBeenCalled();
  });

  it.each([
    { verification: 'server-authoritative', surface: 'social' },
    { verification: 'client-timed-session', surface: 'social' },
    { verification: 'server-authoritative', surface: 'mobile' },
  ])('keeps every other generic game start practice-only %#', async (metadata) => {
    const handler = mockRouteHandlers.post['/games/:gameId/start'];
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 'pool-dive', metadata }] });

    await handler({
      params: { gameId: 'pool-dive' },
      body: { client_round_id: 'round-pool-1', submission_source: 'mobile_game' },
      user: { id: 'user-1', role: 'user' },
    }, {});

    expect(mockSendError).toHaveBeenCalledWith(
      {},
      'Client-reported games are practice-only and do not award Gold',
      403,
    );
    expect(mockSendSuccess).not.toHaveBeenCalled();
    expect(mockAwardUserPoints).not.toHaveBeenCalled();
  });

  it('returns Social events with the current account registration state', async () => {
    const handler = mockRouteHandlers.get['/events'];
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ id: 'event-1', title: 'Daily Focus Sprint', registered: true, metadata: { always_open: true } }],
    });

    await handler({ user: { id: 'user-1', role: 'user' } }, {});

    expect(mockDbQuery.mock.calls[0][0]).toContain('FROM event_registrations er');
    expect(mockDbQuery.mock.calls[0][1]).toEqual(['user-1']);
    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      { events: [{ id: 'event-1', title: 'Daily Focus Sprint', registered: true, metadata: { always_open: true } }] },
      'Events fetched',
    );
  });

  it('does not register inactive, expired, or unknown Social events', async () => {
    const handler = mockRouteHandlers.post['/events/:eventId/register'];
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    await handler({ user: { id: 'user-1', role: 'user' }, params: { eventId: 'missing' } }, {});

    expect(mockDbQuery.mock.calls[0][0]).toContain('INSERT INTO event_registrations');
    expect(mockDbQuery.mock.calls[0][0]).toContain('ae.is_active = true');
    expect(mockSendError).toHaveBeenCalledWith(
      {},
      'Social event not found or no longer available.',
      404,
      'SOCIAL_EVENT_UNAVAILABLE',
    );
  });

  it('returns default point balances for a registered user without a points row yet', async () => {
    const handler = mockRouteHandlers.get['/me'];
    expect(handler).toBeTypeOf('function');
    mockDbQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'user-1',
          display_name: 'Tuna',
          is_guest: false,
          lifetime_points: null,
          spendable_points: null,
          monthly_points: null,
        },
      ],
    });

    await handler({ user: { id: 'user-1', role: 'user' } }, {});

    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        points: expect.objectContaining({
          lifetime_points: 0,
          spendable_points: 0,
          monthly_points: 0,
        }),
      }),
      'Gamification profile fetched',
    );
  });

  it('rejects market redemption when spendable points are insufficient', async () => {
    const handler = mockRouteHandlers.post['/market/:itemId/redeem'];
    expect(handler).toBeTypeOf('function');
    mockClientQuery
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [{ id: 'user-1' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'item-1',
            title: 'Sticker',
            cost_points: 50,
            is_active: true,
            stock_quantity: null,
          },
        ],
      })
      .mockResolvedValueOnce(undefined);
    mockSpendUserPoints.mockRejectedValueOnce(new Error('INSUFFICIENT_GOLD'));

    await handler({ params: { itemId: 'item-1' }, user: { id: 'user-1', role: 'user' } }, {});

    expect(mockSendError).toHaveBeenCalledWith({}, 'Not enough points', 400);
    expect(mockClientQuery.mock.calls[2][0]).toContain('FOR UPDATE');
    expect(mockClientQuery.mock.calls.some(call => call[0] === 'ROLLBACK')).toBe(true);
    expect(mockClientRelease).toHaveBeenCalledOnce();
  });

  it('rejects reusing a market idempotency key for another item before spending', async () => {
    const handler = mockRouteHandlers.post['/market/:itemId/redeem'];
    mockClientQuery
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [{ id: 'user-1' }] })
      .mockResolvedValueOnce({
        rows: [{ id: 'redemption-1', market_item_id: 'item-1', idempotency_key: 'purchase-1' }],
      })
      .mockResolvedValueOnce(undefined);

    await handler({
      params: { itemId: 'item-2' },
      body: {},
      get: (name: string) => name === 'Idempotency-Key' ? 'purchase-1' : undefined,
      user: { id: 'user-1', role: 'user' },
    }, {});

    expect(mockSendError).toHaveBeenCalledWith({}, 'Idempotency-Key was already used for another item', 409);
    expect(mockSpendUserPoints).not.toHaveBeenCalled();
    expect(mockClientQuery.mock.calls.some(call => call[0] === 'ROLLBACK')).toBe(true);
  });

  it('rejects a forged score proof for an otherwise reward-eligible mobile game', async () => {
    const handler = mockRouteHandlers.post['/games/:gameId/score'];
    expect(handler).toBeTypeOf('function');
    mockDbQuery.mockResolvedValueOnce({
      rows: [{
        id: 'game-1',
        metadata: { verification: 'client-timed-session', surface: 'mobile' },
      }],
    });

    await handler({
      params: { gameId: 'game-1' },
      body: {
        score: 999999999,
        client_round_id: 'round-1',
        play_duration_ms: 5_000,
        submission_source: 'mobile_game',
        session_id: 'forged-session',
        nonce: 'forged-nonce',
      },
      user: { id: 'user-1', role: 'user' },
    }, {});

    expect(mockSendError).toHaveBeenCalledWith({}, 'game_score_invalid', 400);
    expect(mockSendSuccess).not.toHaveBeenCalled();
    expect(mockAwardUserPoints).not.toHaveBeenCalled();
    expect(mockDbQuery.mock.calls.some(
      ([sql]) => String(sql).includes('INSERT INTO game_score_submissions'),
    )).toBe(false);
    expect(mockClientQuery).not.toHaveBeenCalled();
    expect(mockPoolConnect).not.toHaveBeenCalled();
  });

  it('rejects generic score rewards for a server-authoritative Social game', async () => {
    const handler = mockRouteHandlers.post['/games/:gameId/score'];
    mockDbQuery.mockResolvedValueOnce({
      rows: [{
        id: 'pool-dive',
        metadata: { verification: 'server-authoritative', surface: 'social' },
      }],
    });

    await handler({
      params: { gameId: 'pool-dive' },
      body: {
        score: 999999,
        client_round_id: 'forged-pool-round',
        play_duration_ms: 5_000,
        submission_source: 'mobile_game',
        session_id: 'forged-session',
        nonce: 'forged-nonce',
      },
      user: { id: 'user-1', role: 'user' },
    }, {});

    expect(mockSendError).toHaveBeenCalledWith(
      {},
      'Client-reported games are practice-only and do not award Gold',
      403,
    );
    expect(mockAwardUserPoints).not.toHaveBeenCalled();
    expect(mockDbQuery.mock.calls.some(
      ([sql]) => String(sql).includes('INSERT INTO game_score_submissions'),
    )).toBe(false);
    expect(mockClientQuery).not.toHaveBeenCalled();
    expect(mockPoolConnect).not.toHaveBeenCalled();
  });

  it('returns not found without touching reward state for an unknown game', async () => {
    const handler = mockRouteHandlers.post['/games/:gameId/score'];
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    await handler({
      params: { gameId: 'missing-game' },
      body: {
        score: 100,
        client_round_id: 'round-1',
        play_duration_ms: 5_000,
        submission_source: 'mobile_game',
        session_id: 'forged-session',
        nonce: 'forged-nonce',
      },
      user: { id: 'user-1', role: 'user' },
    }, {});

    expect(mockSendError).toHaveBeenCalledWith({}, 'Game not found', 404);
    expect(mockAwardUserPoints).not.toHaveBeenCalled();
    expect(mockDbQuery.mock.calls.some(
      ([sql]) => String(sql).includes('INSERT INTO game_score_submissions'),
    )).toBe(false);
    expect(mockClientQuery).not.toHaveBeenCalled();
    expect(mockPoolConnect).not.toHaveBeenCalled();
  });

  it('claims a QR reward and its Gold ledger entry in one pinned transaction', async () => {
    const handler = mockRouteHandlers.post['/events/qr/claim'];
    mockClientQuery
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [{ id: 'user-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'reward-1', points: 7 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce(undefined);

    await handler({ body: { code: 'VALID-QR' }, user: { id: 'user-1', role: 'user' } }, {});

    expect(mockAwardUserPoints).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 7,
        sourceType: 'qr_reward',
        sourceId: 'reward-1',
        idempotencyKey: 'qr-reward:reward-1',
      }),
      expect.objectContaining({ query: mockClientQuery }),
    );
    expect(mockClientQuery.mock.calls[0][0]).toBe('BEGIN');
    expect(mockClientQuery.mock.calls[4][0]).toBe('COMMIT');
    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      { points_awarded: 7 },
      'QR reward claimed',
      undefined,
      201,
    );
  });

  it('returns a live study room without enabling chat', async () => {
    const handler = mockRouteHandlers.get['/study-room'];
    expect(handler).toBeTypeOf('function');
    mockDbQuery.mockResolvedValueOnce({
      rows: [
        {
          user_id: 'user-2',
          display_name: 'Ece',
          room_id: 'sesli-kutuphane',
          avatar_style: 'classic-blue',
          position_x: 3,
          position_y: 4,
          studied_seconds_today: '7200',
          studied_seconds_total: '18000',
          current_session_started_at: '2026-06-24T08:00:00.000Z',
          last_heartbeat_at: '2026-06-24T09:00:00.000Z',
          seat_id: 'A1',
          presence_mode: 'studying',
          break_zone_id: null,
          equipped_outfit: {
            shirtId: 'radiotedu-signal-tee',
            backpackId: 'radiotedu-backpack',
          },
        },
      ],
    });

    await handler({ query: {}, user: { id: 'user-1', role: 'user' } }, {});

    expect(mockDbQuery).toHaveBeenCalledWith(expect.stringContaining('study_room_presence'), ['sesli-kutuphane']);
    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        room: expect.objectContaining({
          id: 'sesli-kutuphane',
          chat_enabled: false,
        }),
        seats: expect.arrayContaining([
          expect.objectContaining({ id: 'A1', label: 'A1', position: { x: 4, y: 2 } }),
        ]),
        zones: expect.arrayContaining([
          expect.objectContaining({ id: 'd-sigara', label: 'D Sigara Break Area' }),
        ]),
        participants: [
          expect.objectContaining({
            display_name: 'Ece',
            studied_seconds_today: 7200,
            position: { x: 3, y: 4 },
            seat_id: 'A1',
            presence_mode: 'studying',
            break_zone_id: null,
            equipped_outfit: {
              shirtId: 'radiotedu-signal-tee',
              backpackId: 'radiotedu-backpack',
            },
          }),
        ],
      }),
      'Study room fetched',
    );
  });

  it('returns Çim alan semantic seats when that room is requested', async () => {
    const handler = mockRouteHandlers.get['/study-room'];
    expect(handler).toBeTypeOf('function');
    mockDbQuery.mockResolvedValueOnce({rows: []});

    await handler({query: {room_id: 'chim-alan'}, user: {id: 'user-1', role: 'user'}}, {});

    expect(mockDbQuery).toHaveBeenCalledWith(expect.stringContaining('study_room_presence'), ['chim-alan']);
    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        room: expect.objectContaining({
          id: 'chim-alan',
          theme: 'semantic-amphitheatre',
        }),
        seats: expect.arrayContaining([
          expect.objectContaining({
            id: 'chim-upper-seat-12',
            position: {x: 12, y: 4},
            kind: 'amphitheatre-seat',
          }),
        ]),
      }),
      'Study room fetched',
    );
  });

  it('caps study heartbeat deltas and grid positions', async () => {
    const handler = mockRouteHandlers.post['/study-room/heartbeat'];
    expect(handler).toBeTypeOf('function');
    mockDbQuery.mockResolvedValueOnce({
      rows: [
        {
          user_id: 'user-1',
          room_id: 'sesli-kutuphane',
          avatar_style: 'focus-green',
          position_x: 15,
          position_y: 0,
          studied_seconds_today: 300,
          studied_seconds_total: 1200,
          current_session_started_at: '2026-06-24T08:00:00.000Z',
          last_heartbeat_at: '2026-06-24T09:00:00.000Z',
        },
      ],
    });

    await handler({
      body: {
        room_id: 'sesli-kutuphane',
        avatar_style: 'focus-green',
        position: { x: 99, y: -4 },
        studied_seconds_delta: 9999,
      },
      user: { id: 'user-1', role: 'user' },
    }, {});

    const params = mockDbQuery.mock.calls[0][1];
    expect(params[4]).toBe(15);
    expect(params[5]).toBe(0);
    expect(params[6]).toBe(300);
    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        studied_seconds_delta: 300,
        participant: expect.objectContaining({
          studied_seconds_today: 300,
        }),
      }),
      'Study heartbeat saved',
    );
  });

  it('stores selected seats, break mode, break zone, and equipped outfit on heartbeat', async () => {
    const handler = mockRouteHandlers.post['/study-room/heartbeat'];
    expect(handler).toBeTypeOf('function');
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    mockDbQuery.mockResolvedValueOnce({
      rows: [
        {
          user_id: 'user-1',
          room_id: 'sesli-kutuphane',
          avatar_style: 'focus-green',
          position_x: 13,
          position_y: 10,
          studied_seconds_today: 300,
          studied_seconds_total: 1200,
          current_session_started_at: '2026-06-24T08:00:00.000Z',
          last_heartbeat_at: '2026-06-24T09:00:00.000Z',
          seat_id: 'Window Desk',
          presence_mode: 'break',
          break_zone_id: 'd-sigara',
          equipped_outfit: {
            shirtId: 'campus-navy-tee',
            backpackId: 'radiotedu-backpack',
          },
        },
      ],
    });

    await handler({
      body: {
        room_id: 'sesli-kutuphane',
        avatar_style: 'focus-green',
        position: { x: 13, y: 10 },
        seat_id: 'Window Desk',
        presence_mode: 'break',
        break_zone_id: 'd-sigara',
        equipped_outfit: {
          shirtId: 'campus-navy-tee',
          backpackId: 'radiotedu-backpack',
          ignored: '<script>',
        },
        studied_seconds_delta: 120,
      },
      user: { id: 'user-1', role: 'user' },
    }, {});

    const params = mockDbQuery.mock.calls[1][1];
    expect(params).toEqual(expect.arrayContaining(['Window Desk', 'break', 'd-sigara']));
    expect(params).not.toContain('<script>');
    expect(params[6]).toBe(0);
    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        studied_seconds_delta: 0,
        participant: expect.objectContaining({
          seat_id: 'Window Desk',
          presence_mode: 'break',
          break_zone_id: 'd-sigara',
          equipped_outfit: {
            shirtId: 'campus-navy-tee',
            backpackId: 'radiotedu-backpack',
          },
        }),
      }),
      'Study heartbeat saved',
    );
  });

  it('stores Çim alan seat ids on heartbeat without falling back to null', async () => {
    const handler = mockRouteHandlers.post['/study-room/heartbeat'];
    expect(handler).toBeTypeOf('function');
    mockDbQuery.mockResolvedValueOnce({rows: []});
    mockDbQuery.mockResolvedValueOnce({
      rows: [
        {
          user_id: 'user-1',
          room_id: 'chim-alan',
          avatar_style: 'classic-red',
          position_x: 12,
          position_y: 4,
          studied_seconds_today: 120,
          studied_seconds_total: 120,
          current_session_started_at: '2026-06-24T08:00:00.000Z',
          last_heartbeat_at: '2026-06-24T09:00:00.000Z',
          seat_id: 'chim-upper-seat-12',
          presence_mode: 'studying',
          break_zone_id: null,
          equipped_outfit: {},
        },
      ],
    });

    await handler({
      body: {
        room_id: 'chim-alan',
        position: {x: 12, y: 5},
        seat_id: 'chim-upper-seat-12',
        presence_mode: 'studying',
        studied_seconds_delta: 120,
      },
      user: {id: 'user-1', role: 'user'},
    }, {});

    const params = mockDbQuery.mock.calls[1][1];
    expect(params).toEqual(expect.arrayContaining(['chim-alan', 'chim-upper-seat-12']));
    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        participant: expect.objectContaining({
          room_id: 'chim-alan',
          seat_id: 'chim-upper-seat-12',
          position: {x: 12, y: 4},
        }),
      }),
      'Study heartbeat saved',
    );
  });

  it('rejects seat selection when another active participant already occupies that chair', async () => {
    const handler = mockRouteHandlers.post['/study-room/heartbeat'];
    expect(handler).toBeTypeOf('function');
    mockDbQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user-2' }] });

    await handler({
      body: {
        room_id: 'sesli-kutuphane',
        position: { x: 4, y: 2 },
        seat_id: 'A1',
        presence_mode: 'studying',
        studied_seconds_delta: 60,
      },
      user: { id: 'user-1', role: 'user' },
    }, {});

    expect(mockSendError).toHaveBeenCalledWith({}, 'Seat already occupied', 409);
    expect(mockDbQuery).toHaveBeenCalledTimes(1);
  });

  it('does not let guest accounts write study room hours', async () => {
    const handler = mockRouteHandlers.post['/study-room/heartbeat'];
    expect(handler).toBeTypeOf('function');

    await handler({
      body: { studied_seconds_delta: 60 },
      user: { id: 'guest-1', role: 'guest' },
    }, {});

    expect(mockSendError).toHaveBeenCalledWith({}, 'Account required', 403);
    expect(mockDbQuery).not.toHaveBeenCalled();
  });

  it('does not register study chat endpoints', () => {
    expect(Object.keys(mockRouteHandlers.get).some((path) => path.includes('chat'))).toBe(false);
    expect(Object.keys(mockRouteHandlers.post).some((path) => path.includes('chat'))).toBe(false);
  });
});
