import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDbQuery,
  mockSendSuccess,
  mockSendError,
  mockAuthMiddleware,
  mockAwardUserPoints,
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
    mockSendSuccess: vi.fn(),
    mockSendError: vi.fn(),
    mockAuthMiddleware: vi.fn(),
    mockAwardUserPoints: vi.fn(),
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

vi.mock('../services/gamification', async () => {
  const actual = await vi.importActual<typeof import('../services/gamification')>('../services/gamification');
  return {
    ...actual,
    awardUserPoints: mockAwardUserPoints,
  };
});

vi.mock('../utils/response', () => ({
  sendSuccess: mockSendSuccess,
  sendError: mockSendError,
}));

vi.mock('express', () => ({
  Router: vi.fn(() => mockRouter),
}));

import './gamification';

describe('gamification router', () => {
  beforeEach(() => {
    mockDbQuery.mockReset();
    mockSendSuccess.mockReset();
    mockSendError.mockReset();
    mockAwardUserPoints.mockReset();
    mockAwardUserPoints.mockResolvedValue({
      applied: true,
      amount: 10,
      awarded: 10,
      spendablePoints: 10,
      ledgerId: 'ledger-test',
    });
  });

  it('requires auth before exposing gamification endpoints', () => {
    expect(mockRouter.use).toHaveBeenCalledWith(mockAuthMiddleware);
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
    mockDbQuery
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
      .mockResolvedValueOnce({
        rows: [
          {
            spendable_points: 20,
          },
        ],
      });

    await handler({ params: { itemId: 'item-1' }, user: { id: 'user-1', role: 'user' } }, {});

    expect(mockSendError).toHaveBeenCalledWith({}, 'Not enough points', 400);
    expect(mockDbQuery).toHaveBeenCalledTimes(2);
  });

  it('caps arcade game awards by the remaining daily limit', async () => {
    const handler = mockRouteHandlers.post['/games/:gameId/score'];
    expect(handler).toBeTypeOf('function');
    mockDbQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'game-1',
            point_rate: '0.5',
            daily_point_limit: 30,
            is_active: true,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ awarded_today: '20' }],
      })
      .mockResolvedValue({ rows: [] });

    await handler({
      params: { gameId: 'game-1' },
      body: { score: 100, client_round_id: 'round-1' },
      user: { id: 'user-1', role: 'user' },
    }, {});

    expect(mockAwardUserPoints).toHaveBeenCalledWith(expect.objectContaining({
      amount: 10,
      idempotencyKey: 'game:round-1',
    }));
    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        points_awarded: 10,
        spendable_points: 10,
      }),
      'Game score submitted',
      undefined,
      201,
    );
  });

  it('uses a per-account QR reward identity and returns the authoritative Gold balance', async () => {
    const handler = mockRouteHandlers.post['/events/qr/claim'];
    expect(handler).toBeTypeOf('function');
    mockDbQuery
      .mockResolvedValueOnce({rows: [{id: 'reward-1', points: 15}]})
      .mockResolvedValueOnce({rows: []});
    mockAwardUserPoints.mockResolvedValueOnce({
      applied: true,
      amount: 15,
      awarded: 15,
      spendablePoints: 42,
      ledgerId: 'ledger-qr',
    });

    await handler(
      {body: {code: 'TEDU-QR'}, user: {id: 'user-1', role: 'user'}},
      {},
    );

    expect(mockAwardUserPoints).toHaveBeenCalledWith(expect.objectContaining({
      sourceType: 'qr_reward',
      sourceId: 'reward-1',
      idempotencyKey: 'qr:reward-1:user-1',
    }));
    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      {points_awarded: 15, spendable_points: 42},
      'QR reward claimed',
      undefined,
      201,
    );
  });

  it('awards only the new cumulative listening delta with a stable session key', async () => {
    const handler = mockRouteHandlers.post['/listening/heartbeat'];
    expect(handler).toBeTypeOf('function');
    mockDbQuery
      .mockResolvedValueOnce({
        rows: [{
          id: 'session-1',
          listened_seconds: 300,
          points_awarded: 1,
          content_type: 'radio',
          content_id: 'main',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'session-1',
          listened_seconds: 600,
          points_awarded: 2,
          content_type: 'radio',
          content_id: 'main',
        }],
      });
    mockAwardUserPoints.mockResolvedValueOnce({
      applied: true,
      amount: 1,
      awarded: 1,
      spendablePoints: 43,
      ledgerId: 'ledger-listening',
    });

    await handler(
      {
        body: {
          content_type: 'radio',
          content_id: 'main',
          listened_seconds: 600,
        },
        user: {id: 'user-1', role: 'user'},
      },
      {},
    );

    expect(String(mockDbQuery.mock.calls[0][0])).toContain('FROM listening_sessions');
    expect(mockAwardUserPoints).toHaveBeenCalledWith(expect.objectContaining({
      amount: 1,
      sourceId: 'session-1',
      idempotencyKey: 'listening:session-1:2',
    }));
    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        points_awarded: 1,
        cumulative_points_awarded: 2,
        spendable_points: 43,
      }),
      'Listening heartbeat saved',
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
