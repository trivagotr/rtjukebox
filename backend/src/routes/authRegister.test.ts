import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDbQuery,
  mockRouteHandlers,
  mockRouter,
  mockSendError,
  mockSendSuccess,
} = vi.hoisted(() => {
  const handlers: Record<string, Record<string, (...args: any[]) => any>> = {
    get: {},
    post: {},
  };

  const router: any = {};
  router.get = vi.fn((path: string, ...routeHandlers: Array<(...args: any[]) => any>) => {
    handlers.get[path] = routeHandlers[routeHandlers.length - 1];
    return router;
  });
  router.post = vi.fn((path: string, ...routeHandlers: Array<(...args: any[]) => any>) => {
    handlers.post[path] = routeHandlers[routeHandlers.length - 1];
    return router;
  });

  return {
    mockDbQuery: vi.fn(),
    mockRouteHandlers: handlers,
    mockRouter: router,
    mockSendError: vi.fn(),
    mockSendSuccess: vi.fn(),
  };
});

vi.mock('express', () => ({
  Router: vi.fn(() => mockRouter),
}));

vi.mock('../db', () => ({
  db: {
    query: mockDbQuery,
  },
}));

vi.mock('../middleware/auth', () => ({
  JWT_SECRET: 'test-secret-key',
  authMiddleware: vi.fn(),
}));

vi.mock('../middleware/upload', () => ({
  upload: {
    single: vi.fn(() => vi.fn()),
  },
}));

vi.mock('../utils/response', () => ({
  sendError: mockSendError,
  sendSuccess: mockSendSuccess,
}));

import './auth';

function createReq(body: Record<string, unknown>) {
  return {
    body,
    headers: {
      'user-agent': 'vitest',
    },
    ip: '127.0.0.1',
  };
}

describe('auth registration routes', () => {
  beforeEach(() => {
    mockDbQuery.mockReset();
    mockSendError.mockReset();
    mockSendSuccess.mockReset();
  });

  it('registers users without returning password hashes', async () => {
    const handler = mockRouteHandlers.post['/register'];
    expect(handler).toBeTypeOf('function');
    mockDbQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'user-1',
            email: 'student@gmail.com',
            password_hash: 'hashed-password',
            display_name: 'Student',
            avatar_url: null,
            is_guest: false,
            rank_score: 0,
            role: 'user',
            last_super_vote_at: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    await handler(
      createReq({
        email: 'STUDENT@gmail.com',
        password: 'password123',
        display_name: ' Student ',
      }),
      {},
    );

    const payload = mockSendSuccess.mock.calls[0][1];
    expect(payload.user).toEqual(
      expect.objectContaining({
        id: 'user-1',
        email: 'student@gmail.com',
        display_name: 'Student',
        role: 'user',
      }),
    );
    expect(payload.user).not.toHaveProperty('password_hash');
    expect(payload.access_token).toEqual(expect.any(String));
    expect(payload.refresh_token).toEqual(expect.any(String));
  });

  it('persists validated onboarding metadata during registration', async () => {
    const handler = mockRouteHandlers.post['/register'];
    mockDbQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'user-2',
            email: 'student@tedu.edu.tr',
            display_name: 'Student',
            birth_year: 2004,
            preferred_language: 'tr',
            is_guest: false,
            rank_score: 0,
            role: 'user',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    await handler(
      createReq({
        email: 'student@tedu.edu.tr',
        password: 'password123',
        display_name: 'Student',
        birth_year: 2004,
        preferred_language: 'tr',
      }),
      {},
    );

    expect(mockDbQuery.mock.calls[1][0]).toContain('birth_year');
    expect(mockDbQuery.mock.calls[1][0]).toContain('preferred_language');
    expect(mockDbQuery.mock.calls[1][1]).toEqual(expect.arrayContaining([2004, 'tr']));
    expect(mockSendSuccess.mock.calls[0][1].user).toEqual(
      expect.objectContaining({
        birth_year: 2004,
        preferred_language: 'tr',
      }),
    );
  });

  it('persists guest users with the guest role', async () => {
    const handler = mockRouteHandlers.post['/guest'];
    expect(handler).toBeTypeOf('function');
    mockDbQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'guest-1',
            email: 'guest_random@radiotedu.internal',
            display_name: 'Guest Listener',
            is_guest: true,
            rank_score: 0,
            role: 'guest',
            last_super_vote_at: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    await handler(createReq({ display_name: 'Guest Listener' }), {});

    expect(mockDbQuery.mock.calls[0][0]).toContain('role');
    expect(mockDbQuery.mock.calls[0][1]).toContain('guest');
    expect(mockSendSuccess.mock.calls[0][1].user).toEqual(
      expect.objectContaining({
        id: 'guest-1',
        is_guest: true,
        role: 'guest',
      }),
    );
  });

  it('maps current profile responses with guest status', async () => {
    const { mapCurrentUserProfile } = await import('./auth');

    expect(
      mapCurrentUserProfile({
        id: 'guest-1',
        email: 'guest_random@radiotedu.internal',
        display_name: 'Guest Listener',
        avatar_url: null,
        is_guest: true,
        rank_score: 0,
        monthly_rank_score: 0,
        total_songs_added: 0,
        role: 'guest',
      }),
    ).toEqual(
      expect.objectContaining({
        id: 'guest-1',
        is_guest: true,
        role: 'guest',
      }),
    );
  });

  it('maps the server-authoritative global point balance for app clients', async () => {
    const { mapCurrentUserProfile } = await import('./auth');

    expect(
      mapCurrentUserProfile({
        id: 'user-3',
        email: 'student@tedu.edu.tr',
        display_name: 'Student',
        role: 'user',
        gold_balance: 240,
      }),
    ).toEqual(expect.objectContaining({gold_balance: 240}));
  });

  it('exposes a unified RadioTEDU account session for embedded clients', async () => {
    const handler = mockRouteHandlers.get['/session'];
    expect(handler).toBeTypeOf('function');

    mockDbQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'user-1',
          email: 'student@gmail.com',
          display_name: 'Student',
          avatar_url: null,
          is_guest: false,
          rank_score: 40,
          monthly_rank_score: 15,
          total_songs_added: 2,
          total_upvotes_received: 3,
          role: 'user',
          gold_balance: 120,
          lifetime_gold_earned: 200,
          last_super_vote_at: null,
        },
      ],
    });

    await handler({ user: { id: 'user-1' } }, {});

    expect(mockSendSuccess.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        account: expect.objectContaining({
          scope: 'radiotedu',
          surfaces: expect.objectContaining({
            mobile: true,
            social: true,
            jukebox: true,
            'study-library': true,
            spark: false,
            rock: false,
          }),
        }),
        endpoints: expect.objectContaining({
          social: '/social/',
          auth: '/api/v1/auth',
          study: '/api/v1/study',
          jukebox: '/api/v1/jukebox',
        }),
        points: expect.objectContaining({
          gold_balance: 120,
          lifetime_gold_earned: 200,
        }),
      }),
    );
  });
});
