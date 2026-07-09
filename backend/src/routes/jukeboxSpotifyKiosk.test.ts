import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { AddressInfo } from 'net';

const {
  mockDbPoolConnect,
  mockDbQuery,
  mockSocketEmit,
  mockSocketGetIO,
  mockSocketState,
  mockSocketTo,
} = vi.hoisted(() => {
  const socketState = { current: undefined as any };
  const socketEmit = vi.fn();
  const socketTo = vi.fn(() => ({ emit: socketEmit }));

  return {
    mockDbPoolConnect: vi.fn(),
    mockDbQuery: vi.fn(),
    mockSocketEmit: socketEmit,
    mockSocketGetIO: vi.fn(() => socketState.current),
    mockSocketState: socketState,
    mockSocketTo: socketTo,
  };
});

vi.mock('../db', () => ({
  db: {
    query: mockDbQuery,
    pool: {
      connect: mockDbPoolConnect,
    },
  },
}));

vi.mock('../socket', () => ({
  getIO: mockSocketGetIO,
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
  mockDbPoolConnect.mockReset();
  mockDbQuery.mockReset();
  mockSocketEmit.mockClear();
  mockSocketGetIO.mockClear();
  mockSocketState.current = undefined;
  mockSocketTo.mockClear();
  vi.restoreAllMocks();
});

describe('jukebox spotify kiosk routes', () => {
  it('keeps a guest spotify enqueue pending without dispatching browser playback', async () => {
    const insertedQueueItem = {
      id: 'queue-guest-1',
      device_id: 'device-1',
      song_id: 'song-spotify-1',
      added_by: 'guest-1',
      priority_score: 1000,
      status: 'pending',
      queue_reason: 'user',
    };
    const spotifyUri = 'spotify:track:4uLU6hMCjMI75M1A2tKUQC';

    mockDbQuery.mockImplementation(async (sql: unknown) => {
      const query = String(sql);

      if (query.includes('FROM device_sessions')) {
        return { rows: [{ '?column?': 1 }] };
      }
      if (query.includes('SELECT role, total_songs_added, is_guest FROM users')) {
        return { rows: [{ role: 'guest', total_songs_added: 0, is_guest: true }] };
      }
      if (query.includes('SELECT COUNT(id) FROM queue_items')) {
        return { rows: [{ count: '0' }] };
      }
      if (query.includes('FROM guest_daily_song_limits')) {
        return { rows: [] };
      }
      if (query.includes('SELECT id, source_type, visibility, asset_role FROM songs')) {
        return {
          rows: [{
            id: 'song-spotify-1',
            source_type: 'spotify',
            visibility: 'public',
            asset_role: 'music',
          }],
        };
      }
      if (query.includes('SELECT id FROM queue_items') || query.includes("status = 'played'")) {
        return { rows: [] };
      }
      if (query.includes('INSERT INTO queue_items')) {
        return { rows: [{ ...insertedQueueItem }] };
      }
      if (query.includes('SELECT COUNT(id) AS pending_count')) {
        return { rows: [{ pending_count: '1' }] };
      }
      if (query.includes('SELECT source_type, spotify_uri FROM songs')) {
        return { rows: [{ source_type: 'spotify', spotify_uri: spotifyUri }] };
      }
      if (query.includes('spotify_playback_device_id')) {
        return {
          rows: [{
            current_song_id: null,
            spotify_playback_device_id: 'browser-device-1',
            spotify_player_is_active: true,
          }],
        };
      }
      if (query.includes("UPDATE queue_items SET status = 'playing'")) {
        insertedQueueItem.status = 'playing';
        return { rows: [] };
      }
      if (query.includes('SELECT current_song_id FROM devices')) {
        return { rows: [{ current_song_id: null }] };
      }

      return { rows: [] };
    });

    vi.spyOn(spotifyServiceModule.spotifyService, 'getKioskPlaybackToken').mockResolvedValue({
      accessToken: 'access-token',
      expiresAt: Date.now() + 60_000,
      scopes: 'streaming user-modify-playback-state user-read-playback-state',
    });
    const transferPlayback = vi.spyOn(spotifyServiceModule.spotifyService, 'transferPlayback').mockResolvedValue();
    const playTrack = vi.spyOn(spotifyServiceModule.spotifyService, 'playTrack').mockResolvedValue();
    const token = jwt.sign(
      { id: 'guest-1', email: 'guest@example.com', role: 'guest' },
      process.env.JWT_SECRET || 'test-secret-key',
    );
    const server = await createJukeboxRouterServer();

    try {
      const response = await fetch(`${server.baseUrl}/queue`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'x-guest-fingerprint': 'guest-browser-1',
        },
        body: JSON.stringify({
          device_id: 'device-1',
          song_id: 'song-spotify-1',
        }),
      });
      const payload = await response.json();

      expect.soft(response.status).toBe(200);
      expect.soft(payload.data.auto_started).toBe(false);
      expect.soft(insertedQueueItem.status).toBe('pending');
      expect.soft(transferPlayback).not.toHaveBeenCalled();
      expect.soft(playTrack).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it('registers a kiosk session as the active player when no live active session exists', async () => {
    const server = await createJukeboxRouterServer();
    const heartbeatAt = new Date('2026-07-03T10:00:00.000Z');
    mockDbQuery
      .mockResolvedValueOnce({
        rows: [{
          id: 'device-1',
          device_code: 'KOLEJ',
          password: null,
          active_kiosk_session_id: null,
          active_kiosk_heartbeat_at: null,
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'device-1',
          device_code: 'KOLEJ',
          active_kiosk_session_id: 'session-a',
          active_kiosk_heartbeat_at: heartbeatAt,
          is_active: true,
        }],
      });

    try {
      const response = await fetch(`${server.baseUrl}/kiosk/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_code: 'KOLEJ', session_id: 'session-a' }),
      });
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.data.kioskSession).toEqual(expect.objectContaining({
        sessionId: 'session-a',
        role: 'active',
        activeSessionId: 'session-a',
      }));
    } finally {
      await server.close();
    }
  });

  it('registers a second live kiosk tab as standby without replacing the active player', async () => {
    const server = await createJukeboxRouterServer();
    mockDbQuery.mockResolvedValueOnce({
      rows: [{
        id: 'device-1',
        device_code: 'KOLEJ',
        password: null,
        active_kiosk_session_id: 'session-a',
        active_kiosk_heartbeat_at: new Date(),
      }],
    });

    try {
      const response = await fetch(`${server.baseUrl}/kiosk/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_code: 'KOLEJ', session_id: 'session-b' }),
      });
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.data.kioskSession).toEqual(expect.objectContaining({
        sessionId: 'session-b',
        role: 'standby',
        activeSessionId: 'session-a',
      }));
    } finally {
      await server.close();
    }
  });

  it('keeps standby kiosk heartbeat passive while another session is active', async () => {
    const server = await createJukeboxRouterServer();
    mockDbQuery.mockResolvedValueOnce({
      rows: [{
        id: 'device-1',
        password: null,
        active_kiosk_session_id: 'session-a',
        active_kiosk_heartbeat_at: new Date(),
      }],
    });

    try {
      const response = await fetch(`${server.baseUrl}/kiosk/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: 'device-1', session_id: 'session-b' }),
      });
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.data.kioskSession).toEqual(expect.objectContaining({
        sessionId: 'session-b',
        role: 'standby',
        activeSessionId: 'session-a',
      }));
    } finally {
      await server.close();
    }
  });

  it('promotes a kiosk heartbeat to active when the previous active session expired', async () => {
    const server = await createJukeboxRouterServer();
    mockDbQuery
      .mockResolvedValueOnce({
        rows: [{
          id: 'device-1',
          password: null,
          active_kiosk_session_id: 'session-a',
          active_kiosk_heartbeat_at: new Date(Date.now() - 60_000),
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'device-1',
          active_kiosk_session_id: 'session-b',
          active_kiosk_heartbeat_at: new Date(),
        }],
      });

    try {
      const response = await fetch(`${server.baseUrl}/kiosk/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: 'device-1', session_id: 'session-b' }),
      });
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.data.kioskSession).toEqual(expect.objectContaining({
        sessionId: 'session-b',
        role: 'active',
        activeSessionId: 'session-b',
      }));
    } finally {
      await server.close();
    }
  });

  it('rejects standby kiosk spotify player registration', async () => {
    const server = await createJukeboxRouterServer();
    mockDbQuery.mockResolvedValueOnce({
      rows: [{
        id: 'device-1',
        password: null,
        active_kiosk_session_id: 'session-a',
        active_kiosk_heartbeat_at: new Date(),
      }],
    });

    try {
      const response = await fetch(`${server.baseUrl}/kiosk/spotify-device`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: 'device-1',
          session_id: 'session-b',
          spotify_device_id: 'browser-device-1',
          player_name: 'Kiosk Browser',
        }),
      });
      const payload = await response.json();

      expect(response.status).toBe(409);
      expect(payload.error).toBe('Kiosk session is standby');
    } finally {
      await server.close();
    }
  });

  it('rejects standby kiosk claim-next requests', async () => {
    const server = await createJukeboxRouterServer();
    mockDbQuery.mockResolvedValueOnce({
      rows: [{
        id: 'device-1',
        password: null,
        active_kiosk_session_id: 'session-a',
        active_kiosk_heartbeat_at: new Date(),
      }],
    });

    try {
      const response = await fetch(`${server.baseUrl}/kiosk/playback/claim-next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: 'device-1', session_id: 'session-b' }),
      });
      const payload = await response.json();

      expect(response.status).toBe(409);
      expect(payload.error).toBe('Kiosk session is standby');
    } finally {
      await server.close();
    }
  });

  it('rejects standby kiosk playback state updates', async () => {
    const server = await createJukeboxRouterServer();
    mockDbQuery.mockResolvedValueOnce({
      rows: [{
        id: 'device-1',
        password: null,
        active_kiosk_session_id: 'session-a',
        active_kiosk_heartbeat_at: new Date(),
      }],
    });

    try {
      const response = await fetch(`${server.baseUrl}/kiosk/playback/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: 'device-1',
          session_id: 'session-b',
          queue_item_id: 'queue-item-1',
          state: 'playing',
        }),
      });
      const payload = await response.json();

      expect(response.status).toBe(409);
      expect(payload.error).toBe('Kiosk session is standby');
    } finally {
      await server.close();
    }
  });

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

  it('lets a kiosk claim the next pending item as a queue-item playback contract', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: 'device-1', password: 'secret' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'queue-1',
          song_id: 'song-spotify-1',
          title: 'Spotify Song',
          artist: 'Spotify Artist',
          cover_url: 'https://img.example/cover.jpg',
          duration_ms: 180000,
          source_type: 'spotify',
          spotify_uri: 'spotify:track:4uLU6hMCjMI75M1A2tKUQC',
          file_url: null,
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValue({ rows: [] });
    const server = await createJukeboxRouterServer();

    try {
      const response = await fetch(`${server.baseUrl}/kiosk/playback/claim-next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: 'device-1',
          password: 'secret',
        }),
      });
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.data.queueItem).toEqual({
        id: 'queue-1',
        songId: 'song-spotify-1',
        title: 'Spotify Song',
        artist: 'Spotify Artist',
        coverUrl: 'https://img.example/cover.jpg',
        durationSeconds: 180,
        source: 'spotify',
        spotifyUri: 'spotify:track:4uLU6hMCjMI75M1A2tKUQC',
        fileUrl: null,
        state: 'playing',
      });
      expect(mockDbQuery.mock.calls.some(([sql]) => String(sql).includes("status = 'playing'"))).toBe(true);
    } finally {
      await server.close();
    }
  });

  it('marks a claimed queue item played only from the playback state endpoint', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: 'device-1', password: 'secret' }] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'queue-1',
          device_id: 'device-1',
          song_id: 'song-spotify-1',
           added_by: 'user-1',
           queue_reason: 'user',
           asset_role: 'music',
           status: 'playing',
         }],
       })
      .mockResolvedValueOnce({ rows: [{ id: 'queue-1' }] })
      .mockResolvedValue({ rows: [] });
    const server = await createJukeboxRouterServer();

    try {
      const response = await fetch(`${server.baseUrl}/kiosk/playback/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: 'device-1',
          password: 'secret',
          queue_item_id: 'queue-1',
          state: 'played',
          position_ms: 180000,
          duration_ms: 180000,
          error_code: null,
          error_message: null,
        }),
      });
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.data).toEqual({
        queue_item_id: 'queue-1',
        state: 'played',
        stored_status: 'played',
      });
      expect(mockDbQuery.mock.calls.some(([sql]) => String(sql).includes("SET status = 'played'"))).toBe(true);
    } finally {
      await server.close();
    }
  });

  it('advances a playing queue item once when duplicate played reports arrive', async () => {
    let queueStatus = 'playing';
    let currentSongId: string | null = 'song-spotify-1';
    let terminalTransitions = 0;
    let deviceClears = 0;
    let profileLoads = 0;

    mockSocketState.current = { to: mockSocketTo };
    mockDbQuery.mockImplementation(async (sql: unknown) => {
      const query = String(sql);

      if (query.includes('SELECT id, password FROM devices')) {
        return { rows: [{ id: 'device-1', password: 'secret' }] };
      }
      if (query.includes('WHERE qi.id = $1 AND qi.device_id = $2')) {
        return {
          rows: [{
            id: 'queue-1',
            device_id: 'device-1',
            song_id: 'song-spotify-1',
            added_by: 'user-1',
            queue_reason: 'user',
            asset_role: 'music',
            status: queueStatus,
            current_song_id: currentSongId,
          }],
        };
      }
      if (query.includes("UPDATE queue_items SET status = 'played'")) {
        const isConditional = query.includes("status = 'playing'");
        if (!isConditional || queueStatus === 'playing') {
          terminalTransitions += 1;
          queueStatus = 'played';
          return { rows: [{ id: 'queue-1' }] };
        }
        return { rows: [] };
      }
      if (query.includes('SET current_song_id = NULL')) {
        deviceClears += 1;
        currentSongId = null;
        return { rows: [] };
      }
      if (query.includes('LEFT JOIN radio_profiles')) {
        profileLoads += 1;
        return { rows: [] };
      }
      if (query.includes('SELECT current_song_id FROM devices')) {
        return { rows: [{ current_song_id: currentSongId }] };
      }

      return { rows: [] };
    });
    const server = await createJukeboxRouterServer();
    const reportPlayed = () => fetch(`${server.baseUrl}/kiosk/playback/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: 'device-1',
        password: 'secret',
        queue_item_id: 'queue-1',
        state: 'played',
        position_ms: 180000,
        duration_ms: 180000,
      }),
    });

    try {
      const firstResponse = await reportPlayed();
      const secondResponse = await reportPlayed();

      expect.soft(firstResponse.status).toBe(200);
      expect.soft(secondResponse.status).toBe(200);
      expect.soft(queueStatus).toBe('played');
      expect.soft(terminalTransitions).toBe(1);
      expect.soft(deviceClears).toBe(1);
      expect.soft(profileLoads).toBe(1);
      expect.soft(mockSocketEmit.mock.calls.filter(([event]) => event === 'playback_state_updated')).toHaveLength(1);
      expect.soft(mockSocketEmit.mock.calls.filter(([event]) => event === 'queue_updated')).toHaveLength(1);
    } finally {
      await server.close();
    }
  });

  it('rejects a stale item trying to become playing while another item is current', async () => {
    let queueStatus = 'pending';
    let currentSongId = 'song-current';
    let queueStatusUpdates = 0;
    let deviceCurrentUpdates = 0;

    mockDbQuery.mockImplementation(async (sql: unknown) => {
      const query = String(sql);

      if (query.includes('SELECT id, password FROM devices')) {
        return { rows: [{ id: 'device-1', password: 'secret' }] };
      }
      if (query.includes('WHERE qi.id = $1 AND qi.device_id = $2')) {
        return {
          rows: [{
            id: 'queue-stale',
            device_id: 'device-1',
            song_id: 'song-stale',
            added_by: 'user-2',
            queue_reason: 'user',
            asset_role: 'music',
            status: queueStatus,
            current_song_id: currentSongId,
          }],
        };
      }
      if (query.includes("UPDATE queue_items SET status = 'playing'")) {
        queueStatusUpdates += 1;
        queueStatus = 'playing';
        return { rows: [{ id: 'queue-stale' }] };
      }
      if (query.includes('UPDATE devices SET current_song_id = $2')) {
        deviceCurrentUpdates += 1;
        currentSongId = 'song-stale';
        return { rows: [] };
      }

      return { rows: [] };
    });
    const server = await createJukeboxRouterServer();

    try {
      const response = await fetch(`${server.baseUrl}/kiosk/playback/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: 'device-1',
          password: 'secret',
          queue_item_id: 'queue-stale',
          state: 'playing',
        }),
      });

      expect.soft(response.status).toBe(409);
      expect.soft(queueStatus).toBe('pending');
      expect.soft(currentSongId).toBe('song-current');
      expect.soft(queueStatusUpdates).toBe(0);
      expect.soft(deviceCurrentUpdates).toBe(0);
    } finally {
      await server.close();
    }
  });

  it('serializes concurrent pending playing reports so only one item claims the device', async () => {
    const queueItems = new Map([
      ['queue-a', { status: 'pending', songId: 'song-a' }],
      ['queue-b', { status: 'pending', songId: 'song-b' }],
    ]);
    let currentSongId: string | null = null;
    let queueStatusUpdates = 0;
    let deviceCurrentUpdates = 0;
    let initialQueueLoads = 0;
    let releaseInitialLoads!: () => void;
    const bothInitialLoads = new Promise<void>((resolve) => {
      releaseInitialLoads = resolve;
    });
    let deviceLockTail = Promise.resolve();
    const transactionClients: Array<{
      operations: string[];
      release: ReturnType<typeof vi.fn>;
    }> = [];
    const acquireDeviceLock = async () => {
      const previousLock = deviceLockTail;
      let releaseLock!: () => void;
      deviceLockTail = new Promise<void>((resolve) => {
        releaseLock = resolve;
      });
      await previousLock;
      return releaseLock;
    };

    mockDbQuery.mockImplementation(async (sql: unknown, params: unknown[] = []) => {
      const query = String(sql);

      if (query.includes('SELECT id, password FROM devices')) {
        return { rows: [{ id: 'device-1', password: 'secret' }] };
      }
      if (query.includes('WHERE qi.id = $1 AND qi.device_id = $2')) {
        const queueItemId = String(params[0]);
        const queueItem = queueItems.get(queueItemId)!;
        const snapshot = {
          id: queueItemId,
          device_id: 'device-1',
          song_id: queueItem.songId,
          added_by: 'user-1',
          queue_reason: 'user',
          asset_role: 'music',
          status: queueItem.status,
          current_song_id: currentSongId,
        };

        initialQueueLoads += 1;
        if (initialQueueLoads === 2) {
          releaseInitialLoads();
        }
        await bothInitialLoads;
        return { rows: [snapshot] };
      }
      if (query.includes("UPDATE queue_items SET status = 'playing'")) {
        const queueItemId = String(params[0]);
        const queueItem = queueItems.get(queueItemId)!;
        if (queueItem.status !== 'pending') {
          return { rows: [] };
        }
        queueItem.status = 'playing';
        queueStatusUpdates += 1;
        return { rows: [{ id: queueItemId }] };
      }
      if (query.includes('UPDATE devices SET current_song_id = $2')) {
        currentSongId = String(params[1]);
        deviceCurrentUpdates += 1;
        return { rows: [{ id: 'device-1' }] };
      }

      return { rows: [] };
    });

    mockDbPoolConnect.mockImplementation(async () => {
      let transactionActive = false;
      let releaseDeviceLock: (() => void) | null = null;
      const operations: string[] = [];
      const release = vi.fn(() => {
        releaseDeviceLock?.();
        releaseDeviceLock = null;
        transactionActive = false;
      });
      const client = {
        query: vi.fn(async (sql: unknown, params: unknown[] = []) => {
          const query = String(sql);

          if (query === 'BEGIN') {
            operations.push('BEGIN');
            transactionActive = true;
            return { rows: [] };
          }
          if (query.includes('FROM devices') && query.includes('FOR UPDATE')) {
            operations.push('device FOR UPDATE');
            const releaseLock = await acquireDeviceLock();
            const result = { rows: [{ current_song_id: currentSongId }] };
            if (transactionActive) {
              releaseDeviceLock = releaseLock;
            } else {
              releaseLock();
            }
            return result;
          }
          if (query.includes('FROM queue_items') && query.includes('FOR UPDATE')) {
            operations.push('queue FOR UPDATE');
            const queueItemId = String(params[0]);
            const queueItem = queueItems.get(queueItemId)!;
            return {
              rows: [{
                id: queueItemId,
                status: queueItem.status,
                song_id: queueItem.songId,
              }],
            };
          }
          if (query.includes("status = 'playing'") && query.includes('LIMIT 1')) {
            operations.push('current playing SELECT');
            const playing = [...queueItems.entries()].find(([, item]) => item.status === 'playing');
            return { rows: playing ? [{ id: playing[0], song_id: playing[1].songId }] : [] };
          }
          if (query.includes("UPDATE queue_items SET status = 'playing'")) {
            operations.push('conditional queue UPDATE');
            const queueItemId = String(params[0]);
            const queueItem = queueItems.get(queueItemId)!;
            if (queueItem.status !== 'pending') {
              return { rows: [] };
            }
            queueItem.status = 'playing';
            queueStatusUpdates += 1;
            return { rows: [{ id: queueItemId }] };
          }
          if (query.includes('UPDATE devices SET current_song_id = $2')) {
            operations.push('device current UPDATE');
            currentSongId = String(params[1]);
            deviceCurrentUpdates += 1;
            return { rows: [{ id: 'device-1' }] };
          }
          if (query === 'COMMIT' || query === 'ROLLBACK') {
            operations.push(query);
            if (transactionActive) {
              releaseDeviceLock?.();
              releaseDeviceLock = null;
              transactionActive = false;
            }
            return { rows: [] };
          }

          return { rows: [] };
        }),
        release,
      };
      transactionClients.push({ operations, release });
      return client;
    });

    const server = await createJukeboxRouterServer();
    const reportPlaying = (queueItemId: string) => fetch(`${server.baseUrl}/kiosk/playback/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: 'device-1',
        password: 'secret',
        queue_item_id: queueItemId,
        state: 'playing',
      }),
    });

    try {
      const responses = await Promise.all([
        reportPlaying('queue-a'),
        reportPlaying('queue-b'),
      ]);
      const playingItems = [...queueItems.entries()].filter(([, item]) => item.status === 'playing');
      const winningClient = transactionClients.find(({ operations }) => operations.includes('conditional queue UPDATE'));
      const losingClient = transactionClients.find(({ operations }) => !operations.includes('conditional queue UPDATE'));

      expect.soft(responses.map((response) => response.status).sort()).toEqual([200, 409]);
      expect.soft(playingItems).toHaveLength(1);
      expect.soft(currentSongId).toBe(playingItems[0]?.[1].songId);
      expect.soft(queueStatusUpdates).toBe(1);
      expect.soft(deviceCurrentUpdates).toBe(1);
      expect.soft(mockDbPoolConnect).toHaveBeenCalledTimes(2);
      expect.soft(winningClient?.operations).toEqual([
        'BEGIN',
        'device FOR UPDATE',
        'queue FOR UPDATE',
        'current playing SELECT',
        'conditional queue UPDATE',
        'device current UPDATE',
        'COMMIT',
      ]);
      expect.soft(losingClient?.operations).toEqual([
        'BEGIN',
        'device FOR UPDATE',
        'queue FOR UPDATE',
        'current playing SELECT',
        'ROLLBACK',
      ]);
      for (const transactionClient of transactionClients) {
        expect.soft(transactionClient.release).toHaveBeenCalledTimes(1);
      }
    } finally {
      await server.close();
    }
  });

  it('maps playback failures to skipped queue status instead of played', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: 'device-1', password: 'secret' }] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'queue-1',
          device_id: 'device-1',
          song_id: 'song-spotify-1',
           added_by: 'user-1',
           queue_reason: 'user',
           asset_role: 'music',
           status: 'playing',
         }],
       })
      .mockResolvedValueOnce({ rows: [{ id: 'queue-1' }] })
      .mockResolvedValue({ rows: [] });
    const server = await createJukeboxRouterServer();

    try {
      const response = await fetch(`${server.baseUrl}/kiosk/playback/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: 'device-1',
          password: 'secret',
          queue_item_id: 'queue-1',
          state: 'failed',
          error_code: 'SPOTIFY_PLAYBACK_ERROR',
          error_message: 'Premium required',
        }),
      });
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.data.stored_status).toBe('skipped');
      expect(mockDbQuery.mock.calls.some(([sql]) => String(sql).includes("SET status = 'played'"))).toBe(false);
      expect(mockDbQuery.mock.calls.some(([sql]) => String(sql).includes("SET status = 'skipped'"))).toBe(true);
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
