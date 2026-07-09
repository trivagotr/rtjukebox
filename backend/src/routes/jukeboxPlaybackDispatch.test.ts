import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { spotifyService } from '../services/spotify';

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

beforeAll(async () => {
  process.env.SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || 'test-client';
  process.env.SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || 'test-secret';
  jukeboxModule = await import('./jukebox');
});

describe('jukebox playback dispatch helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockDbQuery.mockReset();
  });

  it('builds a spotify playback descriptor from source metadata', () => {
    const descriptor = jukeboxModule.buildPlaybackDescriptor({
      source_type: 'spotify',
      spotify_uri: 'spotify:track:123',
      file_url: '/uploads/should-not-drive-local.mp3',
      asset_role: 'music',
    });

    expect(descriptor).toEqual({
      source_type: 'spotify',
      playback_type: 'spotify',
      spotify_uri: 'spotify:track:123',
      file_url: null,
      asset_role: 'music',
    });
  });

  it('builds a local playback descriptor from source metadata', () => {
    const descriptor = jukeboxModule.buildPlaybackDescriptor({
      source_type: 'local',
      spotify_uri: 'spotify:track:should-be-ignored',
      file_url: '/uploads/jingles/station-id.mp3',
      asset_role: 'jingle',
    });

    expect(descriptor).toEqual({
      source_type: 'local',
      playback_type: 'local',
      spotify_uri: null,
      file_url: '/uploads/jingles/station-id.mp3',
      asset_role: 'jingle',
    });
  });

  it('builds current-song fallback payloads with playback dispatch metadata', () => {
    const payload = jukeboxModule.buildCurrentSongFallbackItem({
      id: 'song-local-1',
      title: 'Station ID',
      artist: 'Radio TEDU',
      cover_url: null,
      duration_ms: 12000,
      spotify_uri: null,
      spotify_id: null,
      source_type: 'local',
      file_url: '/uploads/jingles/station-id.mp3',
      asset_role: 'jingle',
    });

    expect(payload).toMatchObject({
      id: 'current-song-local-1',
      song_id: 'song-local-1',
      title: 'Station ID',
      artist: 'Radio TEDU',
      status: 'playing',
      source_type: 'local',
      playback_type: 'local',
      spotify_uri: null,
      file_url: '/uploads/jingles/station-id.mp3',
      asset_role: 'jingle',
      added_by_name: 'Radio TEDU (Otomatik)',
      is_autoplay: true,
    });
  });

  it('resolves a spotify kiosk playback device only when the device is active', () => {
    expect(
      jukeboxModule.resolveSpotifyKioskPlaybackDeviceId({
        spotify_playback_device_id: 'browser-device-1',
        spotify_player_is_active: true,
      }),
    ).toBe('browser-device-1');

    expect(
      jukeboxModule.resolveSpotifyKioskPlaybackDeviceId({
        spotify_playback_device_id: 'browser-device-1',
        spotify_player_is_active: false,
      }),
    ).toBeNull();
  });

  it('dispatches spotify playback by transferring playback then playing the track', async () => {
    const getKioskPlaybackToken = vi.fn().mockResolvedValue({
      accessToken: 'device-access-token',
      tokenExpiresAt: new Date('2099-04-03T11:00:00.000Z'),
      scopes: 'streaming user-modify-playback-state user-read-playback-state',
    });
    const transferPlayback = vi.fn().mockResolvedValue(undefined);
    const playTrack = vi.fn().mockResolvedValue(undefined);
    mockDbQuery.mockResolvedValueOnce({
      rows: [
        {
          spotify_playback_device_id: 'browser-device-1',
          spotify_player_is_active: true,
        },
      ],
    });

    const result = await jukeboxModule.dispatchSpotifyPlaybackForSong({
      deviceId: 'device-1',
      song: {
        id: 'song-spotify-1',
        source_type: 'spotify',
        spotify_uri: 'spotify:track:123',
      },
      spotifyService: {
        getKioskPlaybackToken,
        transferPlayback,
        playTrack,
      },
    });

    expect(result).toBe(true);
    expect(getKioskPlaybackToken).toHaveBeenCalledWith('device-1');
    expect(transferPlayback).toHaveBeenCalledWith('browser-device-1', true, 'device-access-token');
    expect(playTrack).toHaveBeenCalledWith('browser-device-1', 'spotify:track:123', 'device-access-token');
  });

  it('marks a stale spotify browser player inactive when Spotify no longer knows that playback device', async () => {
    const getKioskPlaybackToken = vi.fn().mockResolvedValue({
      accessToken: 'device-access-token',
      tokenExpiresAt: new Date('2099-04-03T11:00:00.000Z'),
      scopes: 'streaming user-modify-playback-state user-read-playback-state',
    });
    const staleDeviceError = new Error('Device not found') as Error & {
      response?: { status: number; data: { error: { reason: string; message: string } } };
    };
    staleDeviceError.response = {
      status: 404,
      data: {
        error: {
          reason: 'NO_ACTIVE_DEVICE',
          message: 'Device not found',
        },
      },
    };
    const transferPlayback = vi.fn().mockRejectedValue(staleDeviceError);
    const playTrack = vi.fn();
    mockDbQuery
      .mockResolvedValueOnce({
        rows: [
          {
            spotify_playback_device_id: 'browser-device-1',
            spotify_player_is_active: true,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      jukeboxModule.dispatchSpotifyPlaybackForSong({
        deviceId: 'device-1',
        song: {
          id: 'song-spotify-1',
          source_type: 'spotify',
          spotify_uri: 'spotify:track:123',
        },
        spotifyService: {
          getKioskPlaybackToken,
          transferPlayback,
          playTrack,
        },
      }),
    ).rejects.toThrow('Device not found');

    expect(mockDbQuery.mock.calls.some(([sql, params]) =>
      String(sql).includes('spotify_player_is_active = false') &&
      String(sql).includes('spotify_playback_device_id = NULL') &&
      params?.[0] === 'device-1'
    )).toBe(true);
    expect(playTrack).not.toHaveBeenCalled();
  });

  it('refreshes the kiosk device token and retries spotify dispatch once when Spotify rejects the access token', async () => {
    const getKioskPlaybackToken = vi.fn().mockResolvedValue({
      accessToken: 'stale-device-access-token',
      tokenExpiresAt: new Date('2099-04-03T11:00:00.000Z'),
      scopes: 'streaming user-modify-playback-state user-read-playback-state',
    });
    const unauthorizedError = new Error('The access token expired') as Error & {
      response?: { status: number; data: { error: { status: number; message: string } } };
    };
    unauthorizedError.response = {
      status: 401,
      data: {
        error: {
          status: 401,
          message: 'The access token expired',
        },
      },
    };
    const refreshDeviceAccessToken = vi.fn().mockResolvedValue('fresh-device-access-token');
    const transferPlayback = vi.fn()
      .mockRejectedValueOnce(unauthorizedError)
      .mockResolvedValueOnce(undefined);
    const playTrack = vi.fn().mockResolvedValue(undefined);
    mockDbQuery.mockResolvedValueOnce({
      rows: [
        {
          spotify_playback_device_id: 'browser-device-1',
          spotify_player_is_active: true,
        },
      ],
    });

    const result = await jukeboxModule.dispatchSpotifyPlaybackForSong({
      deviceId: 'device-1',
      song: {
        id: 'song-spotify-1',
        source_type: 'spotify',
        spotify_uri: 'spotify:track:123',
      },
      spotifyService: {
        getKioskPlaybackToken,
        refreshDeviceAccessToken,
        transferPlayback,
        playTrack,
      },
    });

    expect(result).toBe(true);
    expect(refreshDeviceAccessToken).toHaveBeenCalledWith('device-1');
    expect(transferPlayback).toHaveBeenNthCalledWith(1, 'browser-device-1', true, 'stale-device-access-token');
    expect(transferPlayback).toHaveBeenNthCalledWith(2, 'browser-device-1', true, 'fresh-device-access-token');
    expect(playTrack).toHaveBeenCalledWith('browser-device-1', 'spotify:track:123', 'fresh-device-access-token');
  });

  it('marks the spotify browser player inactive when the refreshed dispatch retry finds a stale device', async () => {
    const getKioskPlaybackToken = vi.fn().mockResolvedValue({
      accessToken: 'stale-device-access-token',
      tokenExpiresAt: new Date('2099-04-03T11:00:00.000Z'),
      scopes: 'streaming user-modify-playback-state user-read-playback-state',
    });
    const unauthorizedError = new Error('The access token expired') as Error & {
      response?: { status: number; data: { error: { status: number; message: string } } };
    };
    unauthorizedError.response = {
      status: 401,
      data: {
        error: {
          status: 401,
          message: 'The access token expired',
        },
      },
    };
    const staleDeviceError = new Error('Device not found') as Error & {
      response?: { status: number; data: { error: { reason: string; message: string } } };
    };
    staleDeviceError.response = {
      status: 404,
      data: {
        error: {
          reason: 'DEVICE_NOT_FOUND',
          message: 'Device not found',
        },
      },
    };
    const refreshDeviceAccessToken = vi.fn().mockResolvedValue('fresh-device-access-token');
    const transferPlayback = vi.fn()
      .mockRejectedValueOnce(unauthorizedError)
      .mockRejectedValueOnce(staleDeviceError);
    const playTrack = vi.fn();
    mockDbQuery.mockResolvedValueOnce({
      rows: [
        {
          spotify_playback_device_id: 'browser-device-1',
          spotify_player_is_active: true,
        },
      ],
    });

    await expect(
      jukeboxModule.dispatchSpotifyPlaybackForSong({
        deviceId: 'device-1',
        song: {
          id: 'song-spotify-1',
          source_type: 'spotify',
          spotify_uri: 'spotify:track:123',
        },
        spotifyService: {
          getKioskPlaybackToken,
          refreshDeviceAccessToken,
          transferPlayback,
          playTrack,
        },
      }),
    ).rejects.toThrow('Device not found');

    expect(refreshDeviceAccessToken).toHaveBeenCalledWith('device-1');
    expect(transferPlayback).toHaveBeenNthCalledWith(1, 'browser-device-1', true, 'stale-device-access-token');
    expect(transferPlayback).toHaveBeenNthCalledWith(2, 'browser-device-1', true, 'fresh-device-access-token');
    expect(mockDbQuery.mock.calls.some(([sql, params]) =>
      String(sql).includes('spotify_player_is_active = false') &&
      String(sql).includes('spotify_playback_device_id = NULL') &&
      params?.[0] === 'device-1'
    )).toBe(true);
    expect(playTrack).not.toHaveBeenCalled();
  });

  it('fails spotify dispatch when no kiosk playback device is registered', async () => {
    const getKioskPlaybackToken = vi.fn();
    const transferPlayback = vi.fn();
    const playTrack = vi.fn();
    mockDbQuery.mockResolvedValueOnce({
      rows: [],
    });

    await expect(
      jukeboxModule.dispatchSpotifyPlaybackForSong({
        deviceId: 'device-1',
        song: {
          id: 'song-spotify-1',
          source_type: 'spotify',
          spotify_uri: 'spotify:track:123',
        },
        spotifyService: {
          getKioskPlaybackToken,
          transferPlayback,
          playTrack,
        },
      }),
    ).rejects.toThrow('No active Spotify kiosk playback device registered');
    expect(getKioskPlaybackToken).not.toHaveBeenCalled();
    expect(transferPlayback).not.toHaveBeenCalled();
    expect(playTrack).not.toHaveBeenCalled();
  });

  it('does nothing for local queue items', async () => {
    const transferPlayback = vi.fn();
    const playTrack = vi.fn();

    const result = await jukeboxModule.dispatchSpotifyPlaybackForSong({
      deviceId: 'device-1',
      song: {
        id: 'song-local-1',
        source_type: 'local',
        file_url: '/uploads/local.mp3',
        spotify_uri: null,
      },
      spotifyService: {
        getKioskPlaybackToken: vi.fn(),
        transferPlayback,
        playTrack,
      },
    });

    expect(result).toBe(false);
    expect(transferPlayback).not.toHaveBeenCalled();
    expect(playTrack).not.toHaveBeenCalled();
  });

  it('identifies a stopped spotify playback that should be reconciled', () => {
    expect(
      jukeboxModule.shouldRecoverStoppedSpotifyPlayback({
        context: {
          currentSong: {
            source_type: 'spotify',
            spotify_uri: 'spotify:track:iris',
            duration_ms: 289533,
          },
          playbackTargetDeviceId: 'browser-device-1',
          playbackTargetIsActive: true,
        },
        playbackSnapshot: {
          deviceId: 'browser-device-1',
          isPlaying: false,
          progressMs: 0,
          itemUri: 'spotify:track:iris',
        },
      }),
    ).toBe(true);

    expect(
      jukeboxModule.shouldRecoverStoppedSpotifyPlayback({
        context: {
          currentSong: {
            source_type: 'spotify',
            spotify_uri: 'spotify:track:iris',
            duration_ms: 289533,
          },
          playbackTargetDeviceId: 'browser-device-1',
          playbackTargetIsActive: true,
        },
        playbackSnapshot: null,
      }),
    ).toBe(true);

    expect(
      jukeboxModule.shouldRecoverStoppedSpotifyPlayback({
        context: {
          currentSong: {
            source_type: 'spotify',
            spotify_uri: 'spotify:track:iris',
            duration_ms: 289533,
          },
          playbackTargetDeviceId: 'browser-device-1',
          playbackTargetIsActive: true,
        },
        playbackSnapshot: {
          deviceId: 'browser-device-1',
          isPlaying: false,
          progressMs: 288,
          itemUri: 'spotify:track:iris',
        },
      }),
    ).toBe(true);

    expect(
      jukeboxModule.shouldRecoverStoppedSpotifyPlayback({
        context: {
          currentSong: {
            source_type: 'spotify',
            spotify_uri: 'spotify:track:iris',
            duration_ms: 289533,
          },
          playbackTargetDeviceId: 'browser-device-1',
          playbackTargetIsActive: true,
        },
        playbackSnapshot: {
          deviceId: 'browser-device-1',
          isPlaying: true,
          progressMs: 18448,
          itemUri: 'spotify:track:iris',
        },
      }),
    ).toBe(false);
  });

  it('reconciles a stopped spotify playback by finalizing the current item and starting the next pending song', async () => {
    const loadContext = vi.fn().mockResolvedValue({
      currentSong: {
        source_type: 'spotify',
        spotify_uri: 'spotify:track:iris',
        duration_ms: 289533,
      },
      playbackTargetDeviceId: 'browser-device-1',
      playbackTargetIsActive: true,
    });
    const getPlaybackSnapshot = vi.fn().mockResolvedValue({
      deviceId: 'browser-device-1',
      isPlaying: false,
      progressMs: 0,
      itemUri: 'spotify:track:iris',
    });
    const finalizeCurrentPlayingItem = vi.fn().mockResolvedValue(undefined);
    const loadNextPendingQueueItem = vi.fn().mockResolvedValue({
      id: 'queue-item-next',
      song_id: 'song-yellow',
      source_type: 'spotify',
      spotify_uri: 'spotify:track:yellow',
    });
    const enqueueAutoplay = vi.fn().mockResolvedValue(undefined);
    const startQueueItem = vi.fn().mockResolvedValue(undefined);
    const emitQueueUpdated = vi.fn().mockResolvedValue(undefined);

    const result = await jukeboxModule.reconcileStoppedSpotifyPlaybackForDevice({
      deviceId: 'device-1',
      deps: {
        loadContext,
        getPlaybackSnapshot,
        finalizeCurrentPlayingItem,
        loadNextPendingQueueItem,
        enqueueAutoplay,
        startQueueItem,
        emitQueueUpdated,
      },
    });

    expect(result).toEqual({
      recovered: true,
      nextQueueItemId: 'queue-item-next',
    });
    expect(finalizeCurrentPlayingItem).toHaveBeenCalledWith('device-1');
    expect(loadNextPendingQueueItem).toHaveBeenCalledWith('device-1');
    expect(enqueueAutoplay).not.toHaveBeenCalled();
    expect(startQueueItem).toHaveBeenCalledWith('device-1', {
      id: 'queue-item-next',
      song_id: 'song-yellow',
      source_type: 'spotify',
      spotify_uri: 'spotify:track:yellow',
    });
    expect(emitQueueUpdated).toHaveBeenCalledWith('device-1');
  });

  it('loads stopped playback snapshots with the kiosk device token instead of global admin auth', async () => {
    const getKioskPlaybackToken = vi.spyOn(spotifyService, 'getKioskPlaybackToken').mockResolvedValue({
      accessToken: 'device-access-token',
      tokenExpiresAt: new Date('2099-04-03T11:00:00.000Z'),
      scopes: 'streaming user-modify-playback-state user-read-playback-state',
    });
    const getCurrentPlaybackSnapshot = vi.spyOn(spotifyService, 'getCurrentPlaybackSnapshot').mockResolvedValue({
      deviceId: 'browser-device-1',
      isPlaying: true,
      progressMs: 18448,
      itemUri: 'spotify:track:iris',
    });
    const loadContext = vi.fn().mockResolvedValue({
      currentSong: {
        source_type: 'spotify',
        spotify_uri: 'spotify:track:iris',
        duration_ms: 289533,
      },
      playbackTargetDeviceId: 'browser-device-1',
      playbackTargetIsActive: true,
    });
    const finalizeCurrentPlayingItem = vi.fn();
    const loadNextPendingQueueItem = vi.fn();
    const enqueueAutoplay = vi.fn();
    const startQueueItem = vi.fn();
    const emitQueueUpdated = vi.fn();

    const result = await jukeboxModule.reconcileStoppedSpotifyPlaybackForDevice({
      deviceId: 'device-1',
      deps: {
        loadContext,
        finalizeCurrentPlayingItem,
        loadNextPendingQueueItem,
        enqueueAutoplay,
        startQueueItem,
        emitQueueUpdated,
      },
    });

    expect(result).toEqual({ recovered: false });
    expect(getKioskPlaybackToken).toHaveBeenCalledWith('device-1');
    expect(getCurrentPlaybackSnapshot).toHaveBeenCalledWith('device-access-token');
    expect(finalizeCurrentPlayingItem).not.toHaveBeenCalled();
  });

  it('refreshes the kiosk device token and retries stopped playback snapshots once when Spotify rejects the access token', async () => {
    const getKioskPlaybackToken = vi.spyOn(spotifyService, 'getKioskPlaybackToken').mockResolvedValue({
      accessToken: 'stale-device-access-token',
      tokenExpiresAt: new Date('2099-04-03T11:00:00.000Z'),
      scopes: 'streaming user-modify-playback-state user-read-playback-state',
    });
    const unauthorizedError = new Error('The access token expired') as Error & {
      response?: { status: number; data: { error: { status: number; message: string } } };
    };
    unauthorizedError.response = {
      status: 401,
      data: {
        error: {
          status: 401,
          message: 'The access token expired',
        },
      },
    };
    const refreshDeviceAccessToken = vi.spyOn(spotifyService, 'refreshDeviceAccessToken').mockResolvedValue('fresh-device-access-token');
    const getCurrentPlaybackSnapshot = vi.spyOn(spotifyService, 'getCurrentPlaybackSnapshot')
      .mockRejectedValueOnce(unauthorizedError)
      .mockResolvedValueOnce({
        deviceId: 'browser-device-1',
        isPlaying: true,
        progressMs: 18448,
        itemUri: 'spotify:track:iris',
      });
    const loadContext = vi.fn().mockResolvedValue({
      currentSong: {
        source_type: 'spotify',
        spotify_uri: 'spotify:track:iris',
        duration_ms: 289533,
      },
      playbackTargetDeviceId: 'browser-device-1',
      playbackTargetIsActive: true,
    });
    const finalizeCurrentPlayingItem = vi.fn();
    const loadNextPendingQueueItem = vi.fn();
    const enqueueAutoplay = vi.fn();
    const startQueueItem = vi.fn();
    const emitQueueUpdated = vi.fn();

    const result = await jukeboxModule.reconcileStoppedSpotifyPlaybackForDevice({
      deviceId: 'device-1',
      deps: {
        loadContext,
        finalizeCurrentPlayingItem,
        loadNextPendingQueueItem,
        enqueueAutoplay,
        startQueueItem,
        emitQueueUpdated,
      },
    });

    expect(result).toEqual({ recovered: false });
    expect(getKioskPlaybackToken).toHaveBeenCalledWith('device-1');
    expect(refreshDeviceAccessToken).toHaveBeenCalledWith('device-1');
    expect(getCurrentPlaybackSnapshot).toHaveBeenNthCalledWith(1, 'stale-device-access-token');
    expect(getCurrentPlaybackSnapshot).toHaveBeenNthCalledWith(2, 'fresh-device-access-token');
    expect(finalizeCurrentPlayingItem).not.toHaveBeenCalled();
  });

  it('leaves a recoverable spotify queue item pending when recovery cannot dispatch playback', async () => {
    const loadContext = vi.fn().mockResolvedValue({
      currentSong: {
        source_type: 'spotify',
        spotify_uri: 'spotify:track:iris',
        duration_ms: 289533,
      },
      playbackTargetDeviceId: 'browser-device-1',
      playbackTargetIsActive: true,
    });
    const getPlaybackSnapshot = vi.fn().mockResolvedValue({
      deviceId: 'browser-device-1',
      isPlaying: false,
      progressMs: 0,
      itemUri: 'spotify:track:iris',
    });
    const finalizeCurrentPlayingItem = vi.fn().mockResolvedValue(undefined);
    const loadNextPendingQueueItem = vi.fn().mockResolvedValue({
      id: 'queue-item-next',
      song_id: 'song-yellow',
      source_type: 'spotify',
      spotify_uri: 'spotify:track:yellow',
    });
    const enqueueAutoplay = vi.fn();
    const emitQueueUpdated = vi.fn();
    mockDbQuery.mockResolvedValue({
      rows: [{
        spotify_playback_device_id: 'browser-device-1',
        spotify_player_is_active: true,
      }],
    });
    vi.spyOn(spotifyService, 'getKioskPlaybackToken').mockRejectedValue(
      new Error('No Spotify authorization found for device')
    );

    const result = await jukeboxModule.reconcileStoppedSpotifyPlaybackForDevice({
      deviceId: 'device-1',
      deps: {
        loadContext,
        getPlaybackSnapshot,
        finalizeCurrentPlayingItem,
        loadNextPendingQueueItem,
        enqueueAutoplay,
        emitQueueUpdated,
      },
    });

    expect(result).toEqual({
      recovered: false,
      reason: 'spotify_dispatch_failed',
    });
    expect(finalizeCurrentPlayingItem).toHaveBeenCalledWith('device-1');
    expect(loadNextPendingQueueItem).toHaveBeenCalledWith('device-1');
    expect(emitQueueUpdated).not.toHaveBeenCalled();
    expect(mockDbQuery.mock.calls.some(([sql, params]) =>
      String(sql).includes("UPDATE queue_items SET status = 'playing'") &&
      params?.[0] === 'queue-item-next'
    )).toBe(false);
    expect(mockDbQuery.mock.calls.some(([sql, params]) =>
      String(sql).includes('UPDATE devices SET current_song_id = $2') &&
      params?.[0] === 'device-1' &&
      params?.[1] === 'song-yellow'
    )).toBe(false);
  });
});
