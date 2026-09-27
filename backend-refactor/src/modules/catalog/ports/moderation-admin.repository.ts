export interface BlockedArtistInput { artistName: string; spotifyArtistId?: string | null; reason?: string | null; blockedBy: string }
export interface ModerationSettings { lyrics_filter_enabled: boolean; block_unverified_obscure_tracks: boolean; min_popularity_without_lyrics: number }
export interface ModerationAdminRepository {
  setSongBlocked(songId: string, blocked: boolean): Promise<{ id: string; title: string; artist: string } | null>;
  addBlockedArtist(input: BlockedArtistInput): Promise<unknown>;
  removeBlockedArtist(id: string): Promise<unknown | null>;
  listBlocked(): Promise<{ blocked_songs: unknown[]; blocked_artists: unknown[] }>;
  getSettings(): Promise<ModerationSettings>;
  updateSettings(input: Partial<ModerationSettings>): Promise<ModerationSettings>;
  listKeywords(): Promise<unknown[]>;
  addKeyword(input: { word: string; category: string }): Promise<unknown | null>;
  removeKeyword(id: string): Promise<unknown | null>;
  listKeywordsForPolicy(): Promise<string[]>;
}
