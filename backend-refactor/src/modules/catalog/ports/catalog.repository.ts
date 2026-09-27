export interface LocalCatalogSong {
  id: string;
  sourceType: string;
  visibility: string;
  assetRole: string;
  spotifyUri: string | null;
  spotifyId: string | null;
  title: string;
  artist: string;
  artistId: string | null;
  album: string | null;
  coverUrl: string | null;
  durationMs: number | null;
  durationSeconds: number | null;
  isExplicit: boolean | null;
  isBlocked: boolean | null;
  fileUrl: string | null;
  playCount: number | null;
  isActive: boolean | null;
}

export interface CatalogModerationSnapshot {
  blockedSpotifyIds: Set<string>;
  blockedArtistIds: Set<string>;
  blockedArtistNames: Set<string>;
  blockedKeywords: string[];
}

export interface CatalogRepository {
  listLocalSongs(input: { search?: string; offset: number; limit: number }): Promise<LocalCatalogSong[]>;
  loadModerationSnapshot(): Promise<CatalogModerationSnapshot>;
}
