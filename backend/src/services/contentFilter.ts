// Content Filtering Pipeline for RadioTEDU Jukebox
import { db } from '../db';
import { fetchLyrics } from './lyrics';
import {
  checkProfanityText,
  getContentFilterSettings,
  getDbBlockedKeywords,
} from './profanityFilter';

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
  popularity?: number;
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
    // Check blocked songs by spotify_id
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

/**
 * Inspects track lyrics for profanity and explicit content,
 * and enforces popularity thresholds for unverified tracks without lyrics.
 */
export class LyricsProfanityFilter implements ContentFilter {
  name = 'LyricsProfanityFilter';
  private lastReason = 'Track lyrics contain explicit or inappropriate language';

  async isAllowed(track: SpotifyTrack): Promise<boolean> {
    const settings = await getContentFilterSettings();
    if (!settings.lyrics_filter_enabled) {
      return true;
    }

    try {
      const lyricsData = await fetchLyrics({
        title: track.title,
        artist: track.artist,
        durationSeconds: track.duration_ms ? track.duration_ms / 1000 : undefined,
        album: track.album,
      });

      if (lyricsData && (lyricsData.plainLyrics || lyricsData.lines?.length > 0)) {
        const fullText = lyricsData.plainLyrics || lyricsData.lines.map((l) => l.text).join('\n');
        const customKeywords = await getDbBlockedKeywords();
        const check = checkProfanityText(fullText, customKeywords);

        if (check.isProfane) {
          this.lastReason = `Şarkı sözlerinde uygunsuz/küfürlü içerik tespit edildi (${check.matchedWord || 'Yasaklı içerik'})`;
          return false;
        }

        return true;
      }
    } catch (err) {
      console.warn(`[LyricsFilter] Failed to inspect lyrics for ${track.artist} - ${track.title}:`, err);
    }

    // Lyrics were not found
    if (settings.block_unverified_obscure_tracks) {
      if (typeof track.popularity === 'number' && track.popularity < settings.min_popularity_without_lyrics) {
        this.lastReason = `Şarkının sözleri doğrulanamadı ve popülaritesi eşik değerin altında (${track.popularity}/${settings.min_popularity_without_lyrics}) olduğu için eklenemedi`;
        return false;
      }
    }

    return true;
  }

  getReason(_track: SpotifyTrack): string {
    return this.lastReason;
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
export function createDefaultFilterService(options?: { includeLyricsFilter?: boolean }): ContentFilterService {
  const service = new ContentFilterService();
  service.addFilter(new SpotifyExplicitFilter());
  service.addFilter(new BlacklistFilter());
  if (options?.includeLyricsFilter !== false) {
    service.addFilter(new LyricsProfanityFilter());
  }
  return service;
}
