// Content Filtering Pipeline for RadioTEDU Jukebox
import { db } from '../db';

/**
 * Represents a Spotify track with the fields needed for content filtering.
 */
export interface SpotifyTrack {
  spotify_uri: string;
  spotify_id: string;
  title: string;
  artist: string;
  artist_id: string;
  album: string;
  cover_url: string;
  duration_ms: number;
  explicit: boolean;
}

/**
 * A single filter in the content filtering pipeline.
 * Each filter checks one policy (explicit content, blacklist, etc.).
 */
export interface ContentFilter {
  name: string;
  isAllowed(track: SpotifyTrack): Promise<boolean>;
  getReason(track: SpotifyTrack): string;
}

/**
 * Checks the Spotify `explicit` flag and rejects explicit tracks.
 */
export class SpotifyExplicitFilter implements ContentFilter {
  name = 'SpotifyExplicitFilter';

  async isAllowed(track: SpotifyTrack): Promise<boolean> {
    return !track.explicit;
  }

  getReason(_track: SpotifyTrack): string {
    return 'Track is marked as explicit by Spotify';
  }
}

/**
 * Checks the local database for blocked songs and blocked artists.
 *
 * A track is blocked if:
 *   1. Its spotify_id is in the `songs` table with `is_blocked = true`, OR
 *   2. Its artist_id matches `spotify_artist_id` in `blocked_artists`, OR
 *   3. Its artist name matches `artist_name` in `blocked_artists` (case-insensitive fallback)
 */
export class BlacklistFilter implements ContentFilter {
  name = 'BlacklistFilter';

  async isAllowed(track: SpotifyTrack): Promise<boolean> {
    // Check blocked songs by spotify_id (songs.spotify_id + is_blocked added in Phase 3 migration)
    if (track.spotify_id) {
      const songResult = await db.query(
        `SELECT 1 FROM songs WHERE spotify_id = $1 AND is_blocked = true LIMIT 1`,
        [track.spotify_id]
      );
      if (songResult.rows.length > 0) {
        return false;
      }
    }

    // Check blocked artists by spotify_artist_id
    if (track.artist_id) {
      const artistByIdResult = await db.query(
        `SELECT 1 FROM blocked_artists WHERE spotify_artist_id = $1 LIMIT 1`,
        [track.artist_id]
      );
      if (artistByIdResult.rows.length > 0) {
        return false;
      }
    }

    // Fallback: check blocked artists by name (case-insensitive)
    if (track.artist) {
      const artistByNameResult = await db.query(
        `SELECT 1 FROM blocked_artists WHERE LOWER(artist_name) = LOWER($1) LIMIT 1`,
        [track.artist]
      );
      if (artistByNameResult.rows.length > 0) {
        return false;
      }
    }

    return true;
  }

  getReason(_track: SpotifyTrack): string {
    return 'Track or artist is on the blocklist';
  }
}

export interface FilterResult {
  track: SpotifyTrack;
  allowed: boolean;
  rejectedBy?: string;
  reason?: string;
}

/**
 * Runs tracks through a pipeline of ContentFilter instances.
 * A track must pass ALL filters to be allowed.
 */
export class ContentFilterService {
  private filters: ContentFilter[] = [];

  addFilter(filter: ContentFilter): void {
    this.filters.push(filter);
  }

  getFilters(): ContentFilter[] {
    return [...this.filters];
  }

  /**
   * Filter an array of tracks, returning only those that pass all filters.
   */
  async filterTracks(tracks: SpotifyTrack[]): Promise<SpotifyTrack[]> {
    const results: SpotifyTrack[] = [];
    for (const track of tracks) {
      let allowed = true;
      for (const filter of this.filters) {
        if (!(await filter.isAllowed(track))) {
          allowed = false;
          break;
        }
      }
      if (allowed) results.push(track);
    }
    return results;
  }

  /**
   * Filter tracks and return detailed results including rejection reasons.
   */
  async filterTracksDetailed(tracks: SpotifyTrack[]): Promise<FilterResult[]> {
    const results: FilterResult[] = [];
    for (const track of tracks) {
      let allowed = true;
      let rejectedBy: string | undefined;
      let reason: string | undefined;
      for (const filter of this.filters) {
        if (!(await filter.isAllowed(track))) {
          allowed = false;
          rejectedBy = filter.name;
          reason = filter.getReason(track);
          break;
        }
      }
      results.push({ track, allowed, rejectedBy, reason });
    }
    return results;
  }
}

/**
 * Create a ContentFilterService pre-configured with the standard filters
 * for the RadioTEDU school jukebox.
 */
export function createDefaultFilterService(): ContentFilterService {
  const service = new ContentFilterService();
  service.addFilter(new SpotifyExplicitFilter());
  service.addFilter(new BlacklistFilter());
  return service;
}
