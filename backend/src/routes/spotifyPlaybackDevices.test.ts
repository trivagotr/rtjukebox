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

vi.mock('../middleware/auth', () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    if (req.headers.authorization === 'Bearer admin-token') {
      req.user = { id: 'admin-user-1', role: 'admin' };
      return next();
    }
    if (req.headers.authorization === 'Bearer user-token') {
      req.user = { id: 'regular-user-1', role: 'user' };
      return next();
    }
    return _res.status(401).json({ success: false, error: 'Unauthorized' });
  },
  optionalAuth: (_req: any, _res: any, next: any) => next(),
  requireAdmin: (req: any, _res: any, next: any) => {
    if (req.user?.role === 'admin') return next();
    return _res.status(403).json({ success: false, error: 'Forbidden' });
  },
}));

let jukeboxModule: typeof import('./jukebox');
let spotifyRoutesModule: typeof import('./spotify');
let spotifyServiceModule: typeof import('../services/spotify');

async function createTestServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/spotify', spotifyRoutesModule.default);
  app.use('/api/v1/jukebox', jukeboxModule.default);

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
  process.env.SPOTIFY_CLIENT_ID = 'test-client';
  process.env.SPOTIFY_CLIENT_SECRET = 'test-secret';
  spotifyRoutesModule = await import('./spotify');
  jukeboxModule = await import('./jukebox');
  spotifyServiceModule = await import('../services/spotify');
});

beforeEach(() => {
  mockDbQuery.mockReset();
  mockDbQuery.mockResolvedValue({ rows: [] });
  vi.restoreAllMocks();
});

