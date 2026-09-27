export interface AdminSongRecord {
  id: string; source_type: string; visibility: string; asset_role: string; file_url: string | null; is_active: boolean | null;
  spotify_uri: string | null; spotify_id: string | null; title: string; artist: string; artist_id: string | null;
  album: string | null; cover_url: string | null; duration_ms: number | null; is_explicit: boolean | null;
  is_blocked: boolean | null; play_count: number | null; score: number | null; last_played_at: Date | null;
  created_at: Date | null; total_plays: number;
}
export interface CatalogAdminRepository {
  listSongs(): Promise<AdminSongRecord[]>;
  classifySong(id: string, visibility?: 'public' | 'hidden', assetRole?: 'music' | 'jingle' | 'ad'): Promise<{ kind: 'updated'; visibility: string; assetRole: string } | { kind: 'not_found' } | { kind: 'not_local' }>;
  blockSong(id: string): Promise<boolean>;
}
