import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SpotifyExplicitFilter,
  BlacklistFilter,
  LyricsProfanityFilter,
  ContentFilterService,
  SpotifyTrack,
} from './contentFilter';
import * as lyricsService from './lyrics';
import * as profanityService from './profanityFilter';
import { db } from '../db';

vi.mock('../db', () => ({
  db: {
    query: vi.fn(),
  },
}));

vi.mock('./lyrics', () => ({
  fetchLyrics: vi.fn(),
}));

vi.mock('./profanityFilter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./profanityFilter')>();
  return {
    ...actual,
    getContentFilterSettings: vi.fn(),
    getDbBlockedKeywords: vi.fn(),
  };
});

describe('ContentFilterService & Filters', () => {
  const sampleCleanTrack: SpotifyTrack = {
    spotify_uri: 'spotify:track:clean123',
    spotify_id: 'clean123',
    title: 'Clean Song',
    artist: 'Clean Artist',
    artist_id: 'art123',
    album: 'Clean Album',
    cover_url: 'https://example.com/cover.jpg',
    duration_ms: 200000,
    explicit: false,
    popularity: 50,
  };

  const sampleExplicitSpotifyTrack: SpotifyTrack = {
    ...sampleCleanTrack,
    spotify_uri: 'spotify:track:exp123',
    spotify_id: 'exp123',
    title: 'Explicit Song',
    explicit: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.query).mockResolvedValue({ rows: [] } as any);
    vi.mocked(profanityService.getContentFilterSettings).mockResolvedValue({
      lyrics_filter_enabled: true,
      block_unverified_obscure_tracks: true,
      min_popularity_without_lyrics: 15,
    });
    vi.mocked(profanityService.getDbBlockedKeywords).mockResolvedValue([]);
  });

  describe('SpotifyExplicitFilter', () => {
    const filter = new SpotifyExplicitFilter();

    it('allows non-explicit tracks', async () => {
      expect(await filter.isAllowed(sampleCleanTrack)).toBe(true);
    });

    it('rejects explicit tracks', async () => {
      expect(await filter.isAllowed(sampleExplicitSpotifyTrack)).toBe(false);
      expect(filter.getReason(sampleExplicitSpotifyTrack)).toContain('explicit');
    });
  });

  describe('BlacklistFilter', () => {
    const filter = new BlacklistFilter();

    it('allows tracks that are not blocked in DB', async () => {
      vi.mocked(db.query).mockResolvedValue({ rows: [] } as any);
      expect(await filter.isAllowed(sampleCleanTrack)).toBe(true);
    });

    it('rejects tracks whose spotify_id is blocked', async () => {
      vi.mocked(db.query).mockImplementation(async (sql: string) => {
        if (sql.includes('FROM songs WHERE spotify_id')) {
          return { rows: [{ 1: 1 }] } as any;
        }
        return { rows: [] } as any;
      });
      expect(await filter.isAllowed(sampleCleanTrack)).toBe(false);
    });

    it('rejects tracks whose artist is blocked', async () => {
      vi.mocked(db.query).mockImplementation(async (sql: string) => {
        if (sql.includes('FROM blocked_artists WHERE spotify_artist_id')) {
          return { rows: [{ 1: 1 }] } as any;
        }
        return { rows: [] } as any;
      });
      expect(await filter.isAllowed(sampleCleanTrack)).toBe(false);
    });
  });

  describe('LyricsProfanityFilter', () => {
    const filter = new LyricsProfanityFilter();

    it('allows clean lyrics', async () => {
      vi.mocked(lyricsService.fetchLyrics).mockResolvedValue({
        synced: true,
        lines: [{ time: 0, text: 'Güneş doğuyor sokakta' }],
        plainLyrics: 'Güneş doğuyor sokakta',
        title: 'Clean Song',
        artist: 'Clean Artist',
      });

      expect(await filter.isAllowed(sampleCleanTrack)).toBe(true);
    });

    it('rejects profane lyrics', async () => {
      vi.mocked(lyricsService.fetchLyrics).mockResolvedValue({
        synced: true,
        lines: [{ time: 0, text: 'Böyle işin amk siktir git' }],
        plainLyrics: 'Böyle işin amk siktir git',
        title: 'Clean Song',
        artist: 'Clean Artist',
      });

      expect(await filter.isAllowed(sampleCleanTrack)).toBe(false);
      expect(filter.getReason(sampleCleanTrack)).toContain('uygunsuz/küfürlü içerik');
    });

    it('rejects obscure unverified track without lyrics when popularity < threshold', async () => {
      vi.mocked(lyricsService.fetchLyrics).mockResolvedValue(null);

      const obscureTrack: SpotifyTrack = {
        ...sampleCleanTrack,
        popularity: 5, // Below threshold 15
      };

      expect(await filter.isAllowed(obscureTrack)).toBe(false);
      expect(filter.getReason(obscureTrack)).toContain('popülaritesi eşik değerin altında');
    });

    it('allows popular track without lyrics (e.g. popular instrumental)', async () => {
      vi.mocked(lyricsService.fetchLyrics).mockResolvedValue(null);

      const popularInstrumental: SpotifyTrack = {
        ...sampleCleanTrack,
        popularity: 65, // Well above threshold 15
      };

      expect(await filter.isAllowed(popularInstrumental)).toBe(true);
    });
  });
});
