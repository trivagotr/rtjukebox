import { beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const {
  mockClientQuery,
  mockClientRelease,
  mockDbQuery,
  mockPoolConnect,
  mockRouteHandlers,
  mockRouter,
  mockSendError,
  mockSendSuccess,
} = vi.hoisted(() => {
  const handlers: Record<string, Record<string, (...args: any[]) => any>> = {
    delete: {},
    get: {},
    post: {},
  };

  const router: any = {};
  for (const method of ['delete', 'get', 'post'] as const) {
    router[method] = vi.fn(
      (path: string, ...routeHandlers: Array<(...args: any[]) => any>) => {
        handlers[method][path] = routeHandlers[routeHandlers.length - 1];
        return router;
      },
    );
  }

  const clientQuery = vi.fn();
  const clientRelease = vi.fn();

  return {
    mockClientQuery: clientQuery,
    mockClientRelease: clientRelease,
    mockDbQuery: vi.fn(),
    mockPoolConnect: vi.fn().mockResolvedValue({
      query: clientQuery,
      release: clientRelease,
    }),
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
    pool: {
      connect: mockPoolConnect,
    },
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

function createReq(
  body: Record<string, unknown> = {},
  user?: { id: string; email: string; role: string },
) {
  return {
    body,
    headers: {
      'user-agent': 'vitest',
    },
    ip: '127.0.0.1',
    user,
  };
}

describe('auth account lifecycle routes', () => {
  beforeEach(() => {
    mockClientQuery.mockReset();
    mockClientRelease.mockReset();
    mockDbQuery.mockReset();
    mockPoolConnect.mockClear();
    mockSendError.mockReset();
    mockSendSuccess.mockReset();
  });

  it('registers separate logout, logout-all, and account deletion routes', () => {
    expect(mockRouteHandlers.post['/logout']).toBeTypeOf('function');
    expect(mockRouteHandlers.post['/logout-all']).toBeTypeOf('function');
    expect(mockRouteHandlers.delete['/account']).toBeTypeOf('function');
  });

  it('revokes only the matching refresh-token session', async () => {
    const handler = mockRouteHandlers.post['/logout'];
    const refreshToken = jwt.sign(
      { id: 'user-1', email: 'student@gmail.com', role: 'user' },
      'test-refresh-secret-key',
      { expiresIn: '7d' },
    );
    const otherHash = await bcrypt.hash('another-token', 4);
    const matchingHash = await bcrypt.hash(refreshToken, 4);

    mockDbQuery
      .mockResolvedValueOnce({
        rows: [
          { id: 'session-1', token_hash: otherHash },
          { id: 'session-2', token_hash: matchingHash },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    await handler(createReq({ refresh_token: refreshToken }), {});

    expect(mockDbQuery.mock.calls[1][0]).toContain('DELETE FROM refresh_tokens');
    expect(mockDbQuery.mock.calls[1][1]).toEqual(['session-2', 'user-1']);
    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      { revoked: true },
      'Session logged out',
    );
  });

  it('treats an invalid or already-revoked refresh token as a successful logout', async () => {
    const handler = mockRouteHandlers.post['/logout'];

    await handler(createReq({ refresh_token: 'not-a-valid-token' }), {});

    expect(mockDbQuery).not.toHaveBeenCalled();
    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      { revoked: true },
      'Session logged out',
    );
  });

  it('revokes every refresh-token session for the authenticated account', async () => {
    const handler = mockRouteHandlers.post['/logout-all'];
    mockDbQuery.mockResolvedValueOnce({ rowCount: 3, rows: [] });

    await handler(
      createReq({}, { id: 'user-1', email: 'student@gmail.com', role: 'user' }),
      {},
    );

    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM refresh_tokens'),
      ['user-1'],
    );
    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      { revoked_sessions: 3 },
      'All sessions logged out',
    );
  });

  it('requires explicit DELETE confirmation before deleting an account', async () => {
    const handler = mockRouteHandlers.delete['/account'];

    await handler(
      createReq({}, { id: 'user-1', email: 'student@gmail.com', role: 'user' }),
      {},
    );

    expect(mockPoolConnect).not.toHaveBeenCalled();
    expect(mockSendError).toHaveBeenCalledWith(
      {},
      'Type DELETE to confirm account deletion',
      400,
    );
  });

  it('requires the current password for a registered account and deletes atomically', async () => {
    const handler = mockRouteHandlers.delete['/account'];
    const passwordHash = await bcrypt.hash('correct-password', 4);
    mockClientQuery
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [{ id: 'user-1', is_guest: false, password_hash: passwordHash }],
      })
      .mockResolvedValueOnce({ rowCount: 2, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'user-1' }] })
      .mockResolvedValueOnce(undefined);

    await handler(
      createReq(
        { confirmation: 'DELETE', password: 'correct-password' },
        { id: 'user-1', email: 'student@gmail.com', role: 'user' },
      ),
      {},
    );

    expect(mockClientQuery.mock.calls.map(([sql]) => String(sql).trim())).toEqual([
      'BEGIN',
      expect.stringContaining('FOR UPDATE'),
      expect.stringContaining('DELETE FROM refresh_tokens'),
      expect.stringContaining('DELETE FROM users'),
      'COMMIT',
    ]);
    expect(mockClientRelease).toHaveBeenCalledOnce();
    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      { deleted: true },
      'Account deleted',
    );
  });

  it('rolls back registered-account deletion when the current password is wrong', async () => {
    const handler = mockRouteHandlers.delete['/account'];
    const passwordHash = await bcrypt.hash('correct-password', 4);
    mockClientQuery
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [{ id: 'user-1', is_guest: false, password_hash: passwordHash }],
      })
      .mockResolvedValueOnce(undefined);

    await handler(
      createReq(
        { confirmation: 'DELETE', password: 'wrong-password' },
        { id: 'user-1', email: 'student@gmail.com', role: 'user' },
      ),
      {},
    );

    expect(mockClientQuery.mock.calls.map(([sql]) => String(sql).trim())).toEqual([
      'BEGIN',
      expect.stringContaining('FOR UPDATE'),
      'ROLLBACK',
    ]);
    expect(mockClientRelease).toHaveBeenCalledOnce();
    expect(mockSendError).toHaveBeenCalledWith(
      {},
      'Current password is incorrect',
      401,
    );
    expect(mockSendSuccess).not.toHaveBeenCalled();
  });

  it('allows a confirmed guest account to delete without a password', async () => {
    const handler = mockRouteHandlers.delete['/account'];
    mockClientQuery
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [{ id: 'guest-1', is_guest: true, password_hash: null }],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'guest-1' }] })
      .mockResolvedValueOnce(undefined);

    await handler(
      createReq(
        { confirmation: 'DELETE' },
        { id: 'guest-1', email: 'guest@radiotedu.internal', role: 'guest' },
      ),
      {},
    );

    expect(mockSendError).not.toHaveBeenCalled();
    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      { deleted: true },
      'Account deleted',
    );
  });
});
