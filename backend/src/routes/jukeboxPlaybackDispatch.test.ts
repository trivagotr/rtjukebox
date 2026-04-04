import { beforeAll, describe, expect, it, vi } from 'vitest';

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
  it('marks a freshly queued spotify item as eligible for immediate autostart when the device is idle', () => {
    expect(
      jukeboxModule.shouldImmediatelyStartSpotifyQueueItem({
        song: {
          source_type: 'spotify',
          spotify_uri: 'spotify:track:123',
        },
        currentSongId: null,
        pendingCount: 1,
        playbackTarget: {
          spotify_playback_device_id: 'browser-device-1',
          spotify_player_is_active: true,
        },
      }),
    ).toBe(true);
  });

  it('does not immediately autostart spotify when the device is already busy or queue order is non-trivial', () => {
    expect(
      jukeboxModule.shouldImmediatelyStartSpotifyQueueItem({
        song: {
          source_type: 'spotify',
          spotify_uri: 'spotify:track:123',
        },
        currentSongId: 'song-1',
        pendingCount: 1,
        playbackTarget: {
          spotify_playback_device_id: 'browser-device-1',
          spotify_player_is_active: true,
        },
      }),
    ).toBe(false);

    expect(
      jukeboxModule.shouldImmediatelyStartSpotifyQueueItem({
        song: {
          source_type: 'spotify',
          spotify_uri: 'spotify:track:123',
        },
        currentSongId: null,
        pendingCount: 2,
        playbackTarget: {
          spotify_playback_device_id: 'browser-device-1',
          spotify_player_is_active: true,
        },
      }),
    ).toBe(false);

    expect(
      jukeboxModule.shouldImmediatelyStartSpotifyQueueItem({
        song: {
          source_type: 'spotify',
          spotify_uri: 'spotify:track:123',
        },
        currentSongId: null,
        pendingCount: 1,
        playbackTarget: {
          spotify_playback_device_id: null,
          spotify_player_is_active: true,
        },
      }),
    ).toBe(false);
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
        transferPlayback,
        playTrack,
      },
    });

    expect(result).toBe(true);
    expect(transferPlayback).toHaveBeenCalledWith('browser-device-1', true);
    expect(playTrack).toHaveBeenCalledWith('browser-device-1', 'spotify:track:123');
  });

  it('fails spotify dispatch when no kiosk playback device is registered', async () => {
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
          transferPlayback,
          playTrack,
        },
      }),
    ).rejects.toThrow('No active Spotify kiosk playback device registered');
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
});
