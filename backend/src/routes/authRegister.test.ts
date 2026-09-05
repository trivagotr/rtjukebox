import { beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const {
  mockDbQuery,
  mockDbClientQuery,
  mockDbClientRelease,
  mockDbConnect,
  mockRouteHandlers,
  mockRouteStacks,
  mockRouter,
  mockAuthMiddleware,
  mockSendError,
  mockSendSuccess,
  mockTryAwardFirstLogin,
} = vi.hoisted(() => {
  const handlers: Record<string, Record<string, (...args: any[]) => any>> = {
    delete: {},
    get: {},
    post: {},
  };
  const stacks: Record<string, Record<string, Array<(...args: any[]) => any>>> = {
    delete: {},
    get: {},
    post: {},
  };
  const mockAuthMiddleware = vi.fn();

  const router: any = {};
  router.delete = vi.fn((path: string, ...routeHandlers: Array<(...args: any[]) => any>) => {
    stacks.delete[path] = routeHandlers;
    handlers.delete[path] = routeHandlers[routeHandlers.length - 1];
    return router;
  });
  router.get = vi.fn((path: string, ...routeHandlers: Array<(...args: any[]) => any>) => {
    stacks.get[path] = routeHandlers;
    handlers.get[path] = routeHandlers[routeHandlers.length - 1];
    return router;
  });
  router.post = vi.fn((path: string, ...routeHandlers: Array<(...args: any[]) => any>) => {
    stacks.post[path] = routeHandlers;
    handlers.post[path] = routeHandlers[routeHandlers.length - 1];
    return router;
  });
  router.use = vi.fn(() => router);

  return {
    mockDbQuery: vi.fn(),
    mockDbClientQuery: vi.fn(),
    mockDbClientRelease: vi.fn(),
    mockDbConnect: vi.fn(),
    mockRouteHandlers: handlers,
    mockRouteStacks: stacks,
    mockRouter: router,
    mockAuthMiddleware,
    mockSendError: vi.fn(),
    mockSendSuccess: vi.fn(),
    mockTryAwardFirstLogin: vi.fn(),
  };
});

vi.mock('express', () => ({
  Router: vi.fn(() => mockRouter),
}));

vi.mock('../db', () => ({
  db: {
    query: mockDbQuery,
    pool: {
      connect: mockDbConnect,
    },
  },
}));

vi.mock('../middleware/auth', () => ({
  JWT_ALGORITHM: 'HS256',
  JWT_SECRET: 'test-secret-key',
  authMiddleware: mockAuthMiddleware,
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

vi.mock('../services/economy', () => ({
  tryAwardFirstLogin: mockTryAwardFirstLogin,
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
    vi.restoreAllMocks();
    mockDbQuery.mockReset();
    mockDbClientQuery.mockReset();
    mockDbClientRelease.mockReset();
    mockDbConnect.mockReset();
    mockDbConnect.mockResolvedValue({
      query: mockDbClientQuery,
      release: mockDbClientRelease,
    });
    mockSendError.mockReset();
    mockSendSuccess.mockReset();
    mockTryAwardFirstLogin.mockReset();
  });

  it('applies no-store headers to every mobile auth response', async () => {
    const {setAuthNoStore} = await import('../services/webSession');
    expect(mockRouter.use).toHaveBeenCalledWith(setAuthNoStore);
  });

  it('places the account deletion limiter after authentication', () => {
    const stack = mockRouteStacks.delete['/account'];
    expect(stack).toHaveLength(3);
    expect(stack[0]).toBe(mockAuthMiddleware);
    expect(stack[1]).toBeTypeOf('function');
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
        age: 18,
        terms_accepted: true,
        privacy_acknowledged: true,
        terms_version: '2026-08-22',
        privacy_version: '2026-08-22',
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
    expect(mockDbQuery.mock.calls[2][1]).toEqual([
      'user-1',
      '2026-08-22',
      '2026-08-22',
      true,
    ]);
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
        terms_accepted: true,
        privacy_acknowledged: true,
        terms_version: '2026-08-11',
        privacy_version: '2026-08-11',
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
    expect(mockDbQuery.mock.calls[2][1]).toEqual([
      'user-2',
      '2026-08-11',
      '2026-08-11',
      null,
    ]);
  });

  it.each(['fr', 'it', 'jp'] as const)(
    'accepts %s as an onboarding language without removing legacy choices',
    async (preferredLanguage) => {
      const handler = mockRouteHandlers.post['/register'];
      const user = {
        id: `user-${preferredLanguage}`,
        email: `student-${preferredLanguage}@tedu.edu.tr`,
        display_name: 'Student',
        preferred_language: preferredLanguage,
        is_guest: false,
        rank_score: 0,
        role: 'user',
      };
      mockDbQuery
        .mockResolvedValueOnce({rows: []})
        .mockResolvedValueOnce({rows: [user]})
        .mockResolvedValueOnce({rows: []})
        .mockResolvedValueOnce({rows: []});

      await handler(
        createReq({
          email: user.email,
          password: 'password123',
          display_name: user.display_name,
          preferred_language: preferredLanguage,
          terms_accepted: true,
          privacy_acknowledged: true,
          terms_version: '2026-08-22',
          privacy_version: '2026-08-22',
        }),
        {},
      );

      expect(mockDbQuery.mock.calls[1][1]).toEqual(
        expect.arrayContaining([preferredLanguage]),
      );
      expect(mockSendSuccess.mock.calls[0][1].user.preferred_language).toBe(
        preferredLanguage,
      );
    },
  );

  it('rejects registration without the current legal acknowledgement', async () => {
    const handler = mockRouteHandlers.post['/register'];

    await handler(
      createReq({
        email: 'student@tedu.edu.tr',
        password: 'password123',
        display_name: 'Student',
      }),
      {},
    );

    expect(mockSendError).toHaveBeenCalledWith(
      {},
      'You must accept the Terms of Use and acknowledge the Privacy Notice',
      400,
    );
    expect(mockDbQuery).not.toHaveBeenCalled();
  });

  it('rejects under-18 registration from a non-TEDU email address', async () => {
    const handler = mockRouteHandlers.post['/register'];

    await handler(
      createReq({
        email: 'student@gmail.com',
        password: 'password123',
        display_name: 'Student',
        age: 17,
        terms_accepted: true,
        privacy_acknowledged: true,
        terms_version: '2026-08-11',
        privacy_version: '2026-08-11',
      }),
      {},
    );

    expect(mockSendError).toHaveBeenCalledWith(
      {},
      'You must be at least 18 years old to register with a non-TEDU email address',
      400,
    );
    expect(mockDbQuery).not.toHaveBeenCalled();
  });

  it('rejects mixed current and legacy legal-version pairs', async () => {
    const {getRegistrationPolicyError} = await import('./auth');

    expect(getRegistrationPolicyError('student@tedu.edu.tr', {
      terms_accepted: true,
      privacy_acknowledged: true,
      terms_version: '2026-08-22',
      privacy_version: '2026-08-11',
    })).toBe('You must accept the Terms of Use and acknowledge the Privacy Notice');
  });

  it('rejects banned users during mobile login without revealing account status', async () => {
    const handler = mockRouteHandlers.post['/login'];
    const compare = vi.spyOn(bcrypt, 'compare');
    mockDbQuery.mockResolvedValueOnce({rows: []});

    await handler(createReq({email: 'student@tedu.edu.tr', password: 'password123'}), {});

    expect(mockDbQuery.mock.calls[0][0]).toContain('COALESCE(is_banned, FALSE) = FALSE');
    expect(mockSendError).toHaveBeenCalledWith({}, 'Invalid credentials', 401);
    expect(mockDbQuery).toHaveBeenCalledTimes(1);
    expect(compare).toHaveBeenCalledOnce();
  });

  it('uses the same password comparison path for a wrong password', async () => {
    const handler = mockRouteHandlers.post['/login'];
    const passwordHash = await bcrypt.hash('correct-password', 4);
    const compare = vi.spyOn(bcrypt, 'compare');
    mockDbQuery.mockResolvedValueOnce({rows: [{
      id: 'user-login',
      email: 'student@tedu.edu.tr',
      password_hash: passwordHash,
      role: 'user',
    }]});

    await handler(createReq({email: 'student@tedu.edu.tr', password: 'wrong-password'}), {});

    expect(mockSendError).toHaveBeenCalledWith({}, 'Invalid credentials', 401);
    expect(mockDbQuery).toHaveBeenCalledTimes(1);
    expect(compare).toHaveBeenCalledOnce();
  });

  it('returns the authoritative Gold balance after mobile login', async () => {
    const handler = mockRouteHandlers.post['/login'];
    const passwordHash = await bcrypt.hash('password123', 4);
    const baseUser = {
      id: 'user-login',
      email: 'student@tedu.edu.tr',
      password_hash: passwordHash,
      display_name: 'Student',
      role: 'user',
      is_guest: false,
    };
    mockTryAwardFirstLogin.mockResolvedValueOnce({awarded: true, amount: 25});
    mockDbQuery
      .mockResolvedValueOnce({rows: [baseUser]})
      .mockResolvedValueOnce({rows: []})
      .mockResolvedValueOnce({rows: [{...baseUser, gold_balance: 240}]})
      .mockResolvedValueOnce({rows: []});

    await handler(createReq({email: baseUser.email, password: 'password123'}), {});

    expect(mockSendSuccess.mock.calls[0][1].user).toEqual(
      expect.objectContaining({id: 'user-login', gold_balance: 240}),
    );
  });

  it('rejects refresh tokens signed with a non-contract HMAC algorithm', async () => {
    const handler = mockRouteHandlers.post['/refresh'];
    const {JWT_REFRESH_SECRET} = await import('./auth');
    const refreshToken = jwt.sign(
      {id: 'user-refresh', email: 'student@tedu.edu.tr', role: 'user'},
      JWT_REFRESH_SECRET,
      {algorithm: 'HS384', expiresIn: '1h'},
    );

    await handler(createReq({refresh_token: refreshToken}), {});

    expect(mockDbQuery).not.toHaveBeenCalled();
    expect(mockSendError).toHaveBeenCalledWith({}, 'Invalid refresh token', 401);
  });

  it('rejects refresh for a banned account and rolls back the rotation', async () => {
    const handler = mockRouteHandlers.post['/refresh'];
    const {
      createRefreshToken,
      getRefreshTokenHashInput,
    } = await import('./auth');
    const refreshToken = createRefreshToken('user-banned', 'student@tedu.edu.tr', 'user');
    const storedHash = `sha256:${await bcrypt.hash(getRefreshTokenHashInput(refreshToken), 4)}`;
    mockDbClientQuery
      .mockResolvedValueOnce({rows: []})
      .mockResolvedValueOnce({rows: [{id: 'user-banned'}]})
      .mockResolvedValueOnce({rows: [{id: 'refresh-1', token_hash: storedHash}]})
      .mockResolvedValueOnce({rows: []})
      .mockResolvedValueOnce({rows: []});

    await handler(createReq({refresh_token: refreshToken}), {});

    expect(mockDbClientQuery.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN',
      expect.stringContaining('SELECT id FROM users'),
      expect.stringContaining('FOR UPDATE'),
      expect.stringContaining('FROM users'),
      'ROLLBACK',
    ]);
    expect(mockDbClientRelease).toHaveBeenCalledOnce();
    expect(mockSendError).toHaveBeenCalledWith({}, 'Invalid or expired refresh token', 401);
  });

  it('returns authoritative account data after a successful refresh', async () => {
    const handler = mockRouteHandlers.post['/refresh'];
    const {
      createRefreshToken,
      getRefreshTokenHashInput,
    } = await import('./auth');
    const refreshToken = createRefreshToken('user-refresh', 'student@tedu.edu.tr', 'user');
    const storedHash = `sha256:${await bcrypt.hash(getRefreshTokenHashInput(refreshToken), 4)}`;
    const user = {
      id: 'user-refresh',
      email: 'student@tedu.edu.tr',
      display_name: 'Student',
      role: 'user',
      is_guest: false,
      gold_balance: 175,
    };
    mockDbClientQuery
      .mockResolvedValueOnce({rows: []})
      .mockResolvedValueOnce({rows: [{id: 'user-refresh'}]})
      .mockResolvedValueOnce({rows: [{id: 'refresh-2', token_hash: storedHash}]})
      .mockResolvedValueOnce({rows: [user]})
      .mockResolvedValueOnce({rows: [{id: 'refresh-2'}]})
      .mockResolvedValueOnce({rows: []})
      .mockResolvedValueOnce({rows: []});

    await handler(createReq({refresh_token: refreshToken}), {});

    expect(mockSendSuccess.mock.calls[0][1]).toEqual(expect.objectContaining({
      access_token: expect.any(String),
      refresh_token: expect.any(String),
      user: expect.objectContaining({id: 'user-refresh', gold_balance: 175}),
    }));
    expect(mockDbClientQuery.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN',
      expect.stringContaining('SELECT id FROM users'),
      expect.stringContaining('FOR UPDATE'),
      expect.stringContaining('FROM users'),
      expect.stringContaining('DELETE FROM refresh_tokens'),
      expect.stringContaining('INSERT INTO refresh_tokens'),
      'COMMIT',
    ]);
    expect(mockDbClientRelease).toHaveBeenCalledOnce();
  });

  it('keeps mobile logout idempotent while revoking a matching refresh token', async () => {
    const handler = mockRouteHandlers.post['/logout'];
    const {createRefreshToken, verifyRefreshToken} = await import('./auth');
    const refreshToken = createRefreshToken('user-logout', 'student@tedu.edu.tr', 'user');
    const sessionFamilyId = verifyRefreshToken(refreshToken).sid;
    mockDbClientQuery
      .mockResolvedValueOnce({rows: []})
      .mockResolvedValueOnce({rows: [{id: 'user-logout'}]})
      .mockResolvedValueOnce({rows: [{id: 'refresh-3'}]})
      .mockResolvedValueOnce({rows: [{id: 'refresh-3'}]})
      .mockResolvedValueOnce({rows: []});

    await handler(createReq({refresh_token: refreshToken}), {});

    expect(mockDbClientQuery.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN',
      expect.stringContaining('SELECT id FROM users'),
      expect.stringContaining('FROM refresh_tokens'),
      expect.stringContaining('DELETE FROM refresh_tokens'),
      'COMMIT',
    ]);
    expect(mockDbClientQuery.mock.calls[3][1]).toEqual(['user-logout', sessionFamilyId]);
    expect(mockDbClientRelease).toHaveBeenCalledOnce();
    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      {revoked: true},
      'Session logged out',
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
