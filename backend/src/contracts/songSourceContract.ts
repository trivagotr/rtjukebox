export const SONG_SOURCE_TYPES = ['spotify', 'local'] as const;
export const SONG_VISIBILITIES = ['public', 'hidden'] as const;
export const SONG_ASSET_ROLES = ['music', 'jingle', 'ad'] as const;

export type SongSourceType = (typeof SONG_SOURCE_TYPES)[number];
export type SongVisibility = (typeof SONG_VISIBILITIES)[number];
export type SongAssetRole = (typeof SONG_ASSET_ROLES)[number];

export const HYBRID_SONG_SCHEMA_COLUMNS = [
  "source_type VARCHAR(20) NOT NULL DEFAULT 'local'",
  "visibility VARCHAR(20) NOT NULL DEFAULT 'public'",
  "asset_role VARCHAR(20) NOT NULL DEFAULT 'music'",
  'spotify_uri VARCHAR(100)',
  'spotify_id VARCHAR(50)',
  'title VARCHAR(200) NOT NULL',
  'artist VARCHAR(200) NOT NULL',
  'artist_id VARCHAR(50)',
  'album VARCHAR(200)',
  'cover_url VARCHAR(500)',
  'file_url VARCHAR(500)',
  'duration_ms INTEGER',
  'duration_seconds INTEGER',
  'is_explicit BOOLEAN DEFAULT FALSE',
  'is_blocked BOOLEAN DEFAULT FALSE',
  'is_active BOOLEAN DEFAULT TRUE',
  'genre VARCHAR(100)',
] as const;
