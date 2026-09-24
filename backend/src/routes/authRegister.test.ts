import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDbQuery,
  mockDbTransaction,
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
    mockDbTransaction: vi.fn(),
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
    transaction: mockDbTransaction,
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
  validateAvatarUpload: vi.fn(),
}));

vi.mock('../utils/response', () => ({
  sendError: mockSendError,
  sendSuccess: mockSendSuccess,
}));

import './auth';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

function createReq(body: Record<string, unknown>) {
  return {
    body,
    headers: {
      'user-agent': 'vitest',
    },
    ip: '127.0.0.1',
    query: {},
  };
}

describe('auth registration routes', () => {
  beforeEach(() => {
    mockDbQuery.mockReset();
    mockDbTransaction.mockReset().mockImplementation((work: (client: { query: typeof mockDbQuery }) => unknown) => work({ query: mockDbQuery }));
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

  it('applies an account lock after the fifth failed login attempt', async () => {
    const handler = mockRouteHandlers.post['/login'];
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: 'user-id', email: 'student@gmail.com', password_hash: 'not-a-bcrypt-hash' }] })
      .mockResolvedValueOnce({ rows: [{ locked: false }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ locked: true }] });

    await handler(createReq({ email: 'student@gmail.com', password: 'wrong-password' }), {});

    expect(mockDbQuery.mock.calls[2][0]).toContain('DELETE FROM auth_login_attempts');
    expect(mockDbQuery.mock.calls[3][0]).toContain('INSERT INTO auth_login_attempts');
    expect(mockSendError).toHaveBeenCalledWith(expect.anything(), 'Invalid credentials', 429, 'LOGIN_TEMPORARILY_LOCKED');
  });

  it('rotates a refresh token inside one database transaction', async () => {
    const handler = mockRouteHandlers.post['/refresh'];
    const userId = '00000000-0000-4000-8000-000000000001';
    const refreshToken = jwt.sign(
      { id: userId, email: 'student@gmail.com', role: 'user' },
      'test-refresh-secret-key',
      { algorithm: 'HS256', expiresIn: '1h' },
    );
    const storedHash = await bcrypt.hash(refreshToken, 4);
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: 'refresh-row', token_hash: storedHash }] })
      .mockResolvedValueOnce({ rows: [{ id: 'refresh-row' }] })
      .mockResolvedValueOnce({ rows: [] });

    await handler(createReq({ refresh_token: refreshToken }), {});

    expect(mockDbTransaction).toHaveBeenCalledOnce();
    expect(mockDbQuery.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(mockDbQuery.mock.calls[1][0]).toContain('DELETE FROM refresh_tokens');
    expect(mockDbQuery.mock.calls[2][0]).toContain('INSERT INTO refresh_tokens');
    expect(mockSendSuccess.mock.calls[0][1]).toEqual(expect.objectContaining({
      access_token: expect.any(String),
      refresh_token: expect.any(String),
    }));
  });

  it('revokes all remaining refresh sessions when a signed token is reused', async () => {
    const handler = mockRouteHandlers.post['/refresh'];
    const userId = '00000000-0000-4000-8000-000000000001';
    const refreshToken = jwt.sign(
      { id: userId, email: 'student@gmail.com', role: 'user' },
      'test-refresh-secret-key',
      { algorithm: 'HS256', expiresIn: '1h' },
    );
    mockDbQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await handler(createReq({ refresh_token: refreshToken }), {});

    expect(mockDbTransaction).toHaveBeenCalledOnce();
    expect(mockDbQuery.mock.calls[1][0]).toBe('DELETE FROM refresh_tokens WHERE user_id = $1');
    expect(mockSendError).toHaveBeenCalledWith(expect.anything(), 'Invalid or expired refresh token', 401);
  });
});
