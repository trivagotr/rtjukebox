import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDbQuery,
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

vi.mock('express', () => ({
  Router: vi.fn(() => mockRouter),
}));

import './gamification';

describe('gamification router', () => {
  beforeEach(() => {
    mockDbQuery.mockReset();
    mockSendSuccess.mockReset();
    mockSendError.mockReset();
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
      body: { score: 100 },
      user: { id: 'user-1', role: 'user' },
    }, {});

    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        points_awarded: 10,
      }),
      'Game score submitted',
      undefined,
      201,
    );
  });
});
