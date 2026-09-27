import { ConflictError, NotFoundError } from '../../../core/errors/app-error.js';
import type { LyricsProvider } from '../../integrations/spotify/ports/lyrics-provider.port.js';
import type { ModerationAdminRepository, ModerationSettings } from '../ports/moderation-admin.repository.js';

export class ModerationAdminService {
  constructor(private readonly repository: ModerationAdminRepository, private readonly lyrics: LyricsProvider) {}
  blockSong(id: string) { return this.repository.setSongBlocked(id, true); }
  unblockSong(id: string) { return this.repository.setSongBlocked(id, false); }
  listBlocked() { return this.repository.listBlocked(); }
  getSettings() { return this.repository.getSettings(); }
  updateSettings(input: Partial<ModerationSettings>) { return this.repository.updateSettings(input); }
  listKeywords() { return this.repository.listKeywords(); }
  async addArtist(input: { artist_name: string; spotify_artist_id?: string | null; reason?: string | null; blockedBy: string }) {
    try { return await this.repository.addBlockedArtist({ artistName: input.artist_name, spotifyArtistId: input.spotify_artist_id, reason: input.reason, blockedBy: input.blockedBy }); }
    catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new ConflictError('Artist is already blocked');
      throw error;
    }
  }
  async removeArtist(id: string) { const result = await this.repository.removeBlockedArtist(id); if (!result) throw new NotFoundError('Blocked artist entry not found'); return result; }
  async removeKeyword(id: string) { const result = await this.repository.removeKeyword(id); if (!result) throw new NotFoundError('Blocked keyword not found'); return result; }
  async addKeyword(input: { word: string; category?: string }) {
    const result = await this.repository.addKeyword({ word: input.word.trim().toLocaleLowerCase('tr-TR'), category: input.category?.trim() || 'profanity' });
    if (!result) throw new ConflictError('Keyword already exists');
    return result;
  }
  async test(input: { text?: string; title?: string; artist?: string }) {
    let content = input.text?.trim() ?? '';
    let foundLyrics = false;
    if (!content && input.title && input.artist) {
      const lyrics = await this.lyrics.getLyrics({ title: input.title, artist: input.artist });
      if (!lyrics) return { foundLyrics: false, isProfane: false, message: 'No lyrics were found for this song.' };
      content = lyrics.plainLyrics || lyrics.lines.map((line) => line.text).join('\n');
      foundLyrics = true;
    }
    const keywords = await this.repository.listKeywordsForPolicy();
    const normalized = content.toLocaleLowerCase('tr-TR');
    const matchedWord = keywords.find((word) => word && normalized.includes(word.trim().toLocaleLowerCase('tr-TR'))) ?? null;
    return { foundLyrics, isProfane: Boolean(matchedWord), ...(matchedWord ? { matchedWord } : {}), testedTextSnippet: content.slice(0, 300) };
  }
}
