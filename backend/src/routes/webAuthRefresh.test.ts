import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const postHandlers: Record<string, (...args: any[]) => any> = {};
  const router: any = {
    get: vi.fn(() => router),
    post: vi.fn((path: string, ...handlers: Array<(...args: any[]) => any>) => {
      postHandlers[path] = handlers.at(-1)!;
      return router;
    }),
    use: vi.fn(() => router),
  };
  return {
    postHandlers,
    router,
    rotate: vi.fn(),
    verifyRefreshToken: vi.fn(),
    getWebRefreshToken: vi.fn(),
    setWebSessionCookies: vi.fn(),
    clearWebSessionCookies: vi.fn(),
    revokeFamily: vi.fn(),
    revokeRefresh: vi.fn(),
    disconnectSessionFamilySockets: vi.fn(),
    sendError: vi.fn(),
    sendSuccess: vi.fn(),
  };
});

vi.mock('express', () => ({ Router: vi.fn(() => mocks.router) }));
vi.mock('../db', () => ({ db: { query: vi.fn() } }));
vi.mock('./auth', () => ({
  createAuthSession: vi.fn(),
  createAuthRateLimiter: vi.fn(() => vi.fn()),
  findRefreshTokenSession: vi.fn(),
  getRegistrationPolicyError: vi.fn(),
  isAllowedRegistrationEmail: vi.fn(),
  isTeduInstitutionEmail: vi.fn(),
  loadAuthSessionUser: vi.fn(),
  mapAuthSessionUser: vi.fn(),
  normalizeDisplayNameInput: vi.fn(),
  REGISTRATION_PRIVACY_VERSION: '2026-08-22',
  REGISTRATION_TERMS_VERSION: '2026-08-22',
  revokeAuthSessionFamily: mocks.revokeFamily,
  revokeRefreshTokenSession: mocks.revokeRefresh,
  rotateRefreshTokenSession: mocks.rotate,
  verifyAccountPassword: vi.fn(),
  verifyRefreshToken: mocks.verifyRefreshToken,
}));
vi.mock('../services/webSession', () => ({
  clearWebSessionCookies: mocks.clearWebSessionCookies,
  ensureWebCsrfCookie: vi.fn(),
  getWebRefreshToken: mocks.getWebRefreshToken,
  requireTrustedWebOrigin: vi.fn(),
  requireWebCsrf: vi.fn(),
  setAuthNoStore: vi.fn(),
  setWebSessionCookies: mocks.setWebSessionCookies,
  webAuthMiddleware: vi.fn(),
}));
vi.mock('../utils/response', () => ({
  sendError: mocks.sendError,
  sendSuccess: mocks.sendSuccess,
}));
vi.mock('../services/erpIdentity', () => ({ hashOpaqueToken: vi.fn() }));
vi.mock('../services/economy', () => ({ tryAwardFirstLogin: vi.fn() }));
vi.mock('../socket', () => ({
  disconnectSessionFamilySockets: mocks.disconnectSessionFamilySockets,
}));

import './webAuth';

describe('web refresh route atomic rotation wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWebRefreshToken.mockReturnValue('refresh-token');
    mocks.verifyRefreshToken.mockReturnValue({
      id: 'user-refresh',
      email: 'student@tedu.edu.tr',
      role: 'user',
    });
  });

  it('sets the existing secure web cookies only after a committed rotation', async () => {
    const tokens = { access_token: 'access', refresh_token: 'replacement' };
    mocks.rotate.mockResolvedValue({
      status: 'rotated',
      tokens,
      user: { id: 'user-refresh' },
    });
    mocks.setWebSessionCookies.mockReturnValue('csrf-token');

    await mocks.postHandlers['/refresh']({}, {});

    expect(mocks.rotate).toHaveBeenCalledWith('refresh-token', 'user-refresh');
    expect(mocks.setWebSessionCookies).toHaveBeenCalledWith({}, tokens);
    expect(mocks.sendSuccess).toHaveBeenCalledWith(
      {},
      { refreshed: true, csrf_token: 'csrf-token' },
      'Session refreshed',
    );
    expect(mocks.clearWebSessionCookies).not.toHaveBeenCalled();
  });

  it('preserves the invalid-session response without issuing replacement cookies', async () => {
    mocks.rotate.mockResolvedValue({ status: 'invalid' });

    await mocks.postHandlers['/refresh']({}, {});

    expect(mocks.setWebSessionCookies).not.toHaveBeenCalled();
    expect(mocks.clearWebSessionCookies).not.toHaveBeenCalled();
    expect(mocks.sendError).toHaveBeenCalledWith(
      {},
      'Invalid or expired refresh token',
      401,
    );
  });

  it('clears stale cookies when the locked account is unavailable', async () => {
    mocks.rotate.mockResolvedValue({ status: 'user-unavailable' });

    await mocks.postHandlers['/refresh']({}, {});

    expect(mocks.clearWebSessionCookies).toHaveBeenCalledWith({});
    expect(mocks.setWebSessionCookies).not.toHaveBeenCalled();
    expect(mocks.sendError).toHaveBeenCalledWith(
      {},
      'Invalid or expired refresh token',
      401,
    );
  });

  it('revokes the authenticated web session family before clearing cookies', async () => {
    const sid = '33333333-3333-4333-8333-333333333333';
    mocks.revokeFamily.mockResolvedValue({ sessionFamilyId: sid });

    await mocks.postHandlers['/logout']({
      user: { id: 'user-refresh', email: 'student@tedu.edu.tr', role: 'user', sid },
    }, {});

    expect(mocks.revokeFamily).toHaveBeenCalledWith('user-refresh', sid);
    expect(mocks.getWebRefreshToken).not.toHaveBeenCalled();
    expect(mocks.disconnectSessionFamilySockets).toHaveBeenCalledWith(sid);
    expect(mocks.clearWebSessionCookies).toHaveBeenCalledWith({});
    expect(mocks.sendSuccess).toHaveBeenCalledWith(
      {},
      { revoked: true },
      'Session logged out',
    );
  });
});
