export interface UploadedSongRecord {
  id: string; title: string; artist: string; album: string | null; file_url: string | null; duration_ms: number | null;
  is_active: boolean | null; is_blocked: boolean | null;
}

export interface CatalogAssetsRepository {
  findUploadedByHash(fileHash: string): Promise<UploadedSongRecord | null>;
  reactivateUploadedSong(id: string): Promise<UploadedSongRecord>;
  createUploadedSong(input: { fileHash: string; fileUrl: string; title: string }): Promise<UploadedSongRecord>;
  findSongAsset(id: string): Promise<{ id: string; file_url: string | null; title: string; artist: string; album: string | null } | null>;
  updateSongMetadata(id: string, input: { title: string; artist: string; album: string | null; durationMs: number | null; coverUrl?: string | null; isExplicit?: boolean | null }): Promise<void>;
  listSpotifyMetadataCandidates(): Promise<Array<{ id: string; spotify_uri: string }>>;
  upsertScannedSong(input: { fileHash: string; fileUrl: string; title: string }): Promise<'created' | 'existing'>;
}