describe('Spotify Playback Devices & Kiosk Target Assignment', () => {
  describe('GET /api/v1/spotify/playback-devices', () => {
    it('requires admin authentication', async () => {
      const server = await createTestServer();
      try {
        const unauthRes = await fetch(`${server.baseUrl}/api/v1/spotify/playback-devices`);
        expect(unauthRes.status).toBe(401);

        const forbiddenRes = await fetch(`${server.baseUrl}/api/v1/spotify/playback-devices`, {
          headers: { Authorization: 'Bearer user-token' },
        });
        expect(forbiddenRes.status).toBe(403);
      } finally {
        await server.close();
      }
    });

    it('returns detected active spotify connect devices', async () => {
      vi.spyOn(spotifyServiceModule.spotifyService, 'getAvailableDevices').mockResolvedValueOnce([
        { id: 'sp-1', name: 'Studio PC', is_active: true, type: 'Computer', volume_percent: 85 },
        { id: 'sp-2', name: 'Lounge Speaker', is_active: false, type: 'Speaker', volume_percent: 60 },
      ]);

      const server = await createTestServer();
      try {
        const response = await fetch(`${server.baseUrl}/api/v1/spotify/playback-devices`, {
          headers: { Authorization: 'Bearer admin-token' },
        });
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.data.devices).toHaveLength(2);
        expect(body.data.devices[0]).toEqual({
          id: 'sp-1',
          name: 'Studio PC',
          is_active: true,
          type: 'Computer',
          volume_percent: 85,
        });
      } finally {
        await server.close();
      }
    });

    it('returns empty array gracefully when spotify has no devices or error occurs', async () => {
      vi.spyOn(spotifyServiceModule.spotifyService, 'getAvailableDevices').mockResolvedValueOnce([]);

      const server = await createTestServer();
      try {
        const response = await fetch(`${server.baseUrl}/api/v1/spotify/playback-devices`, {
          headers: { Authorization: 'Bearer admin-token' },
        });
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.data.devices).toEqual([]);
      } finally {
        await server.close();
      }
    });
  });

  describe('GET /api/v1/jukebox/admin/spotify-devices', () => {
    it('returns available devices on the jukebox admin endpoint', async () => {
      vi.spyOn(spotifyServiceModule.spotifyService, 'getAvailableDevices').mockResolvedValueOnce([
        { id: 'sp-live', name: 'Kiosk Soundbar', is_active: true, type: 'Speaker', volume_percent: 100 },
      ]);

      const server = await createTestServer();
      try {
        const response = await fetch(`${server.baseUrl}/api/v1/jukebox/admin/spotify-devices`, {
          headers: { Authorization: 'Bearer admin-token' },
        });
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.data.devices[0].name).toBe('Kiosk Soundbar');
      } finally {
        await server.close();
      }
    });
  });

  describe('PUT /api/v1/jukebox/admin/devices/:id/spotify-playback-target', () => {
    it('requires admin authorization', async () => {
      const server = await createTestServer();
      try {
        const res = await fetch(`${server.baseUrl}/api/v1/jukebox/admin/devices/dev-1/spotify-playback-target`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ spotify_playback_device_id: 'sp-1' }),
        });
        expect(res.status).toBe(401);
      } finally {
        await server.close();
      }
    });

    it('assigns a target Spotify device to the kiosk', async () => {
      mockDbQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 'dev-1',
            name: 'Kiosk 1',
            spotify_playback_device_id: 'sp-target-1',
            spotify_player_name: 'Main Studio Speaker',
            spotify_player_is_active: true,
          }],
        })
        .mockResolvedValueOnce({
          rows: [], // getQueueForDevice
        });

      const server = await createTestServer();
      try {
        const res = await fetch(`${server.baseUrl}/api/v1/jukebox/admin/devices/dev-1/spotify-playback-target`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer admin-token',
          },
          body: JSON.stringify({
            spotify_playback_device_id: 'sp-target-1',
            spotify_player_name: 'Main Studio Speaker',
          }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.device.spotify_playback_device_id).toBe('sp-target-1');
        expect(body.data.device.spotify_player_name).toBe('Main Studio Speaker');
        expect(body.data.device.spotify_player_is_active).toBe(true);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE devices'),
          expect.arrayContaining(['dev-1', 'sp-target-1', 'Main Studio Speaker'])
        );
      } finally {
        await server.close();
      }
    });

    it('clears the assigned Spotify device when given null or empty id', async () => {
      mockDbQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 'dev-1',
            name: 'Kiosk 1',
            spotify_playback_device_id: null,
            spotify_player_name: null,
            spotify_player_is_active: false,
          }],
        })
        .mockResolvedValueOnce({
          rows: [], // getQueueForDevice
        });

      const server = await createTestServer();
      try {
        const res = await fetch(`${server.baseUrl}/api/v1/jukebox/admin/devices/dev-1/spotify-playback-target`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer admin-token',
          },
          body: JSON.stringify({
            spotify_playback_device_id: null,
          }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.device.spotify_playback_device_id).toBeNull();
        expect(body.data.device.spotify_player_is_active).toBe(false);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('spotify_playback_device_id = NULL'),
          ['dev-1']
        );
      } finally {
        await server.close();
      }
    });

    it('returns 404 when kiosk device does not exist', async () => {
      mockDbQuery.mockResolvedValueOnce({ rows: [] });

      const server = await createTestServer();
      try {
        const res = await fetch(`${server.baseUrl}/api/v1/jukebox/admin/devices/non-existent/spotify-playback-target`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer admin-token',
          },
          body: JSON.stringify({
            spotify_playback_device_id: 'sp-target-1',
          }),
        });

        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.success).toBe(false);
      } finally {
        await server.close();
      }
    });
  });

  describe('Resilience: System stays active when no Spotify device is active', () => {
    it('allows kiosk now-playing to advance without error when no spotify playback device is active', async () => {
      // 1. Validate device
      mockDbQuery.mockResolvedValueOnce({
        rows: [{ id: 'kiosk-dev-1', password: 'pass', is_active: true }],
      });
      // 2. Query song (source_type: spotify)
      mockDbQuery.mockResolvedValueOnce({
        rows: [{ id: 'song-sp-1', source_type: 'spotify', spotify_uri: 'spotify:track:456' }],
      });
      // 3. loadSpotifyKioskPlaybackTarget returns no registered playback device
      mockDbQuery.mockResolvedValueOnce({
        rows: [{ spotify_playback_device_id: null, spotify_player_is_active: false }],
      });
      // 4. In dispatchSpotifyPlaybackForSong: auto-discovery gets token
      vi.spyOn(spotifyServiceModule.spotifyService, 'getKioskPlaybackToken').mockResolvedValueOnce({
        accessToken: 'mock-token',
        tokenExpiresAt: new Date(Date.now() + 3600000),
        scopes: 'streaming',
      });
      // 5. In dispatchSpotifyPlaybackForSong: auto-discovery finds NO devices
      vi.spyOn(spotifyServiceModule.spotifyService, 'getAvailableDevices').mockResolvedValueOnce([]);

      // 6. Find queue item for this song
      mockDbQuery.mockResolvedValueOnce({
        rows: [{ id: 'qi-1' }],
      });
      // 7. Find previous playing song
      mockDbQuery.mockResolvedValueOnce({
        rows: [],
      });
      // 8. UPDATE queue_items SET status = 'playing'
      mockDbQuery.mockResolvedValueOnce({ rowCount: 1 });
      // 9. UPDATE devices SET current_song_id
      mockDbQuery.mockResolvedValueOnce({ rowCount: 1 });
      // 10. getQueueForDevice broadcast
      mockDbQuery.mockResolvedValueOnce({ rows: [] });

      const server = await createTestServer();
      try {
        const res = await fetch(`${server.baseUrl}/api/v1/jukebox/kiosk/now-playing`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            device_id: 'kiosk-dev-1',
            device_pwd: 'pass',
            song_id: 'song-sp-1',
          }),
        });

        // The system must NOT return 409 or 502! It must return 200 and keep the system active!
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);

        // Verify device and queue item were updated
        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining("UPDATE queue_items SET status = 'playing'"),
          ['qi-1']
        );
        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE devices SET current_song_id'),
          ['kiosk-dev-1', 'song-sp-1']
        );
      } finally {
        await server.close();
      }
    });
  });
});
