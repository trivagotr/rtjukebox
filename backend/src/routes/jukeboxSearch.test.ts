import { describe, expect, it } from 'vitest';
import { mergeSongCatalogSearchResults } from './jukebox';
import { normalizeSpotifySearchLimit, toCatalogSongSearchItem } from '../services/spotify';

describe('jukebox song catalog search', () => {
  it('preserves spotify results with hybrid source metadata', () => {
    const spotifyItem = toCatalogSongSearchItem({
      spotify_uri: 'spotify:track:1',
      spotify_id: 'track-1',
      title: 'Spotify Song',
      artist: 'Spotify Artist',
      artist_id: 'artist-1',
      album: 'Spotify Album',
      cover_url: 'https://example.com/cover.jpg',
      duration_ms: 180000,
      explicit: false,
    });

    expect(spotifyItem).toMatchObject({
      id: null,
      source_type: 'spotify',
      visibility: 'public',
      asset_role: 'music',
      spotify_uri: 'spotify:track:1',
      file_url: null,
    });
  });

  it('merges spotify results with local public songs', () => {
    const merged = mergeSongCatalogSearchResults({
      spotifyTracks: [
        {
          spotify_uri: 'spotify:track:1',
          spotify_id: 'track-1',
          title: 'Spotify Song',
          artist: 'Spotify Artist',
          artist_id: 'artist-1',
          album: 'Spotify Album',
          cover_url: 'https://example.com/cover.jpg',
          duration_ms: 180000,
          explicit: false,
        },
      ],
      localSongs: [
        {
          id: 'local-1',
          source_type: 'local',
          visibility: 'public',
          asset_role: 'music',
          title: 'Local Song',
          artist: 'Local Artist',
          artist_id: null,
          album: null,
          cover_url: null,
          duration_ms: null,
          duration_seconds: 210,
          is_explicit: false,
          is_blocked: false,
          spotify_uri: null,
          spotify_id: null,
          file_url: '/uploads/songs/local-song.mp3',
          play_count: 12,
          is_active: true,
        },
      ],
    });

    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ source_type: 'spotify', visibility: 'public' });
    expect(merged[1]).toMatchObject({
      id: 'local-1',
      source_type: 'local',
      visibility: 'public',
      asset_role: 'music',
      file_url: '/uploads/songs/local-song.mp3',
      duration_ms: 210000,
    });
  });

  it('excludes hidden local songs from merged user search results', () => {
    const merged = mergeSongCatalogSearchResults({
      spotifyTracks: [],
      localSongs: [
        {
          id: 'hidden-1',
          source_type: 'local',
          visibility: 'hidden',
          asset_role: 'ad',
          title: 'Hidden Ad',
          artist: 'Station',
          artist_id: null,
          album: null,
          cover_url: null,
          duration_ms: null,
          duration_seconds: 30,
          is_explicit: false,
          is_blocked: false,
          spotify_uri: null,
          spotify_id: null,
          file_url: '/uploads/songs/hidden-ad.mp3',
          play_count: 0,
          is_active: true,
        },
        {
          id: 'local-1',
          source_type: 'local',
          visibility: 'public',
          asset_role: 'music',
          title: 'Visible Local Song',
          artist: 'Local Artist',
          artist_id: null,
          album: null,
          cover_url: null,
          duration_ms: 240000,
          duration_seconds: 240,
          is_explicit: false,
          is_blocked: false,
          spotify_uri: null,
          spotify_id: null,
          file_url: '/uploads/songs/visible-local-song.mp3',
          play_count: 3,
          is_active: true,
        },
      ],
    });

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      id: 'local-1',
      source_type: 'local',
      visibility: 'public',
    });
  });

  it('clamps spotify search limits to the current API-safe range', () => {
    expect(normalizeSpotifySearchLimit(20)).toBe(10);
    expect(normalizeSpotifySearchLimit(50)).toBe(10);
    expect(normalizeSpotifySearchLimit(5.8)).toBe(5);
    expect(normalizeSpotifySearchLimit(0)).toBe(1);
  });
});
