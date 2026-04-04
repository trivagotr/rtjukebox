import fs from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { buildVisibleQueueState, getQueueInsertPriorityScore, resolveQueueSongSelection } from './jukebox';
import { ROLES } from '../middleware/rbac';

describe('jukebox queue contract', () => {
  it('allows spotify tracks to be enqueued by spotify_uri', async () => {
    const resolveSpotifyTrackByUri = vi.fn().mockResolvedValue({
      spotify_uri: 'spotify:track:123',
      spotify_id: '123',
      title: 'Spotify Song',
      artist: 'Spotify Artist',
      artist_id: 'artist-1',
      album: 'Spotify Album',
      cover_url: 'https://example.com/cover.jpg',
      duration_ms: 180000,
      explicit: false,
    });
    const upsertSpotifyTrack = vi.fn().mockResolvedValue('song-spotify-1');

    await expect(
      resolveQueueSongSelection({
        request: { spotify_uri: 'spotify:track:123' },
        requesterRole: ROLES.USER,
        loadSongById: vi.fn(),
        resolveSpotifyTrackByUri,
        upsertSpotifyTrack,
      }),
    ).resolves.toEqual({
      songId: 'song-spotify-1',
      sourceType: 'spotify',
      queueReason: 'user',
    });

    expect(resolveSpotifyTrackByUri).toHaveBeenCalledWith('spotify:track:123');
    expect(upsertSpotifyTrack).toHaveBeenCalled();
  });

  it('allows public local songs to be enqueued by song_id', async () => {
    await expect(
      resolveQueueSongSelection({
        request: { song_id: 'song-local-1' },
        requesterRole: ROLES.USER,
        loadSongById: vi.fn().mockResolvedValue({
          id: 'song-local-1',
          source_type: 'local',
          visibility: 'public',
          asset_role: 'music',
        }),
        resolveSpotifyTrackByUri: vi.fn(),
        upsertSpotifyTrack: vi.fn(),
      }),
    ).resolves.toEqual({
      songId: 'song-local-1',
      sourceType: 'local',
      queueReason: 'user',
    });
  });

  it('rejects hidden local assets for non-admin queue requests', async () => {
    await expect(
      resolveQueueSongSelection({
        request: { song_id: 'song-hidden-1' },
        requesterRole: ROLES.USER,
        loadSongById: vi.fn().mockResolvedValue({
          id: 'song-hidden-1',
          source_type: 'local',
          visibility: 'hidden',
          asset_role: 'ad',
        }),
        resolveSpotifyTrackByUri: vi.fn(),
        upsertSpotifyTrack: vi.fn(),
      }),
    ).rejects.toThrow('Hidden local assets cannot be queued by non-admin users');
  });

  it('adds queue_reason to queue_items for hybrid queue visibility rules', () => {
    const schemaPath = path.resolve(__dirname, '../db/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    expect(schema).toContain("queue_reason VARCHAR(20) NOT NULL DEFAULT 'user'");
    expect(schema).toContain('ALTER TABLE queue_items ADD COLUMN IF NOT EXISTS queue_reason VARCHAR(20);');
  });

  it('starts pending queue items at zero song score', () => {
    expect(getQueueInsertPriorityScore()).toBe(0);
  });

  it('hides pending jingle and ad items from the visible queue while preserving now playing', () => {
    const visibleState = buildVisibleQueueState([
      { id: 'playing-ad', status: 'playing', queue_reason: 'ad', title: 'Sponsor Spot' },
      { id: 'pending-user', status: 'pending', queue_reason: 'user', title: 'User Pick' },
      { id: 'pending-autoplay', status: 'pending', queue_reason: 'autoplay', title: 'Playlist Song' },
      { id: 'pending-jingle', status: 'pending', queue_reason: 'jingle', title: 'Station Jingle' },
      { id: 'pending-ad', status: 'pending', queue_reason: 'ad', title: 'Ad Break' },
    ]);

    expect(visibleState.now_playing).toMatchObject({
      id: 'playing-ad',
      queue_reason: 'ad',
    });
    expect(visibleState.queue).toHaveLength(2);
    expect(visibleState.queue.map((item) => item.id)).toEqual(['pending-user', 'pending-autoplay']);
  });
});
