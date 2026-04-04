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
      { query: { device_id: 'device-missing' } } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Device not found',
      code: undefined,
    });
  });

  it('redirects device auth start only after validating the device', async () => {
    const res = createMockRes();
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 'device-1' }] });
    vi.spyOn(spotifyServiceModule.spotifyService, 'getDeviceAuthStartUrl').mockResolvedValue(
      'https://accounts.spotify.com/authorize?state=device-state'
    );

    await spotifyRoutes.handleSpotifyDeviceAuthStart(
      { query: { device_id: 'device-1' } } as any,
      res,
    );

    expect(spotifyServiceModule.spotifyService.getDeviceAuthStartUrl).toHaveBeenCalledWith('device-1');
    expect(res.redirect).toHaveBeenCalledWith('https://accounts.spotify.com/authorize?state=device-state');
  });

  it('returns a json auth url for authenticated frontend requests', async () => {
    const res = createMockRes();
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 'device-1' }] });
    vi.spyOn(spotifyServiceModule.spotifyService, 'getDeviceAuthStartUrl').mockResolvedValue(
      'https://accounts.spotify.com/authorize?state=device-state'
    );

    await spotifyRoutes.handleSpotifyDeviceAuthStart(
      { query: { device_id: 'device-1', format: 'json' } } as any,
      res,
    );

    expect(spotifyServiceModule.spotifyService.getDeviceAuthStartUrl).toHaveBeenCalledWith('device-1');
    expect(res.redirect).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        authUrl: 'https://accounts.spotify.com/authorize?state=device-state',
      }),
    }));
  });

  it('binds the callback through the device auth handler using the oauth state', async () => {
    const res = createMockRes();
    vi.spyOn(spotifyServiceModule.spotifyService, 'handleDeviceAuthCallback').mockResolvedValue({
      deviceId: 'device-1',
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
      deviceId: 'device-1',
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
      { query: { device_id: 'device-1' } } as any,
      res,
    );

    expect(spotifyServiceModule.spotifyService.getDeviceAuthStatus).toHaveBeenCalledWith('device-1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        deviceId: 'device-1',
        connected: true,
        spotifyAccountId: 'spotify-user-1',
      }),
    }));
  });

  it('disconnects the path device auth row even if query contains another device id', async () => {
    const res = createMockRes();
    vi.spyOn(spotifyServiceModule.spotifyService, 'deleteDeviceAuth').mockResolvedValue(undefined);

    await spotifyRoutes.handleSpotifyDeviceAuthDelete(
      { params: { deviceId: 'device-1' }, query: { device_id: 'device-2' } } as any,
      res,
    );

    expect(spotifyServiceModule.spotifyService.deleteDeviceAuth).toHaveBeenCalledWith('device-1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ deviceId: 'device-1' }),
    }));
  });
});
