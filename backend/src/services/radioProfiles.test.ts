import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  buildAutoplaySelection,
  buildSystemQueueInsertions,
  loadEffectiveRadioProfileConfig,
  resolveEffectiveRadioProfileConfig,
} from './radioProfiles';

describe('radio profile configuration', () => {
  it('uses profile defaults when device overrides are disabled', () => {
    expect(
      resolveEffectiveRadioProfileConfig({
        profile: {
          id: 'profile-1',
          autoplaySpotifyPlaylistUri: 'spotify:playlist:profile-default',
          jingleEveryNSongs: 4,
          adBreakIntervalMinutes: 30,
        },
        device: {
          radioProfileId: 'profile-1',
          overrideEnabled: false,
          overrideAutoplaySpotifyPlaylistUri: 'spotify:playlist:device-override',
          overrideJingleEveryNSongs: 2,
          overrideAdBreakIntervalMinutes: 15,
        },
      }),
    ).toEqual({
      radioProfileId: 'profile-1',
      autoplaySpotifyPlaylistUri: 'spotify:playlist:profile-default',
      jingleEveryNSongs: 4,
      adBreakIntervalMinutes: 30,
      overrideEnabled: false,
    });
  });

  it('uses device override values when overrides are enabled', () => {
    expect(
      resolveEffectiveRadioProfileConfig({
        profile: {
          id: 'profile-1',
          autoplaySpotifyPlaylistUri: 'spotify:playlist:profile-default',
          jingleEveryNSongs: 4,
          adBreakIntervalMinutes: 30,
        },
        device: {
          radioProfileId: 'profile-1',
          overrideEnabled: true,
          overrideAutoplaySpotifyPlaylistUri: 'spotify:playlist:device-override',
          overrideJingleEveryNSongs: 2,
          overrideAdBreakIntervalMinutes: 15,
        },
      }),
    ).toEqual({
      radioProfileId: 'profile-1',
      autoplaySpotifyPlaylistUri: 'spotify:playlist:device-override',
      jingleEveryNSongs: 2,
      adBreakIntervalMinutes: 15,
      overrideEnabled: true,
    });
  });

  it('falls back to profile values for missing override fields', () => {
    expect(
      resolveEffectiveRadioProfileConfig({
        profile: {
          id: 'profile-1',
          autoplaySpotifyPlaylistUri: 'spotify:playlist:profile-default',
          jingleEveryNSongs: 4,
          adBreakIntervalMinutes: 30,
        },
        device: {
          radioProfileId: 'profile-1',
          overrideEnabled: true,
          overrideAutoplaySpotifyPlaylistUri: null,
          overrideJingleEveryNSongs: null,
          overrideAdBreakIntervalMinutes: 15,
        },
      }),
    ).toEqual({
      radioProfileId: 'profile-1',
      autoplaySpotifyPlaylistUri: 'spotify:playlist:profile-default',
      jingleEveryNSongs: 4,
      adBreakIntervalMinutes: 15,
      overrideEnabled: true,
    });
  });

  it('defines the radio profile tables and device override columns in schema.sql', () => {
    const schemaPath = path.resolve(__dirname, '../db/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    expect(schema).toContain('CREATE TABLE IF NOT EXISTS radio_profiles (');
    expect(schema).toContain('autoplay_spotify_playlist_uri VARCHAR(255)');
    expect(schema).toContain('jingle_every_n_songs INTEGER');
    expect(schema).toContain('ad_break_interval_minutes INTEGER');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS radio_profile_assets (');
    expect(schema).toContain('slot_type VARCHAR(20) NOT NULL');
    expect(schema).toContain('ALTER TABLE devices ADD COLUMN IF NOT EXISTS radio_profile_id UUID;');
    expect(schema).toContain('ALTER TABLE devices ADD COLUMN IF NOT EXISTS override_enabled BOOLEAN DEFAULT FALSE;');
    expect(schema).toContain(
      'ALTER TABLE devices ADD COLUMN IF NOT EXISTS override_autoplay_spotify_playlist_uri VARCHAR(255);',
    );
    expect(schema).toContain('ALTER TABLE devices ADD COLUMN IF NOT EXISTS override_jingle_every_n_songs INTEGER;');
    expect(schema).toContain(
      'ALTER TABLE devices ADD COLUMN IF NOT EXISTS override_ad_break_interval_minutes INTEGER;',
    );
    expect(schema).toContain('ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_ad_break_at TIMESTAMP;');
  });

  it('loads and resolves the effective config for a device from joined profile data', async () => {
    const dbClient = {
      query: async () => ({
        rows: [
          {
            radio_profile_id: 'profile-1',
            override_enabled: true,
            override_autoplay_spotify_playlist_uri: null,
            override_jingle_every_n_songs: 2,
            override_ad_break_interval_minutes: null,
            last_ad_break_at: new Date('2026-03-30T12:00:00.000Z'),
            profile_id: 'profile-1',
            autoplay_spotify_playlist_uri: 'spotify:playlist:profile-default',
            jingle_every_n_songs: 4,
            ad_break_interval_minutes: 30,
          },
        ],
      }),
    };

    await expect(loadEffectiveRadioProfileConfig({ deviceId: 'device-1', dbClient })).resolves.toEqual({
      radioProfileId: 'profile-1',
      autoplaySpotifyPlaylistUri: 'spotify:playlist:profile-default',
      jingleEveryNSongs: 2,
      adBreakIntervalMinutes: 30,
      overrideEnabled: true,
      lastAdBreakAt: new Date('2026-03-30T12:00:00.000Z'),
    });
  });

  it('queues one random jingle when the cadence threshold is hit', () => {
    expect(
      buildSystemQueueInsertions({
        effectiveConfig: {
          radioProfileId: 'profile-1',
          autoplaySpotifyPlaylistUri: 'spotify:playlist:profile-default',
          jingleEveryNSongs: 3,
          adBreakIntervalMinutes: 30,
          overrideEnabled: false,
          lastAdBreakAt: new Date('2026-03-30T11:55:00.000Z'),
        },
        completedNormalMusicItem: true,
        completedMusicCount: 6,
        now: new Date('2026-03-30T12:00:00.000Z'),
        jinglePool: [{ id: 'jingle-1' }, { id: 'jingle-2' }],
        adPool: [],
        random: () => 0.75,
      }),
    ).toEqual([{ songId: 'jingle-2', queueReason: 'jingle' }]);
  });

  it('queues the full ad block when the ad interval elapses', () => {
    expect(
      buildSystemQueueInsertions({
        effectiveConfig: {
          radioProfileId: 'profile-1',
          autoplaySpotifyPlaylistUri: 'spotify:playlist:profile-default',
          jingleEveryNSongs: 3,
          adBreakIntervalMinutes: 30,
          overrideEnabled: false,
          lastAdBreakAt: new Date('2026-03-30T11:20:00.000Z'),
        },
        completedNormalMusicItem: true,
        completedMusicCount: 5,
        now: new Date('2026-03-30T12:00:00.000Z'),
        jinglePool: [{ id: 'jingle-1' }],
        adPool: [{ id: 'ad-1' }, { id: 'ad-2' }],
        random: () => 0.25,
      }),
    ).toEqual([
      { songId: 'ad-1', queueReason: 'ad' },
      { songId: 'ad-2', queueReason: 'ad' },
    ]);
  });

  it('skips scheduling when no eligible pool items exist', () => {
    expect(
      buildSystemQueueInsertions({
        effectiveConfig: {
          radioProfileId: 'profile-1',
          autoplaySpotifyPlaylistUri: 'spotify:playlist:profile-default',
          jingleEveryNSongs: 2,
          adBreakIntervalMinutes: 30,
          overrideEnabled: false,
          lastAdBreakAt: new Date('2026-03-30T11:50:00.000Z'),
        },
        completedNormalMusicItem: false,
        completedMusicCount: 4,
        now: new Date('2026-03-30T12:00:00.000Z'),
        jinglePool: [],
        adPool: [],
        random: () => 0.5,
      }),
    ).toEqual([]);
  });

  it('selects an autoplay track from the effective profile playlist candidates', () => {
    expect(
      buildAutoplaySelection({
        playlistUri: 'spotify:playlist:profile-default',
        tracks: [
          { spotify_uri: 'spotify:track:1', title: 'Track 1' },
          { spotify_uri: 'spotify:track:2', title: 'Track 2' },
        ],
        random: () => 0.99,
      }),
    ).toEqual({
      queueReason: 'autoplay',
      track: { spotify_uri: 'spotify:track:2', title: 'Track 2' },
    });
  });

  it('prefers the least-played track for profile autoplay selection', () => {
    const params: any = {
      playlistUri: 'spotify:playlist:profile-default',
      tracks: [
        { spotify_uri: 'spotify:track:1', title: 'Track 1' },
        { spotify_uri: 'spotify:track:2', title: 'Track 2' },
        { spotify_uri: 'spotify:track:3', title: 'Track 3' },
      ],
      autoplayStats: [
        { spotify_uri: 'spotify:track:1', play_count: 4, last_played_at: new Date('2026-03-30T10:00:00.000Z') },
        { spotify_uri: 'spotify:track:2', play_count: 1, last_played_at: new Date('2026-03-30T11:00:00.000Z') },
        { spotify_uri: 'spotify:track:3', play_count: 7, last_played_at: new Date('2026-03-30T12:00:00.000Z') },
      ],
      random: () => 0.99,
    };

    expect(buildAutoplaySelection(params)).toEqual({
      queueReason: 'autoplay',
      track: { spotify_uri: 'spotify:track:2', title: 'Track 2' },
    });
  });

  it('treats missing autoplay stats as zero plays', () => {
    const params: any = {
      playlistUri: 'spotify:playlist:profile-default',
      tracks: [
        { spotify_uri: 'spotify:track:1', title: 'Track 1' },
        { spotify_uri: 'spotify:track:2', title: 'Track 2' },
      ],
      autoplayStats: [
        { spotify_uri: 'spotify:track:1', play_count: 3, last_played_at: new Date('2026-03-30T10:00:00.000Z') },
      ],
      random: () => 0.4,
    };

    expect(buildAutoplaySelection(params)).toEqual({
      queueReason: 'autoplay',
      track: { spotify_uri: 'spotify:track:2', title: 'Track 2' },
    });
  });

  it('breaks ties by choosing randomly only among the minimum play count set', () => {
    const params: any = {
      playlistUri: 'spotify:playlist:profile-default',
      tracks: [
        { spotify_uri: 'spotify:track:1', title: 'Track 1' },
        { spotify_uri: 'spotify:track:2', title: 'Track 2' },
        { spotify_uri: 'spotify:track:3', title: 'Track 3' },
      ],
      autoplayStats: [
        { spotify_uri: 'spotify:track:1', play_count: 1, last_played_at: new Date('2026-03-30T10:00:00.000Z') },
        { spotify_uri: 'spotify:track:2', play_count: 1, last_played_at: new Date('2026-03-30T11:00:00.000Z') },
        { spotify_uri: 'spotify:track:3', play_count: 5, last_played_at: new Date('2026-03-30T12:00:00.000Z') },
      ],
      random: () => 0.99,
    };

    expect(buildAutoplaySelection(params)).toEqual({
      queueReason: 'autoplay',
      track: { spotify_uri: 'spotify:track:2', title: 'Track 2' },
    });
  });

  it('skips autoplay cleanly when no playlist is configured', () => {
    expect(
      buildAutoplaySelection({
        playlistUri: null,
        tracks: [{ spotify_uri: 'spotify:track:1', title: 'Track 1' }],
        random: () => 0.1,
      }),
    ).toBeNull();
  });
});
