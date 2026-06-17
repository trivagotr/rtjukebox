import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';

const { mockDbQuery } = vi.hoisted(() => ({
  mockDbQuery: vi.fn(),
}));

vi.mock('../db', () => ({
  db: {
    query: mockDbQuery,
    pool: {},
  },
}));

let jukeboxModule: typeof import('./jukebox');
let spotifyServiceModule: typeof import('../services/spotify');

function createMockRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as any;
}

async function createJukeboxRouterServer() {
  const app = express();
  app.use(express.json());
  app.use(jukeboxModule.default);

  const server = await new Promise<import('http').Server>((resolve) => {
    const listeningServer = app.listen(0, () => resolve(listeningServer));
  });
  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

beforeAll(async () => {
  process.env.SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || 'test-client';
  process.env.SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || 'test-secret';
  process.env.SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || 'http://127.0.0.1:3000/api/v1/spotify/callback';
  jukeboxModule = await import('./jukebox');
  spotifyServiceModule = await import('../services/spotify');
});

beforeEach(() => {
  mockDbQuery.mockReset();
  vi.restoreAllMocks();
});

describe('jukebox spotify kiosk routes', () => {
  it('rejects missing device_id when requesting a kiosk spotify token', async () => {
    const res = createMockRes();

    await jukeboxModule.handleSpotifyKioskTokenRequest(
      { query: {} } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Missing device_id',
      code: undefined,
    });
  });

  it('returns 503 when the current device has no spotify auth', async () => {
    const res = createMockRes();
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 'device-1', password: null, is_active: true }] });
    vi.spyOn(spotifyServiceModule.spotifyService, 'getKioskPlaybackToken').mockRejectedValue(
      new Error('No Spotify authorization found for device')
    );

    await jukeboxModule.handleSpotifyKioskTokenRequest(
      { query: { device_id: 'device-1' } } as any,
      res,
    );

    expect(spotifyServiceModule.spotifyService.getKioskPlaybackToken).toHaveBeenCalledWith('device-1');
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'No Spotify authorization found for device',
      code: undefined,
    });
  });

  it('returns 503 when the current device spotify auth has expired', async () => {
    const res = createMockRes();
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 'device-1', password: null, is_active: true }] });
    vi.spyOn(spotifyServiceModule.spotifyService, 'getKioskPlaybackToken').mockRejectedValue(
      new Error('Spotify authorization expired for device. Please reconnect Spotify for this kiosk.')
    );

    await jukeboxModule.handleSpotifyKioskTokenRequest(
      { query: { device_id: 'device-1' } } as any,
      res,
    );

    expect(spotifyServiceModule.spotifyService.getKioskPlaybackToken).toHaveBeenCalledWith('device-1');
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Spotify authorization expired for device. Please reconnect Spotify for this kiosk.',
      code: undefined,
    });
  });

  it('returns 503 when the current device spotify account cannot play in the kiosk', async () => {
    const res = createMockRes();
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 'device-1', password: null, is_active: true }] });
    vi.spyOn(spotifyServiceModule.spotifyService, 'getKioskPlaybackToken').mockRejectedValue(
      new Error('Spotify Premium hesabı gerekli')
    );

    await jukeboxModule.handleSpotifyKioskTokenRequest(
      { query: { device_id: 'device-1' } } as any,
      res,
    );

    expect(spotifyServiceModule.spotifyService.getKioskPlaybackToken).toHaveBeenCalledWith('device-1');
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Spotify Premium hesabı gerekli',
      code: undefined,
    });
  });

  it('returns 503 when the current device spotify connection must be refreshed by reconnecting', async () => {
    const res = createMockRes();
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 'device-1', password: null, is_active: true }] });
    vi.spyOn(spotifyServiceModule.spotifyService, 'getKioskPlaybackToken').mockRejectedValue(
      new Error('Spotify bağlantısı gerekli')
    );

    await jukeboxModule.handleSpotifyKioskTokenRequest(
      { query: { device_id: 'device-1' } } as any,
      res,
    );

    expect(spotifyServiceModule.spotifyService.getKioskPlaybackToken).toHaveBeenCalledWith('device-1');
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Spotify bağlantısı gerekli',
      code: undefined,
    });
  });

  it('rejects missing device credentials when requesting a kiosk spotify token for a protected device', async () => {
    const res = createMockRes();
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 'device-1', password: 'secret' }] });
    const getKioskPlaybackToken = vi.spyOn(spotifyServiceModule.spotifyService, 'getKioskPlaybackToken');

    await jukeboxModule.handleSpotifyKioskTokenRequest(
      { query: { device_id: 'device-1' } } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid device password',
      code: undefined,
    });
    expect(getKioskPlaybackToken).not.toHaveBeenCalled();
  });

  it('returns the kiosk spotify token for a registered device', async () => {
    const res = createMockRes();
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: 'device-1', password: 'secret', is_active: true }] })
      .mockResolvedValueOnce({
        rows: [
          {
            device_id: 'device-1',
            access_token: 'kiosk-access-token',
            refresh_token: 'refresh-token',
            token_expires_at: new Date('2026-04-03T11:00:00.000Z'),
            scopes: 'streaming user-modify-playback-state user-read-playback-state',
          },
        ],
      });

    vi.spyOn(spotifyServiceModule.spotifyService, 'getKioskPlaybackToken').mockResolvedValue({
      accessToken: 'kiosk-access-token',
      tokenExpiresAt: new Date('2026-04-03T11:00:00.000Z'),
      scopes: 'streaming user-modify-playback-state user-read-playback-state',
    });

    await jukeboxModule.handleSpotifyKioskTokenRequest(
      { body: { device_id: 'device-1', device_pwd: 'secret' } } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        device_id: 'device-1',
        access_token: 'kiosk-access-token',
        token_expires_at: '2026-04-03T11:00:00.000Z',
        scopes: 'streaming user-modify-playback-state user-read-playback-state',
      },
      message: 'Spotify kiosk token ready',
      meta: undefined,
    });

    expect(spotifyServiceModule.spotifyService.getKioskPlaybackToken).toHaveBeenCalledWith('device-1');
  });

  it('accepts kiosk spotify token requests through the POST router endpoint used by the kiosk app', async () => {
    const server = await createJukeboxRouterServer();
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 'device-1', password: 'secret', is_active: true }] });
    vi.spyOn(spotifyServiceModule.spotifyService, 'getKioskPlaybackToken').mockResolvedValue({
      accessToken: 'kiosk-access-token',
      tokenExpiresAt: new Date('2026-04-03T11:00:00.000Z'),
      scopes: 'streaming user-modify-playback-state user-read-playback-state',
    });

    try {
      const response = await fetch(`${server.baseUrl}/kiosk/spotify-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: 'device-1', device_pwd: 'secret' }),
      });
      const payload = response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : await response.text();

      expect(response.status).toBe(200);
      expect(payload).toEqual({
        success: true,
        data: {
          device_id: 'device-1',
          access_token: 'kiosk-access-token',
          token_expires_at: '2026-04-03T11:00:00.000Z',
          scopes: 'streaming user-modify-playback-state user-read-playback-state',
        },
        message: 'Spotify kiosk token ready',
      });
      expect(spotifyServiceModule.spotifyService.getKioskPlaybackToken).toHaveBeenCalledWith('device-1');
    } finally {
      await server.close();
    }
  });

  it('rejects invalid device credentials when requesting kiosk spotify auth status', async () => {
    const res = createMockRes();
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 'device-1', password: 'secret' }] });

    await jukeboxModule.handleSpotifyKioskDeviceAuthStatusRequest(
      { body: { device_id: 'device-1', device_pwd: 'wrong' } } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid device password',
      code: undefined,
    });
  });

  it('returns spotify auth status for a kiosk device with valid credentials', async () => {
    const res = createMockRes();
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: 'device-1', password: 'secret' }] });

    vi.spyOn(spotifyServiceModule.spotifyService, 'getDeviceAuthStatus').mockResolvedValue({
      deviceId: 'device-1',
      connected: true,
      spotifyAccountId: 'spotify-user-1',
      spotifyDisplayName: 'Kiosk Device',
      spotifyEmail: 'kiosk@example.com',
      spotifyProduct: 'premium',
      spotifyCountry: 'TR',
      tokenExpiresAt: new Date('2026-04-03T12:00:00.000Z'),
      scopes: 'streaming user-modify-playback-state',
      hasRefreshToken: true,
    });

    await jukeboxModule.handleSpotifyKioskDeviceAuthStatusRequest(
      { body: { device_id: 'device-1', device_pwd: 'secret' } } as any,
      res,
    );

    expect(spotifyServiceModule.spotifyService.getDeviceAuthStatus).toHaveBeenCalledWith('device-1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        deviceId: 'device-1',
        connected: true,
      }),
    }));
  });

  it('returns a device-specific spotify auth url for kiosk setup', async () => {
    const res = createMockRes();
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: 'device-1', password: 'secret' }] });

    vi.spyOn(spotifyServiceModule.spotifyService, 'getDeviceAuthStartUrl').mockResolvedValue(
      'https://accounts.spotify.com/authorize?state=device-state'
    );

    await jukeboxModule.handleSpotifyKioskDeviceAuthStartRequest(
      { body: { device_id: 'device-1', device_pwd: 'secret' } } as any,
      res,
    );

    expect(spotifyServiceModule.spotifyService.getDeviceAuthStartUrl).toHaveBeenCalledWith('device-1', null);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        deviceId: 'device-1',
        authUrl: 'https://accounts.spotify.com/authorize?state=device-state',
      }),
    }));
  });

  it('redirects a kiosk popup directly to spotify auth on the GET start route', async () => {
    const res = {
      redirect: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as any;

    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: 'device-1', password: 'secret' }] });

    vi.spyOn(spotifyServiceModule.spotifyService, 'getDeviceAuthStartUrl').mockResolvedValue(
      'https://accounts.spotify.com/authorize?state=device-state'
    );

    await jukeboxModule.handleSpotifyKioskDeviceAuthStartRequest(
      {
        method: 'GET',
        query: { device_id: 'device-1', device_pwd: 'secret' },
      } as any,
      res,
    );

    expect(res.redirect).toHaveBeenCalledWith('https://accounts.spotify.com/authorize?state=device-state');
  });

  it('rejects missing spotify_device_id when registering a kiosk browser player', async () => {
    const res = createMockRes();

    await jukeboxModule.handleSpotifyKioskDeviceRegistration(
      {
        body: {
          device_id: 'device-1',
          player_name: 'Kiosk Browser',
        },
      } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'spotify_device_id is required',
      code: undefined,
    });
  });

  it('rejects invalid device credentials when registering a kiosk browser player', async () => {
    const res = createMockRes();
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 'device-1', password: 'secret' }] });

    await jukeboxModule.handleSpotifyKioskDeviceRegistration(
      {
        body: {
          device_id: 'device-1',
          device_pwd: 'wrong',
          spotify_device_id: 'browser-device-1',
          player_name: 'Kiosk Browser',
        },
      } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid device password',
      code: undefined,
    });
    expect(mockDbQuery).toHaveBeenCalledTimes(1);
  });

  it('stores kiosk spotify player metadata for a registered device', async () => {
    const res = createMockRes();
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: 'device-1', password: 'secret', device_code: 'KIOSK-1' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'device-1',
            spotify_playback_device_id: 'browser-device-1',
            spotify_player_name: 'Kiosk Browser',
            spotify_player_connected_at: new Date('2026-04-03T10:00:00.000Z'),
            spotify_player_is_active: true,
            is_active: true,
            last_heartbeat: new Date('2026-04-03T10:00:00.000Z'),
          },
        ],
      });

    await jukeboxModule.handleSpotifyKioskDeviceRegistration(
      {
        body: {
          device_id: 'device-1',
          device_pwd: 'secret',
          spotify_device_id: 'browser-device-1',
          player_name: 'Kiosk Browser',
        },
      } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        device: {
          id: 'device-1',
          spotify_playback_device_id: 'browser-device-1',
          spotify_player_name: 'Kiosk Browser',
          spotify_player_connected_at: new Date('2026-04-03T10:00:00.000Z'),
          spotify_player_is_active: true,
          is_active: true,
          last_heartbeat: new Date('2026-04-03T10:00:00.000Z'),
        },
      },
      message: 'Kiosk Spotify device registered',
      meta: undefined,
    });
  });

  it('marks a kiosk spotify player inactive and releases any stuck spotify playback state', async () => {
    const res = createMockRes();
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: 'device-1', password: 'secret', device_code: 'KIOSK-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'queue-item-1' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'device-1',
            spotify_playback_device_id: null,
            spotify_player_name: 'Kiosk Browser',
            spotify_player_connected_at: new Date('2026-04-03T10:00:00.000Z'),
            spotify_player_is_active: false,
            is_active: true,
            last_heartbeat: new Date('2026-04-03T10:05:00.000Z'),
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    await jukeboxModule.handleSpotifyKioskDeviceRegistration(
      {
        body: {
          device_id: 'device-1',
          device_pwd: 'secret',
          spotify_device_id: 'browser-device-1',
          player_name: 'Kiosk Browser',
          is_active: false,
        },
      } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        device: {
          id: 'device-1',
          spotify_playback_device_id: null,
          spotify_player_name: 'Kiosk Browser',
          spotify_player_connected_at: new Date('2026-04-03T10:00:00.000Z'),
          spotify_player_is_active: false,
          is_active: true,
          last_heartbeat: new Date('2026-04-03T10:05:00.000Z'),
        },
      },
      message: 'Kiosk Spotify device registered',
      meta: undefined,
    });
  });

  it('rejects invalid device credentials when a kiosk clears now-playing state', async () => {
    mockDbQuery.mockResolvedValue({ rows: [] });
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 'device-1', password: 'secret' }] });
    const server = await createJukeboxRouterServer();

    try {
      const response = await fetch(`${server.baseUrl}/kiosk/now-playing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: 'device-1',
          device_pwd: 'wrong',
          song_id: null,
        }),
      });
      const payload = await response.json();

      expect(response.status).toBe(403);
      expect(payload).toEqual({
        success: false,
        error: 'Invalid device password',
      });
      expect(mockDbQuery).toHaveBeenCalledTimes(1);
    } finally {
      await server.close();
    }
  });

  it('returns 503 when a kiosk starts a spotify song without device spotify auth', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: 'device-1', password: 'secret', is_active: true }] })
      .mockResolvedValueOnce({ rows: [{ id: 'song-spotify-1', source_type: 'spotify', spotify_uri: 'spotify:track:iris' }] })
      .mockResolvedValueOnce({
        rows: [{
          spotify_playback_device_id: 'browser-device-1',
          spotify_player_is_active: true,
        }],
      });
    vi.spyOn(spotifyServiceModule.spotifyService, 'getKioskPlaybackToken').mockRejectedValue(
      new Error('No Spotify authorization found for device')
    );
    const server = await createJukeboxRouterServer();

    try {
      const response = await fetch(`${server.baseUrl}/kiosk/now-playing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: 'device-1',
          device_pwd: 'secret',
          song_id: 'song-spotify-1',
        }),
      });
      const payload = await response.json();

      expect(response.status).toBe(503);
      expect(payload).toEqual({
        success: false,
        error: 'No Spotify authorization found for device',
      });
    } finally {
      await server.close();
    }
  });

  it('returns 503 when a kiosk starts a spotify song with an account that cannot play in the kiosk', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: 'device-1', password: 'secret', is_active: true }] })
      .mockResolvedValueOnce({ rows: [{ id: 'song-spotify-1', source_type: 'spotify', spotify_uri: 'spotify:track:iris' }] })
      .mockResolvedValueOnce({
        rows: [{
          spotify_playback_device_id: 'browser-device-1',
          spotify_player_is_active: true,
        }],
      });
    vi.spyOn(spotifyServiceModule.spotifyService, 'getKioskPlaybackToken').mockRejectedValue(
      new Error('Spotify Premium hesabı gerekli')
    );
    const server = await createJukeboxRouterServer();

    try {
      const response = await fetch(`${server.baseUrl}/kiosk/now-playing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: 'device-1',
          device_pwd: 'secret',
          song_id: 'song-spotify-1',
        }),
      });
      const payload = await response.json();

      expect(response.status).toBe(503);
      expect(payload).toEqual({
        success: false,
        error: 'Spotify Premium hesabı gerekli',
      });
    } finally {
      await server.close();
    }
  });

  it('returns 503 when a kiosk starts a spotify song but device auth must be reconnected', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: 'device-1', password: 'secret', is_active: true }] })
      .mockResolvedValueOnce({ rows: [{ id: 'song-spotify-1', source_type: 'spotify', spotify_uri: 'spotify:track:iris' }] })
      .mockResolvedValueOnce({
        rows: [{
          spotify_playback_device_id: 'browser-device-1',
          spotify_player_is_active: true,
        }],
      });
    vi.spyOn(spotifyServiceModule.spotifyService, 'getKioskPlaybackToken').mockRejectedValue(
      new Error('Spotify bağlantısı gerekli')
    );
    const server = await createJukeboxRouterServer();

    try {
      const response = await fetch(`${server.baseUrl}/kiosk/now-playing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: 'device-1',
          device_pwd: 'secret',
          song_id: 'song-spotify-1',
        }),
      });
      const payload = await response.json();

      expect(response.status).toBe(503);
      expect(payload).toEqual({
        success: false,
        error: 'Spotify bağlantısı gerekli',
      });
    } finally {
      await server.close();
    }
  });

  it('returns 503 when Spotify rejects runtime playback because Premium is required', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: 'device-1', password: 'secret', is_active: true }] })
      .mockResolvedValueOnce({ rows: [{ id: 'song-spotify-1', source_type: 'spotify', spotify_uri: 'spotify:track:iris' }] })
      .mockResolvedValueOnce({
        rows: [{
          spotify_playback_device_id: 'browser-device-1',
          spotify_player_is_active: true,
        }],
      });
    vi.spyOn(spotifyServiceModule.spotifyService, 'getKioskPlaybackToken').mockResolvedValue({
      accessToken: 'device-access-token',
      tokenExpiresAt: new Date('2099-04-03T11:00:00.000Z'),
      scopes: 'streaming user-modify-playback-state user-read-playback-state',
    });
    const premiumRequiredError = new Error('Request failed with status code 403') as Error & {
      response?: { status: number; data: { error: { status: number; message: string } } };
    };
    premiumRequiredError.response = {
      status: 403,
      data: {
        error: {
          status: 403,
          message: 'Player command failed: Premium required',
        },
      },
    };
    vi.spyOn(spotifyServiceModule.spotifyService, 'transferPlayback').mockRejectedValue(premiumRequiredError);
    vi.spyOn(spotifyServiceModule.spotifyService, 'playTrack').mockResolvedValue();
    const server = await createJukeboxRouterServer();

    try {
      const response = await fetch(`${server.baseUrl}/kiosk/now-playing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: 'device-1',
          device_pwd: 'secret',
          song_id: 'song-spotify-1',
        }),
      });
      const payload = await response.json();

      expect(response.status).toBe(503);
      expect(payload).toEqual({
        success: false,
        error: 'Spotify Premium hesabı gerekli',
      });
    } finally {
      await server.close();
    }
  });

  it('returns 503 when Spotify rejects runtime playback because playback scopes are insufficient', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: 'device-1', password: 'secret', is_active: true }] })
      .mockResolvedValueOnce({ rows: [{ id: 'song-spotify-1', source_type: 'spotify', spotify_uri: 'spotify:track:iris' }] })
      .mockResolvedValueOnce({
        rows: [{
          spotify_playback_device_id: 'browser-device-1',
          spotify_player_is_active: true,
        }],
      });
    vi.spyOn(spotifyServiceModule.spotifyService, 'getKioskPlaybackToken').mockResolvedValue({
      accessToken: 'device-access-token',
      tokenExpiresAt: new Date('2099-04-03T11:00:00.000Z'),
      scopes: 'streaming user-modify-playback-state user-read-playback-state',
    });
    const insufficientScopeError = new Error('Request failed with status code 403') as Error & {
      response?: { status: number; data: { error: { status: number; message: string } } };
    };
    insufficientScopeError.response = {
      status: 403,
      data: {
        error: {
          status: 403,
          message: 'Insufficient client scope',
        },
      },
    };
    vi.spyOn(spotifyServiceModule.spotifyService, 'transferPlayback').mockRejectedValue(insufficientScopeError);
    vi.spyOn(spotifyServiceModule.spotifyService, 'playTrack').mockResolvedValue();
    const server = await createJukeboxRouterServer();

    try {
      const response = await fetch(`${server.baseUrl}/kiosk/now-playing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: 'device-1',
          device_pwd: 'secret',
          song_id: 'song-spotify-1',
        }),
      });
      const payload = await response.json();

      expect(response.status).toBe(503);
      expect(payload).toEqual({
        success: false,
        error: 'Spotify yetkileri eksik',
      });
    } finally {
      await server.close();
    }
  });

  it('rejects invalid device credentials when a kiosk triggers autoplay', async () => {
    mockDbQuery.mockResolvedValue({ rows: [] });
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 'device-1', password: 'secret' }] });
    const server = await createJukeboxRouterServer();

    try {
      const response = await fetch(`${server.baseUrl}/autoplay/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: 'device-1',
          device_pwd: 'wrong',
        }),
      });
      const payload = await response.json();

      expect(response.status).toBe(403);
      expect(payload).toEqual({
        success: false,
        error: 'Invalid device password',
      });
      expect(mockDbQuery).toHaveBeenCalledTimes(1);
    } finally {
      await server.close();
    }
  });
});
