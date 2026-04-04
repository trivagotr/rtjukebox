import fs from 'fs';
import path from 'path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

let jukeboxModule: typeof import('./jukebox');

beforeAll(async () => {
  process.env.SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || 'test-client';
  process.env.SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || 'test-secret';
  jukeboxModule = await import('./jukebox');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('jukebox automation runtime wiring', () => {
  it('recognizes completed normal music items for scheduling', () => {
    expect(jukeboxModule.isCompletedNormalMusicItem({ queue_reason: 'user', asset_role: 'music' })).toBe(true);
    expect(jukeboxModule.isCompletedNormalMusicItem({ queue_reason: 'autoplay', asset_role: 'music' })).toBe(true);
    expect(jukeboxModule.isCompletedNormalMusicItem({ queue_reason: 'ad', asset_role: 'ad' })).toBe(false);
  });

  it('queues a full ad block and updates last_ad_break_at when the interval has elapsed', async () => {
    const enqueueQueueItems = vi.fn().mockResolvedValue(undefined);
    const updateLastAdBreakAt = vi.fn().mockResolvedValue(undefined);

    const result = await jukeboxModule.maybeEnqueueProfileSystemItems({
      deviceId: 'device-1',
      completedNormalMusicItem: true,
      deps: {
        loadEffectiveConfig: vi.fn().mockResolvedValue({
          radioProfileId: 'profile-1',
          autoplaySpotifyPlaylistUri: 'spotify:playlist:profile-default',
          jingleEveryNSongs: 3,
          adBreakIntervalMinutes: 30,
          overrideEnabled: false,
          lastAdBreakAt: new Date('2026-03-30T11:20:00.000Z'),
        }),
        countCompletedMusic: vi.fn().mockResolvedValue(5),
        loadProfilePoolSongs: vi.fn(async (_profileId: string, slotType: 'jingle' | 'ad') =>
          slotType === 'ad' ? [{ id: 'ad-1' }, { id: 'ad-2' }] : [{ id: 'jingle-1' }],
        ),
        enqueueQueueItems,
        updateLastAdBreakAt,
        now: () => new Date('2026-03-30T12:00:00.000Z'),
        random: () => 0.5,
      },
    });

    expect(result).toEqual([
      { songId: 'ad-1', queueReason: 'ad' },
      { songId: 'ad-2', queueReason: 'ad' },
    ]);
    expect(enqueueQueueItems).toHaveBeenCalledWith({
      deviceId: 'device-1',
      insertions: [
        { songId: 'ad-1', queueReason: 'ad' },
        { songId: 'ad-2', queueReason: 'ad' },
      ],
    });
    expect(updateLastAdBreakAt).toHaveBeenCalledWith('device-1', new Date('2026-03-30T12:00:00.000Z'));
  });

  it('queues one random jingle when cadence is met for a completed normal track', async () => {
    const enqueueQueueItems = vi.fn().mockResolvedValue(undefined);
    const updateLastAdBreakAt = vi.fn().mockResolvedValue(undefined);

    const result = await jukeboxModule.maybeEnqueueProfileSystemItems({
      deviceId: 'device-1',
      completedNormalMusicItem: true,
      deps: {
        loadEffectiveConfig: vi.fn().mockResolvedValue({
          radioProfileId: 'profile-1',
          autoplaySpotifyPlaylistUri: 'spotify:playlist:profile-default',
          jingleEveryNSongs: 3,
          adBreakIntervalMinutes: 30,
          overrideEnabled: false,
          lastAdBreakAt: new Date('2026-03-30T11:55:00.000Z'),
        }),
        countCompletedMusic: vi.fn().mockResolvedValue(6),
        loadProfilePoolSongs: vi.fn(async (_profileId: string, slotType: 'jingle' | 'ad') =>
          slotType === 'jingle' ? [{ id: 'jingle-1' }, { id: 'jingle-2' }] : [],
        ),
        enqueueQueueItems,
        updateLastAdBreakAt,
        now: () => new Date('2026-03-30T12:00:00.000Z'),
        random: () => 0.8,
      },
    });

    expect(result).toEqual([{ songId: 'jingle-2', queueReason: 'jingle' }]);
    expect(enqueueQueueItems).toHaveBeenCalledWith({
      deviceId: 'device-1',
      insertions: [{ songId: 'jingle-2', queueReason: 'jingle' }],
    });
    expect(updateLastAdBreakAt).not.toHaveBeenCalled();
  });

  it('skips system scheduling for non-normal completed items', async () => {
    const enqueueQueueItems = vi.fn().mockResolvedValue(undefined);
    const loadEffectiveConfig = vi.fn().mockResolvedValue({
      radioProfileId: 'profile-1',
      autoplaySpotifyPlaylistUri: 'spotify:playlist:profile-default',
      jingleEveryNSongs: 2,
      adBreakIntervalMinutes: 30,
      overrideEnabled: false,
      lastAdBreakAt: new Date('2026-03-30T11:55:00.000Z'),
    });

    const result = await jukeboxModule.maybeEnqueueProfileSystemItems({
      deviceId: 'device-1',
      completedNormalMusicItem: false,
      deps: {
        loadEffectiveConfig,
        countCompletedMusic: vi.fn().mockResolvedValue(4),
        loadProfilePoolSongs: vi.fn().mockResolvedValue([{ id: 'jingle-1' }]),
        enqueueQueueItems,
        updateLastAdBreakAt: vi.fn().mockResolvedValue(undefined),
        now: () => new Date('2026-03-30T12:00:00.000Z'),
        random: () => 0.1,
      },
    });

    expect(result).toEqual([]);
    expect(loadEffectiveConfig).not.toHaveBeenCalled();
    expect(enqueueQueueItems).not.toHaveBeenCalled();
  });

  it('enqueues an autoplay track from the effective profile playlist', async () => {
    const enqueueQueueItems = vi.fn().mockResolvedValue(undefined);
    const upsertTrack = vi.fn().mockResolvedValue('song-spotify-2');
    const loadAutoplayStats = vi.fn().mockResolvedValue([
      { spotify_uri: 'spotify:track:1', play_count: 7, last_played_at: new Date('2026-03-30T09:00:00.000Z') },
      { spotify_uri: 'spotify:track:2', play_count: 1, last_played_at: new Date('2026-03-30T10:00:00.000Z') },
    ]);

    const result = await jukeboxModule.enqueueAutoplayForDevice({
      deviceId: 'device-1',
      deps: {
        loadEffectiveConfig: vi.fn().mockResolvedValue({
          radioProfileId: 'profile-1',
          autoplaySpotifyPlaylistUri: 'spotify:playlist:profile-default',
          jingleEveryNSongs: 3,
          adBreakIntervalMinutes: 30,
          overrideEnabled: false,
          lastAdBreakAt: null,
        }),
        getPlaylistTracks: vi.fn().mockResolvedValue([
          {
            spotify_uri: 'spotify:track:1',
            spotify_id: '1',
            title: 'Track 1',
            artist: 'Artist 1',
            artist_id: 'artist-1',
            album: 'Album 1',
            cover_url: 'https://example.com/1.jpg',
            duration_ms: 180000,
            explicit: false,
          },
          {
            spotify_uri: 'spotify:track:2',
            spotify_id: '2',
            title: 'Track 2',
            artist: 'Artist 2',
            artist_id: 'artist-2',
            album: 'Album 2',
            cover_url: 'https://example.com/2.jpg',
            duration_ms: 200000,
            explicit: false,
          },
        ]),
        filterTracks: vi.fn().mockResolvedValue([
          {
            spotify_uri: 'spotify:track:2',
            spotify_id: '2',
            title: 'Track 2',
            artist: 'Artist 2',
            artist_id: 'artist-2',
            album: 'Album 2',
            cover_url: 'https://example.com/2.jpg',
            duration_ms: 200000,
            explicit: false,
          },
        ]),
        loadAutoplayStats,
        upsertTrack,
        enqueueQueueItems,
        random: () => 0.9,
      },
    });

    expect(result).toMatchObject({
      spotify_uri: 'spotify:track:2',
      title: 'Track 2',
    });
    expect(upsertTrack).toHaveBeenCalled();
    expect(loadAutoplayStats).toHaveBeenCalledWith('profile-1', ['spotify:track:2']);
    expect(enqueueQueueItems).toHaveBeenCalledWith({
      deviceId: 'device-1',
      insertions: [{ songId: 'song-spotify-2', queueReason: 'autoplay', autoplayRadioProfileId: 'profile-1' }],
    });
  });

  it('falls back to a local public song when no playlist is configured', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const enqueueQueueItems = vi.fn().mockResolvedValue(undefined);

    const result = await jukeboxModule.enqueueAutoplayForDevice({
      deviceId: 'device-1',
      deps: {
        loadEffectiveConfig: vi.fn().mockResolvedValue({
          radioProfileId: null,
          autoplaySpotifyPlaylistUri: null,
          jingleEveryNSongs: null,
          adBreakIntervalMinutes: null,
          overrideEnabled: false,
          lastAdBreakAt: null,
        }),
        getPlaylistTracks: vi.fn(),
        filterTracks: vi.fn(),
        upsertTrack: vi.fn(),
        enqueueQueueItems,
        loadFallbackLocalSong: vi.fn().mockResolvedValue({
          id: 'song-local-1',
          title: 'Fallback Local',
        }),
        random: () => 0.5,
      },
    });

    expect(result).toEqual({
      id: 'song-local-1',
      title: 'Fallback Local',
      source_type: 'local',
    });
    expect(enqueueQueueItems).toHaveBeenCalledWith({
      deviceId: 'device-1',
      insertions: [{ songId: 'song-local-1', queueReason: 'autoplay', autoplayRadioProfileId: null }],
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('falls back to a local public song when playlist loading fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const enqueueQueueItems = vi.fn().mockResolvedValue(undefined);

    const result = await jukeboxModule.enqueueAutoplayForDevice({
      deviceId: 'device-1',
      deps: {
        loadEffectiveConfig: vi.fn().mockResolvedValue({
          radioProfileId: 'profile-1',
          autoplaySpotifyPlaylistUri: 'spotify:playlist:profile-default',
          jingleEveryNSongs: 3,
          adBreakIntervalMinutes: 30,
          overrideEnabled: false,
          lastAdBreakAt: null,
        }),
        getPlaylistTracks: vi.fn().mockRejectedValue(new Error('Spotify unavailable')),
        filterTracks: vi.fn(),
        upsertTrack: vi.fn(),
        enqueueQueueItems,
        loadFallbackLocalSong: vi.fn().mockResolvedValue({
          id: 'song-local-2',
          title: 'Fallback Local 2',
        }),
        random: () => 0.5,
      },
    });

    expect(result).toEqual({
      id: 'song-local-2',
      title: 'Fallback Local 2',
      source_type: 'local',
    });
    expect(enqueueQueueItems).toHaveBeenCalledWith({
      deviceId: 'device-1',
      insertions: [{ songId: 'song-local-2', queueReason: 'autoplay', autoplayRadioProfileId: 'profile-1' }],
    });
    expect(warnSpy).toHaveBeenCalled();
  });

  it('skips autoplay cleanly when playlist tracks are empty after filtering', async () => {
    const enqueueQueueItems = vi.fn().mockResolvedValue(undefined);
    const upsertTrack = vi.fn().mockResolvedValue('song-spotify-2');

    const result = await jukeboxModule.enqueueAutoplayForDevice({
      deviceId: 'device-1',
      deps: {
        loadEffectiveConfig: vi.fn().mockResolvedValue({
          radioProfileId: 'profile-1',
          autoplaySpotifyPlaylistUri: 'spotify:playlist:profile-default',
          jingleEveryNSongs: 3,
          adBreakIntervalMinutes: 30,
          overrideEnabled: false,
          lastAdBreakAt: null,
        }),
        getPlaylistTracks: vi.fn().mockResolvedValue([
          {
            spotify_uri: 'spotify:track:2',
            spotify_id: '2',
            title: 'Track 2',
            artist: 'Artist 2',
            artist_id: 'artist-2',
            album: 'Album 2',
            cover_url: 'https://example.com/2.jpg',
            duration_ms: 200000,
            explicit: false,
          },
        ]),
        filterTracks: vi.fn().mockResolvedValue([]),
        upsertTrack,
        enqueueQueueItems,
        loadFallbackLocalSong: vi.fn().mockResolvedValue(null),
        random: () => 0.9,
      },
    });

    expect(result).toBeNull();
    expect(upsertTrack).not.toHaveBeenCalled();
    expect(enqueueQueueItems).not.toHaveBeenCalled();
  });

  it('loads autoplay stats by profile id and spotify uri', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          spotify_uri: 'spotify:track:2',
          play_count: 4,
          last_played_at: new Date('2026-03-30T10:00:00.000Z'),
        },
      ],
    });

    const result = await jukeboxModule.loadAutoplayStatsForProfile({
      radioProfileId: 'profile-1',
      spotifyUris: ['spotify:track:1', 'spotify:track:2'],
      dbClient: { query },
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('radio_profile_playlist_stats'),
      ['profile-1', ['spotify:track:1', 'spotify:track:2']],
    );
    expect(result).toEqual([
      {
        spotify_uri: 'spotify:track:2',
        play_count: 4,
        last_played_at: new Date('2026-03-30T10:00:00.000Z'),
      },
    ]);
  });

  it('increments autoplay play_count only when an autoplay spotify item starts playing', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'queue-1',
            queue_reason: 'autoplay',
            source_type: 'spotify',
            spotify_uri: 'spotify:track:99',
            autoplay_radio_profile_id: 'profile-1',
            radio_profile_id: 'profile-current',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      jukeboxModule.recordAutoplayPlaybackStart({
        queueItemId: 'queue-1',
        dbClient: { query },
      }),
    ).resolves.toBe(true);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('queue_items qi'),
      ['queue-1'],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('radio_profile_playlist_stats'),
      ['profile-1', 'spotify:track:99'],
    );
  });

  it('does not mutate autoplay stats for non-autoplay items', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: 'queue-2',
          queue_reason: 'user',
          source_type: 'spotify',
          spotify_uri: 'spotify:track:98',
          autoplay_radio_profile_id: 'profile-1',
          radio_profile_id: 'profile-1',
        },
      ],
    });

    await expect(
      jukeboxModule.recordAutoplayPlaybackStart({
        queueItemId: 'queue-2',
        dbClient: { query },
      }),
    ).resolves.toBe(false);

    expect(query).toHaveBeenCalledTimes(1);
  });

  it('defines a profile autoplay stats table in schema.sql', () => {
    const schemaPath = path.resolve(__dirname, '../db/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    expect(schema).toContain('CREATE TABLE IF NOT EXISTS radio_profile_playlist_stats (');
    expect(schema).toContain('UNIQUE(radio_profile_id, spotify_uri)');
  });
});
