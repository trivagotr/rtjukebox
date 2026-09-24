import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDbQuery } = vi.hoisted(() => ({
  mockDbQuery: vi.fn(),
}));

vi.mock('../db', () => ({
  db: {
    query: mockDbQuery,
    pool: {},
  },
}));

let spotifyRoutes: typeof import('./spotify');
let spotifyServiceModule: typeof import('../services/spotify');
const DEVICE_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_DEVICE_ID = '00000000-0000-4000-8000-000000000002';

function createMockRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    redirect: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  } as any;
}

beforeAll(async () => {
  process.env.SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || 'test-client';
  process.env.SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || 'test-secret';
  process.env.SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || 'http://127.0.0.1:3000/api/v1/spotify/callback';

  spotifyRoutes = await import('./spotify');
  spotifyServiceModule = await import('../services/spotify');
});

beforeEach(() => {
  mockDbQuery.mockReset();
  vi.restoreAllMocks();
});

describe('device spotify auth routes', () => {
  it('rejects device auth start when the device is missing', async () => {
    const res = createMockRes();
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    await spotifyRoutes.handleSpotifyDeviceAuthStart(
      { body: { device_id: DEVICE_ID }, query: {} } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Device not found',
      code: undefined,
    });
  });

  it('returns the authorization url only after validating the device', async () => {
    const res = createMockRes();
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: DEVICE_ID }] });
    vi.spyOn(spotifyServiceModule.spotifyService, 'getDeviceAuthStartUrl').mockResolvedValue(
      'https://accounts.spotify.com/authorize?state=device-state'
    );

    await spotifyRoutes.handleSpotifyDeviceAuthStart(
      { body: { device_id: DEVICE_ID }, query: {} } as any,
      res,
    );

    expect(spotifyServiceModule.spotifyService.getDeviceAuthStartUrl).toHaveBeenCalledWith(DEVICE_ID, null);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: { authUrl: 'https://accounts.spotify.com/authorize?state=device-state' },
    }));
  });

  it('returns a json auth url for authenticated frontend requests', async () => {
    const res = createMockRes();
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: DEVICE_ID }] });
    vi.spyOn(spotifyServiceModule.spotifyService, 'getDeviceAuthStartUrl').mockResolvedValue(
      'https://accounts.spotify.com/authorize?state=device-state'
    );

    await spotifyRoutes.handleSpotifyDeviceAuthStart(
      { body: { device_id: DEVICE_ID }, query: {} } as any,
      res,
    );

    expect(spotifyServiceModule.spotifyService.getDeviceAuthStartUrl).toHaveBeenCalledWith(DEVICE_ID, null);
    expect(res.redirect).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        authUrl: 'https://accounts.spotify.com/authorize?state=device-state',
      }),
    }));
  });

  it('passes the frontend return origin into the signed device auth start url', async () => {
    const res = createMockRes();
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 'device-1' }] });
    vi.spyOn(spotifyServiceModule.spotifyService, 'getDeviceAuthStartUrl').mockResolvedValue(
      'https://accounts.spotify.com/authorize?state=device-state'
    );

    await spotifyRoutes.handleSpotifyDeviceAuthStart(
      {
        body: {
        device_id: DEVICE_ID,
        return_origin: 'http://127.0.0.1:5173',
      },
      query: {},
      } as any,
      res,
    );

    expect(spotifyServiceModule.spotifyService.getDeviceAuthStartUrl).toHaveBeenCalledWith(
      DEVICE_ID,
      'http://127.0.0.1:5173',
    );
  });

  it('binds the callback through the device auth handler using the oauth state', async () => {
    const res = createMockRes();
    vi.spyOn(spotifyServiceModule.spotifyService, 'handleDeviceAuthCallback').mockResolvedValue({
      deviceId: DEVICE_ID,
      spotifyAccountId: 'spotify-user-1',
      spotifyDisplayName: 'Kiosk Device',
      spotifyEmail: 'kiosk@example.com',
      spotifyProduct: 'premium',
      tokenExpiresAt: new Date('2026-04-03T12:00:00.000Z'),
      scopes: 'streaming user-modify-playback-state',
    });

    await spotifyRoutes.handleSpotifyDeviceAuthCallback(
      { query: { code: 'auth-code', state: 'signed-device-state' } } as any,
      res,
    );

    expect(spotifyServiceModule.spotifyService.handleDeviceAuthCallback).toHaveBeenCalledWith(
      'auth-code',
      'signed-device-state',
      expect.stringContaining('/api/v1/spotify/device-auth/callback'),
    );
    expect(res.send).toHaveBeenCalled();
  });

  it('posts device auth success messages only to the signed return origin', async () => {
    const res = createMockRes();
    vi.spyOn(spotifyServiceModule.spotifyService, 'handleDeviceAuthCallback').mockResolvedValue({
        deviceId: DEVICE_ID,
      connected: true,
      spotifyAccountId: 'spotify-user-1',
      spotifyDisplayName: 'Kiosk Device',
      spotifyEmail: 'kiosk@example.com',
      spotifyProduct: 'premium',
      spotifyCountry: 'TR',
      tokenExpiresAt: new Date('2026-04-03T12:00:00.000Z'),
      scopes: 'streaming user-modify-playback-state',
      hasRefreshToken: true,
      returnOrigin: 'http://127.0.0.1:5173',
    });

    await spotifyRoutes.handleSpotifyDeviceAuthCallback(
      { query: { code: 'auth-code', state: 'signed-device-state' } } as any,
      res,
    );

    const [html] = res.send.mock.calls[0];
    expect(html).toContain(`window.opener.postMessage({ type: 'SPOTIFY_DEVICE_AUTH_SUCCESS', deviceId: "${DEVICE_ID}" }, "http://127.0.0.1:5173")`);
    expect(html).not.toContain("}, '*')");
  });

  it('escapes malicious display names in the device auth success response', async () => {
    const res = createMockRes();
    const maliciousDisplayName = '<img src=x onerror=alert(1)>';

    vi.spyOn(spotifyServiceModule.spotifyService, 'handleDeviceAuthCallback').mockResolvedValue({
      deviceId: 'device-1',
      spotifyAccountId: 'spotify-user-1',
      spotifyDisplayName: maliciousDisplayName,
      spotifyEmail: 'kiosk@example.com',
      spotifyProduct: 'premium',
      tokenExpiresAt: new Date('2026-04-03T12:00:00.000Z'),
      scopes: 'streaming user-modify-playback-state',
    });

    await spotifyRoutes.handleSpotifyDeviceAuthCallback(
      { query: { code: 'auth-code', state: 'signed-device-state' } } as any,
      res,
    );

    const [html] = res.send.mock.calls[0];
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain(maliciousDisplayName);
  });

  it('returns connected account metadata from the device auth status endpoint', async () => {
    const res = createMockRes();
    vi.spyOn(spotifyServiceModule.spotifyService, 'getDeviceAuthStatus').mockResolvedValue({
      deviceId: DEVICE_ID,
      connected: true,
      spotifyAccountId: 'spotify-user-1',
      spotifyDisplayName: 'Kiosk Device',
      spotifyEmail: 'kiosk@example.com',
      spotifyProduct: 'premium',
      tokenExpiresAt: new Date('2026-04-03T12:00:00.000Z'),
      scopes: 'streaming user-modify-playback-state',
      hasRefreshToken: true,
    });

    await spotifyRoutes.handleSpotifyDeviceAuthStatus(
      { query: { device_id: DEVICE_ID } } as any,
      res,
    );

    expect(spotifyServiceModule.spotifyService.getDeviceAuthStatus).toHaveBeenCalledWith(DEVICE_ID);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        deviceId: DEVICE_ID,
        connected: true,
        spotifyAccountId: 'spotify-user-1',
      }),
    }));
  });

  it('rejects unexpected query fields on device auth disconnect', async () => {
    const res = createMockRes();
    vi.spyOn(spotifyServiceModule.spotifyService, 'deleteDeviceAuth').mockResolvedValue(undefined);

    await spotifyRoutes.handleSpotifyDeviceAuthDelete(
      { params: { deviceId: DEVICE_ID }, query: { device_id: OTHER_DEVICE_ID } } as any,
      res,
    );

    expect(spotifyServiceModule.spotifyService.deleteDeviceAuth).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: 'Invalid Spotify device ID',
    }));
  });
});
