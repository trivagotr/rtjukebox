import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDbQuery, mockAxiosGet, mockAxiosPost, mockAxiosPut } = vi.hoisted(() => ({
  mockDbQuery: vi.fn(),
  mockAxiosGet: vi.fn(),
  mockAxiosPost: vi.fn(),
  mockAxiosPut: vi.fn(),
}));

vi.mock('../db', () => ({
  db: {
    query: mockDbQuery,
    pool: {},
  },
}));

vi.mock('axios', () => ({
  default: {
    get: mockAxiosGet,
    post: mockAxiosPost,
    put: mockAxiosPut,
  },
}));

import {
  SPOTIFY_REQUIRED_SCOPES,
  SpotifyService,
} from './spotify';

describe('SpotifyService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.SPOTIFY_CLIENT_ID = 'spotify-client-id';
    process.env.SPOTIFY_CLIENT_SECRET = 'spotify-client-secret';
    process.env.SPOTIFY_REDIRECT_URI = 'http://127.0.0.1:3000/api/v1/spotify/callback';
    mockDbQuery.mockResolvedValue({ rows: [] });
  });

  it('includes playlist scopes in the authorization URL', async () => {
    const service = new SpotifyService();

    const url = new URL(await service.getAuthUrl('state-123'));

    expect(url.origin + url.pathname).toBe('https://accounts.spotify.com/authorize');
    expect(url.searchParams.get('client_id')).toBe('spotify-client-id');
    expect(url.searchParams.get('redirect_uri')).toBe(process.env.SPOTIFY_REDIRECT_URI);
    expect(url.searchParams.get('state')).toBe('state-123');
    expect(url.searchParams.get('scope')).toBe(SPOTIFY_REQUIRED_SCOPES);
    expect(SPOTIFY_REQUIRED_SCOPES).toContain('playlist-read-private');
    expect(SPOTIFY_REQUIRED_SCOPES).toContain('playlist-read-collaborative');
    expect(SPOTIFY_REQUIRED_SCOPES).toContain('user-read-email');
    expect(SPOTIFY_REQUIRED_SCOPES).toContain('user-read-private');
  });

  it('resolves spotify app credentials from db config before env fallback', async () => {
    process.env.SPOTIFY_CLIENT_ID = 'env-client-id';
    process.env.SPOTIFY_CLIENT_SECRET = 'env-client-secret';
    process.env.SPOTIFY_REDIRECT_URI = 'http://127.0.0.1:3000/api/v1/spotify/callback';

    mockDbQuery.mockResolvedValueOnce({
      rows: [
        {
          client_id: 'db-client-id',
          client_secret: 'db-client-secret',
        },
      ],
    });

    const service = new SpotifyService();
    const url = new URL(await service.getAuthUrl('state-123'));

    expect(mockDbQuery).toHaveBeenCalled();
    expect(url.searchParams.get('client_id')).toBe('db-client-id');
    expect(url.searchParams.get('redirect_uri')).toBe(process.env.SPOTIFY_REDIRECT_URI);
  });

  it('invalidates stored spotify auth when spotify app credentials change', async () => {
    const service = new SpotifyService();

    mockDbQuery
      .mockResolvedValueOnce({
        rows: [
          {
            client_id: 'old-client-id',
            client_secret: 'old-client-secret',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [],
      })
      .mockResolvedValueOnce({
        rows: [],
      })
      .mockResolvedValueOnce({
        rows: [],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            client_id: 'new-client-id',
            client_secret: 'new-client-secret',
          },
        ],
      });

    mockAxiosPost.mockResolvedValueOnce({
      data: {
        access_token: 'client-token',
        expires_in: 3600,
      },
    });

    await service.saveSpotifyAppConfig({
      clientId: 'new-client-id',
      clientSecret: 'new-client-secret',
    });

    await service.getClientToken();

    expect(mockDbQuery.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM spotify_auth WHERE TRUE'))).toBe(true);
    expect(mockDbQuery.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM spotify_device_auth WHERE TRUE'))).toBe(true);
    expect(mockAxiosPost).toHaveBeenCalledWith(
      'https://accounts.spotify.com/api/token',
      'grant_type=client_credentials',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from('new-client-id:new-client-secret').toString('base64')}`,
        }),
      }),
    );
  });

  it('keeps stored spotify auth when spotify app credentials do not change', async () => {
    const service = new SpotifyService();

    mockDbQuery
      .mockResolvedValueOnce({
        rows: [
          {
            client_id: 'same-client-id',
            client_secret: 'same-client-secret',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            client_id: 'same-client-id',
            client_secret: 'same-client-secret',
          },
        ],
      });

    mockAxiosPost.mockResolvedValueOnce({
      data: {
        access_token: 'client-token',
        expires_in: 3600,
      },
    });

    await service.saveSpotifyAppConfig({
      clientId: 'same-client-id',
      clientSecret: 'same-client-secret',
    });

    await service.getClientToken();

    expect(mockDbQuery.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM spotify_auth WHERE TRUE'))).toBe(false);
  });

  it('preserves the stored client secret when saving an app config without retyping it', async () => {
    const service = new SpotifyService();

    mockDbQuery
      .mockResolvedValueOnce({
        rows: [
          {
            client_id: 'same-client-id',
            client_secret: 'same-client-secret',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    await service.saveSpotifyAppConfig({
      clientId: 'same-client-id',
    });

    expect(mockDbQuery.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM spotify_auth WHERE TRUE'))).toBe(false);
    expect(mockDbQuery.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM spotify_device_auth WHERE TRUE'))).toBe(false);
    expect(mockDbQuery.mock.calls.some(([sql, params]) =>
      String(sql).includes('INSERT INTO spotify_app_config') &&
      params?.[0] === 'same-client-id' &&
      params?.[1] === 'same-client-secret'
    )).toBe(true);
  });

  it('loads playlist tracks with the stored user access token', async () => {
    const service = new SpotifyService();
    const getAccessTokenSpy = vi.spyOn(service, 'getAccessToken').mockResolvedValue('user-access-token');
    const getClientTokenSpy = vi.spyOn(service, 'getClientToken').mockResolvedValue('client-token');

    mockAxiosGet.mockResolvedValue({
      data: {
        items: [
          {
            track: {
              type: 'track',
              id: 'track-1',
              name: 'Playlist Song',
              artists: [{ id: 'artist-1', name: 'Playlist Artist' }],
              album: {
                id: 'album-1',
                name: 'Playlist Album',
                images: [{ url: 'https://example.com/cover.jpg', width: 640, height: 640 }],
              },
              duration_ms: 180000,
              uri: 'spotify:track:track-1',
              preview_url: null,
              explicit: false,
              external_urls: { spotify: 'https://open.spotify.com/track/track-1' },
            },
          },
        ],
      },
    });

    const tracks = await service.getPlaylistTracks('spotify:playlist:playlist-1', 'TR', 25);

    expect(getAccessTokenSpy).toHaveBeenCalledTimes(1);
    expect(getClientTokenSpy).not.toHaveBeenCalled();
    expect(mockAxiosGet).toHaveBeenCalledWith(
      'https://api.spotify.com/v1/playlists/playlist-1/items',
      {
        headers: { Authorization: 'Bearer user-access-token' },
        params: {
          market: 'TR',
          limit: 25,
        },
      }
    );
    expect(tracks).toEqual([
      expect.objectContaining({
        spotify_uri: 'spotify:track:track-1',
        spotify_id: 'track-1',
        title: 'Playlist Song',
        artist: 'Playlist Artist',
      }),
    ]);
  });

  it('maps playlist item payloads from the current Spotify items endpoint', async () => {
    const service = new SpotifyService();
    vi.spyOn(service, 'getAccessToken').mockResolvedValue('user-access-token');

    mockAxiosGet.mockResolvedValue({
      data: {
        items: [
          {
            item: {
              type: 'track',
              id: 'track-2',
              name: 'Items Endpoint Song',
              artists: [{ id: 'artist-2', name: 'Items Artist' }],
              album: {
                id: 'album-2',
                name: 'Items Album',
                images: [{ url: 'https://example.com/items-cover.jpg', width: 640, height: 640 }],
              },
              duration_ms: 210000,
              uri: 'spotify:track:track-2',
              preview_url: null,
              explicit: false,
              external_urls: { spotify: 'https://open.spotify.com/track/track-2' },
            },
          },
          {
            item: {
              type: 'episode',
              id: 'episode-1',
            },
          },
        ],
      },
    });

    const tracks = await service.getPlaylistTracks('playlist-2', 'TR', 10);

    expect(tracks).toEqual([
      expect.objectContaining({
        spotify_uri: 'spotify:track:track-2',
        title: 'Items Endpoint Song',
        artist: 'Items Artist',
      }),
    ]);
  });

  it('builds a device auth url that carries the device id in oauth state', async () => {
    const service = new SpotifyService();
    const url = new URL(await service.getDeviceAuthStartUrl('device-1'));

    expect(url.origin + url.pathname).toBe('https://accounts.spotify.com/authorize');
    expect(url.searchParams.get('client_id')).toBe('spotify-client-id');
    expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:3000/api/v1/spotify/callback');
    expect(url.searchParams.get('state')).toMatch(/^device\./);
    expect(url.searchParams.get('state')).toContain('device-1');
  });

  it('stores device-scoped spotify auth on callback using the device encoded in state', async () => {
    const service = new SpotifyService();
    const startUrl = new URL(await service.getDeviceAuthStartUrl('device-1'));
    const state = startUrl.searchParams.get('state');
    expect(state).toBeTruthy();

    mockAxiosPost
      .mockResolvedValueOnce({
        data: {
          access_token: 'device-access-token',
          refresh_token: 'device-refresh-token',
          expires_in: 3600,
          scope: 'streaming user-modify-playback-state',
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: 'spotify-user-1',
          display_name: 'Kiosk Device',
          email: 'kiosk@example.com',
          product: 'premium',
        },
      });

    mockAxiosGet.mockResolvedValueOnce({
      data: {
        id: 'spotify-user-1',
        display_name: 'Kiosk Device',
        email: 'kiosk@example.com',
        product: 'premium',
      },
    });

    mockDbQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'device-1' }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await service.handleDeviceAuthCallback('auth-code', state!);

    expect(result).toMatchObject({
      deviceId: 'device-1',
      spotifyAccountId: 'spotify-user-1',
      spotifyDisplayName: 'Kiosk Device',
      spotifyEmail: 'kiosk@example.com',
      spotifyProduct: 'premium',
    });
    expect(mockAxiosPost).toHaveBeenCalledWith(
      'https://accounts.spotify.com/api/token',
      expect.stringContaining('grant_type=authorization_code'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Basic /),
        }),
      }),
    );
    expect(mockAxiosPost.mock.calls[0][1]).toContain('redirect_uri=http%3A%2F%2F127.0.0.1%3A3000%2Fapi%2Fv1%2Fspotify%2Fcallback');
    expect(mockDbQuery.mock.calls.some(([sql]) => String(sql).includes('spotify_device_auth'))).toBe(true);
  });

  it('preserves an existing device refresh token when spotify omits a new one on reconnect', async () => {
    const service = new SpotifyService();
    const startUrl = new URL(await service.getDeviceAuthStartUrl('device-1'));
    const state = startUrl.searchParams.get('state');
    expect(state).toBeTruthy();

    mockAxiosPost
      .mockResolvedValueOnce({
        data: {
          access_token: 'device-access-token',
          expires_in: 3600,
          scope: 'streaming user-modify-playback-state',
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: 'spotify-user-1',
          display_name: 'Kiosk Device',
          email: 'kiosk@example.com',
          product: 'premium',
        },
      });

    mockAxiosGet.mockResolvedValueOnce({
      data: {
        id: 'spotify-user-1',
        display_name: 'Kiosk Device',
        email: 'kiosk@example.com',
        product: 'premium',
      },
    });

    mockDbQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'device-1' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            device_id: 'device-1',
            access_token: 'old-device-access-token',
            refresh_token: 'existing-device-refresh-token',
            token_expires_at: new Date('2026-04-03T11:00:00.000Z'),
            scopes: 'streaming user-read-playback-state',
            spotify_account_id: 'spotify-user-1',
            spotify_display_name: 'Kiosk Device',
            spotify_email: 'kiosk@example.com',
            spotify_product: 'premium',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const result = await service.handleDeviceAuthCallback('auth-code', state!);

    expect(result.hasRefreshToken).toBe(true);
    expect(mockDbQuery.mock.calls.some(([sql, params]) => String(sql).includes('spotify_device_auth') && params?.[7] === 'existing-device-refresh-token')).toBe(true);
  });

  it('fails clearly when device reconnect has no new or existing refresh token', async () => {
    const service = new SpotifyService();
    const startUrl = new URL(await service.getDeviceAuthStartUrl('device-1'));
    const state = startUrl.searchParams.get('state');
    expect(state).toBeTruthy();

    mockAxiosPost
      .mockResolvedValueOnce({
        data: {
          access_token: 'device-access-token',
          expires_in: 3600,
          scope: 'streaming user-modify-playback-state',
        },
      });

    mockDbQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'device-1' }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(service.handleDeviceAuthCallback('auth-code', state!)).rejects.toThrow(
      'Spotify did not return a refresh token and no existing device refresh token was found'
    );
  });

  it('returns a kiosk playback token snapshot from the device auth row', async () => {
    const service = new SpotifyService();

    mockDbQuery.mockResolvedValueOnce({
      rows: [
        {
          device_id: 'device-1',
          access_token: 'device-access-token',
          refresh_token: 'device-refresh-token',
          token_expires_at: new Date('2099-04-03T11:00:00.000Z'),
          scopes: 'streaming user-modify-playback-state user-read-playback-state',
          spotify_account_id: 'spotify-user-1',
          spotify_display_name: 'Kiosk Device',
          spotify_email: 'kiosk@example.com',
          spotify_product: 'premium',
        },
      ],
    });

    const token = await service.getKioskPlaybackToken('device-1');

    expect(token).toEqual({
      accessToken: 'device-access-token',
      tokenExpiresAt: new Date('2099-04-03T11:00:00.000Z'),
      scopes: 'streaming user-modify-playback-state user-read-playback-state',
    });
    expect(mockDbQuery.mock.calls.some(([sql]) => String(sql).includes('spotify_device_auth'))).toBe(true);
    expect(mockDbQuery.mock.calls.some(([sql]) => String(sql).includes('spotify_auth'))).toBe(false);
  });

  it('rejects kiosk playback token lookup when device auth is missing', async () => {
    const service = new SpotifyService();

    mockDbQuery.mockResolvedValueOnce({
      rows: [],
    });

    await expect(service.getKioskPlaybackToken('device-1')).rejects.toThrow('No Spotify authorization found');
  });

  it('transfers playback to the kiosk browser device before starting playback', async () => {
    const service = new SpotifyService();
    vi.spyOn(service, 'getAccessToken').mockResolvedValue('user-access-token');

    await service.transferPlayback('browser-device-1', true);

    expect(mockAxiosPut).toHaveBeenCalledWith(
      'https://api.spotify.com/v1/me/player',
      {
        device_ids: ['browser-device-1'],
        play: true,
      },
      {
        headers: { Authorization: 'Bearer user-access-token' },
      }
    );
  });

  it('returns the effective redirect uri as readonly metadata', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [],
    });

    const service = new SpotifyService();
    const config = await service.getSpotifyAppConfig();

    expect(config.redirectUri).toBe(process.env.SPOTIFY_REDIRECT_URI);
    expect(config.redirectUriReadOnly).toBe(true);
  });
});
