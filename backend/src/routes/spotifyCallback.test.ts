import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockHandleCallback,
  mockHandleDeviceAuthCallback,
  mockGetAuthReturnOriginFromState,
  mockGetAuthUrl,
  mockIsDeviceAuthState,
  mockDbQuery,
} = vi.hoisted(() => ({
  mockHandleCallback: vi.fn(),
  mockHandleDeviceAuthCallback: vi.fn(),
  mockGetAuthReturnOriginFromState: vi.fn(),
  mockGetAuthUrl: vi.fn(),
  mockIsDeviceAuthState: vi.fn(),
  mockDbQuery: vi.fn(),
}));

vi.mock('../db', () => ({ db: { query: mockDbQuery } }));

vi.mock('../services/spotify', () => ({
  deriveSpotifyDeviceAuthRedirectUri: (redirectUri: string) => redirectUri,
  normalizeSpotifyReturnOrigin: (returnOrigin?: string | null) => {
    if (!returnOrigin) return null;
    try {
      return new URL(returnOrigin).origin;
    } catch {
      return null;
    }
  },
  spotifyService: {
    getAuthReturnOriginFromState: mockGetAuthReturnOriginFromState,
    getAuthUrl: mockGetAuthUrl,
    handleCallback: mockHandleCallback,
    handleDeviceAuthCallback: mockHandleDeviceAuthCallback,
    isDeviceAuthState: mockIsDeviceAuthState,
  },
}));

function createResponseDouble() {
  return {
    status: vi.fn().mockReturnThis(),
    redirect: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as any;
}

describe('spotify callback route', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockDbQuery.mockResolvedValue({ rows: [] });
    mockGetAuthUrl.mockImplementation(async (nonce: string) => `https://accounts.spotify.com/authorize?state=${encodeURIComponent(nonce)}`);
  });

  it('passes the admin return origin into the spotify auth start url', async () => {
    const spotifyRouteModule = await import('./spotify');
    const res = createResponseDouble();

    mockGetAuthUrl.mockResolvedValue('https://accounts.spotify.com/authorize?state=signed');

    await (spotifyRouteModule as any).handleSpotifyAuthStart(
      {
        query: {
          return_origin: 'http://127.0.0.1:5173/admin/dashboard',
        },
      } as any,
      res,
    );

    expect(mockGetAuthUrl).toHaveBeenCalledWith(
      expect.any(String),
      'http://127.0.0.1:5173',
      expect.any(String),
    );
    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO spotify_oauth_states'),
      [expect.any(String), 'http://127.0.0.1:5173', expect.any(String)]
    );
    expect(res.redirect).toHaveBeenCalledWith('https://accounts.spotify.com/authorize?state=signed');
  });

  it('posts admin auth success messages only to the signed return origin', async () => {
    const spotifyRouteModule = await import('./spotify');
    const res = createResponseDouble();

    mockIsDeviceAuthState.mockReturnValue(false);
    mockGetAuthReturnOriginFromState.mockResolvedValue('http://127.0.0.1:5173');
    mockDbQuery.mockResolvedValue({ rows: [{ return_origin: 'http://127.0.0.1:5173', code_verifier: 'pkce-verifier' }] });

    await (spotifyRouteModule as any).handleSpotifyAuthCallback(
      {
        query: {
          code: 'admin-auth-code',
          state: 'spotify.admin-nonce.aHR0cDovLzEyNy4wLjAuMTo1MTcz.signature',
        },
      } as any,
      res,
    );

    expect(mockGetAuthReturnOriginFromState).toHaveBeenCalledWith(
      'spotify.admin-nonce.aHR0cDovLzEyNy4wLjAuMTo1MTcz.signature'
    );
    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM spotify_oauth_states'),
      [expect.any(String)]
    );
    expect(mockHandleCallback).toHaveBeenCalledWith('admin-auth-code', undefined, 'pkce-verifier');
    expect(res.send).toHaveBeenCalledWith(
      expect.stringContaining(
        "window.opener.postMessage({ type: 'SPOTIFY_AUTH_SUCCESS' }, \"http://127.0.0.1:5173\");"
      )
    );
    expect(res.send).not.toHaveBeenCalledWith(
      expect.stringContaining("window.opener.postMessage({ type: 'SPOTIFY_AUTH_SUCCESS' }, '*');")
    );
  });

  it('does not emit wildcard postMessage for admin auth callbacks without a signed return origin', async () => {
    const spotifyRouteModule = await import('./spotify');
    const res = createResponseDouble();

    mockIsDeviceAuthState.mockReturnValue(false);
    mockGetAuthReturnOriginFromState.mockResolvedValue(null);
    mockDbQuery.mockResolvedValue({ rows: [{ return_origin: null, code_verifier: 'pkce-verifier' }] });

    await (spotifyRouteModule as any).handleSpotifyAuthCallback(
      {
        query: {
          code: 'admin-auth-code',
          state: 'legacy-state',
        },
      } as any,
      res,
    );

    expect(mockHandleCallback).toHaveBeenCalledWith('admin-auth-code', undefined, 'pkce-verifier');
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('Spotify Connected Successfully'));
    expect(res.send).not.toHaveBeenCalledWith(
      expect.stringContaining("window.opener.postMessage({ type: 'SPOTIFY_AUTH_SUCCESS' }, \"*\");")
    );
    expect(res.send).not.toHaveBeenCalledWith(
      expect.stringContaining("window.opener.postMessage({ type: 'SPOTIFY_AUTH_SUCCESS' }, '*');")
    );
  });

  it('rejects a missing, expired, or reused state before exchanging an auth code', async () => {
    const spotifyRouteModule = await import('./spotify');
    const res = createResponseDouble();

    mockIsDeviceAuthState.mockReturnValue(false);
    mockDbQuery.mockResolvedValue({ rows: [] });

    await (spotifyRouteModule as any).handleSpotifyAuthCallback(
      { query: { code: 'admin-auth-code', state: 'not-issued-here' } } as any,
      res,
    );

    expect(mockHandleCallback).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('routes device-scoped auth callbacks through the main spotify callback endpoint', async () => {
    const spotifyRouteModule = await import('./spotify');
    const res = createResponseDouble();

    mockHandleDeviceAuthCallback.mockResolvedValue({
      deviceId: 'device-1',
      spotifyDisplayName: 'Kiosk Device',
      returnOrigin: 'http://127.0.0.1:5173',
    });
    mockIsDeviceAuthState.mockReturnValue(true);

    await (spotifyRouteModule as any).handleSpotifyAuthCallback(
      {
        query: {
          code: 'device-auth-code',
          state: 'device.device-1.nonce.signature',
        },
      } as any,
      res,
    );

    expect(mockHandleDeviceAuthCallback).toHaveBeenCalledWith(
      'device-auth-code',
      'device.device-1.nonce.signature',
      undefined
    );
    expect(mockHandleCallback).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith(
      expect.stringContaining(
        "window.opener.postMessage({ type: 'SPOTIFY_DEVICE_AUTH_SUCCESS', deviceId: \"device-1\" }, \"http://127.0.0.1:5173\");"
      )
    );
  });
});
