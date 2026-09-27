import type { PrismaClient } from '../../../../generated/prisma/client.js';
import type { ModerationAdminRepository, ModerationSettings } from '../ports/moderation-admin.repository.js';

const defaults: ModerationSettings = { lyrics_filter_enabled: true, block_unverified_obscure_tracks: true, min_popularity_without_lyrics: 15 };
const defaultsToPrisma = (value: ModerationSettings) => ({ lyricsFilterEnabled: value.lyrics_filter_enabled, blockUnverifiedObscureTracks: value.block_unverified_obscure_tracks, minPopularityWithoutLyrics: value.min_popularity_without_lyrics });
const toSettings = (row: { lyricsFilterEnabled: boolean | null; blockUnverifiedObscureTracks: boolean | null; minPopularityWithoutLyrics: number | null } | null): ModerationSettings => row ? {
  lyrics_filter_enabled: row.lyricsFilterEnabled ?? defaults.lyrics_filter_enabled,
  block_unverified_obscure_tracks: row.blockUnverifiedObscureTracks ?? defaults.block_unverified_obscure_tracks,
  min_popularity_without_lyrics: row.minPopularityWithoutLyrics ?? defaults.min_popularity_without_lyrics,
} : defaults;

export class PrismaModerationAdminRepository implements ModerationAdminRepository {
  constructor(private readonly client: PrismaClient) {}
  async setSongBlocked(songId: string, blocked: boolean) {
    const result = await this.client.song.updateMany({ where: { id: songId }, data: { isBlocked: blocked } });
    return result.count ? this.client.song.findUnique({ where: { id: songId }, select: { id: true, title: true, artist: true } }) : null;
  }
  addBlockedArtist(input: { artistName: string; spotifyArtistId?: string | null; reason?: string | null; blockedBy: string }) {
    return this.client.blockedArtist.create({ data: { artistName: input.artistName, spotifyArtistId: input.spotifyArtistId ?? null, reason: input.reason ?? null, blockedBy: input.blockedBy }, include: { creator: { select: { displayName: true } } } });
  }
  async removeBlockedArtist(id: string) {
    const row = await this.client.blockedArtist.findUnique({ where: { id } });
    if (!row) return null;
    await this.client.blockedArtist.delete({ where: { id } });
    return row;
  }
  async listBlocked() {
    const [songs, artists] = await Promise.all([
      this.client.song.findMany({ where: { isBlocked: true }, orderBy: { title: 'asc' }, select: { id: true, title: true, artist: true, spotifyId: true, createdAt: true } }),
      this.client.blockedArtist.findMany({ include: { creator: { select: { displayName: true } } }, orderBy: { artistName: 'asc' } }),
    ]);
    return {
      blocked_songs: songs.map((song) => ({ id: song.id, title: song.title, artist: song.artist, spotify_id: song.spotifyId, created_at: song.createdAt })),
      blocked_artists: artists.map((artist) => ({ id: artist.id, artist_name: artist.artistName, spotify_artist_id: artist.spotifyArtistId, blocked_by: artist.blockedBy, blocked_by_name: artist.creator?.displayName ?? null, reason: artist.reason, created_at: artist.createdAt })),
    };
  }
  async getSettings() { return toSettings(await this.client.contentFilterSettings.findUnique({ where: { id: 1 } })); }
  async updateSettings(input: Partial<ModerationSettings>) {
    const data = {
      ...(input.lyrics_filter_enabled !== undefined ? { lyricsFilterEnabled: input.lyrics_filter_enabled } : {}),
      ...(input.block_unverified_obscure_tracks !== undefined ? { blockUnverifiedObscureTracks: input.block_unverified_obscure_tracks } : {}),
      ...(input.min_popularity_without_lyrics !== undefined ? { minPopularityWithoutLyrics: input.min_popularity_without_lyrics } : {}),
    };
    return toSettings(await this.client.contentFilterSettings.upsert({ where: { id: 1 }, create: { id: 1, ...defaultsToPrisma(defaults), ...data }, update: data }));
  }
  async listKeywords() {
    const words = await this.client.blockedKeyword.findMany({ orderBy: { createdAt: 'desc' } });
    return words.map((row) => ({ id: row.id, word: row.word, category: row.category, created_at: row.createdAt }));
  }
  async addKeyword(input: { word: string; category: string }) {
    const exists = await this.client.blockedKeyword.findUnique({ where: { word: input.word }, select: { id: true } });
    if (exists) return null;
    return this.client.blockedKeyword.create({ data: { word: input.word, category: input.category } });
  }
  async removeKeyword(id: string) {
    const result = await this.client.blockedKeyword.findUnique({ where: { id } });
    if (!result) return null;
    await this.client.blockedKeyword.delete({ where: { id } });
    return result;
  }
  async listKeywordsForPolicy() {
    const rows = await this.client.blockedKeyword.findMany({ select: { word: true } });
    return rows.map((row) => row.word);
  }
}
