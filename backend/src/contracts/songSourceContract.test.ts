import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  HYBRID_SONG_SCHEMA_COLUMNS,
  SONG_ASSET_ROLES,
  SONG_SOURCE_TYPES,
  SONG_VISIBILITIES,
} from './songSourceContract';

describe('song source contract', () => {
  it('defines the hybrid song classification contract', () => {
    expect(SONG_SOURCE_TYPES).toEqual(['spotify', 'local']);
    expect(SONG_VISIBILITIES).toEqual(['public', 'hidden']);
    expect(SONG_ASSET_ROLES).toEqual(['music', 'jingle', 'ad']);
  });

  it('requires the hybrid songs schema columns', () => {
    const schemaPath = path.resolve(__dirname, '../db/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    for (const column of HYBRID_SONG_SCHEMA_COLUMNS) {
      expect(schema).toContain(column);
    }

    expect(schema).toContain('source_type VARCHAR(20) NOT NULL DEFAULT \'local\'');
    expect(schema).toContain('visibility VARCHAR(20) NOT NULL DEFAULT \'public\'');
    expect(schema).toContain('asset_role VARCHAR(20) NOT NULL DEFAULT \'music\'');
  });

  it('backfills existing spotify rows as spotify instead of local', () => {
    const schemaPath = path.resolve(__dirname, '../db/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    expect(schema).toMatch(
      /UPDATE songs\s+SET source_type = CASE\s+WHEN source_type IS NOT NULL THEN source_type\s+WHEN spotify_uri IS NOT NULL OR spotify_id IS NOT NULL THEN 'spotify'\s+ELSE 'local'\s+END;/,
    );
  });

  it('adds spotify-era columns when upgrading a legacy local songs table', () => {
    const schemaPath = path.resolve(__dirname, '../db/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    expect(schema).toContain('ALTER TABLE songs ADD COLUMN IF NOT EXISTS spotify_uri VARCHAR(100);');
    expect(schema).toContain('ALTER TABLE songs ADD COLUMN IF NOT EXISTS spotify_id VARCHAR(50);');
    expect(schema).toContain('ALTER TABLE songs ADD COLUMN IF NOT EXISTS artist_id VARCHAR(50);');
    expect(schema).toContain('ALTER TABLE songs ADD COLUMN IF NOT EXISTS duration_ms INTEGER;');
    expect(schema).toContain('ALTER TABLE songs ADD COLUMN IF NOT EXISTS is_explicit BOOLEAN DEFAULT FALSE;');
    expect(schema).toContain('ALTER TABLE songs ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE;');
    expect(schema).toContain('ALTER TABLE songs ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 0;');
    expect(schema).toContain('ALTER TABLE songs ADD COLUMN IF NOT EXISTS last_played_at TIMESTAMP;');
  });

  it('drops legacy local-only NOT NULL constraints that block hybrid rows', () => {
    const schemaPath = path.resolve(__dirname, '../db/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    expect(schema).toContain('ALTER TABLE songs ALTER COLUMN duration_ms DROP NOT NULL;');
    expect(schema).toContain('ALTER TABLE songs ALTER COLUMN duration_seconds DROP NOT NULL;');
    expect(schema).toContain('ALTER TABLE songs ALTER COLUMN file_url DROP NOT NULL;');
  });

  it('adds legacy-upgrade columns before creating indexes that depend on them', () => {
    const schemaPath = path.resolve(__dirname, '../db/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    const spotifyIdColumn = schema.indexOf('ALTER TABLE songs ADD COLUMN IF NOT EXISTS spotify_id VARCHAR(50);');
    const spotifyIdIndex = schema.indexOf('CREATE INDEX IF NOT EXISTS idx_songs_spotify_id ON songs(spotify_id);');
    const blockedColumn = schema.indexOf('ALTER TABLE songs ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE;');
    const blockedIndex = schema.indexOf('CREATE INDEX IF NOT EXISTS idx_songs_blocked ON songs(is_blocked) WHERE is_blocked = TRUE;');
    const sourceTypeColumn = schema.indexOf('ALTER TABLE songs ADD COLUMN IF NOT EXISTS source_type VARCHAR(20);');
    const sourceTypeIndex = schema.indexOf('CREATE INDEX IF NOT EXISTS idx_songs_source_type ON songs(source_type);');
    const visibilityColumn = schema.indexOf('ALTER TABLE songs ADD COLUMN IF NOT EXISTS visibility VARCHAR(20);');
    const visibilityIndex = schema.indexOf('CREATE INDEX IF NOT EXISTS idx_songs_visibility ON songs(visibility);');
    const assetRoleColumn = schema.indexOf('ALTER TABLE songs ADD COLUMN IF NOT EXISTS asset_role VARCHAR(20);');
    const assetRoleIndex = schema.indexOf('CREATE INDEX IF NOT EXISTS idx_songs_asset_role ON songs(asset_role);');

    expect(spotifyIdColumn).toBeGreaterThanOrEqual(0);
    expect(spotifyIdIndex).toBeGreaterThan(spotifyIdColumn);
    expect(blockedColumn).toBeGreaterThanOrEqual(0);
    expect(blockedIndex).toBeGreaterThan(blockedColumn);
    expect(sourceTypeColumn).toBeGreaterThanOrEqual(0);
    expect(sourceTypeIndex).toBeGreaterThan(sourceTypeColumn);
    expect(visibilityColumn).toBeGreaterThanOrEqual(0);
    expect(visibilityIndex).toBeGreaterThan(visibilityColumn);
    expect(assetRoleColumn).toBeGreaterThanOrEqual(0);
    expect(assetRoleIndex).toBeGreaterThan(assetRoleColumn);
  });

  it('keeps spotify_uri as a valid ON CONFLICT target after legacy upgrades', () => {
    const schemaPath = path.resolve(__dirname, '../db/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    expect(schema).not.toContain('spotify_uri VARCHAR(100) UNIQUE');
    expect(schema).not.toContain('CREATE INDEX IF NOT EXISTS idx_songs_spotify_uri ON songs(spotify_uri);');
    expect(schema).toContain('DO $$');
    expect(schema).toContain("WHERE t.relname = 'songs'");
    expect(schema).toContain("AND a.attname = 'spotify_uri'");
    expect(schema).toContain("AND c.contype = 'u'");
    expect(schema).toContain('CREATE UNIQUE INDEX idx_songs_spotify_uri_unique ON songs(spotify_uri);');
  });

  it('avoids redundant spotify_uri uniqueness and non-unique indexing on fresh installs', () => {
    const schemaPath = path.resolve(__dirname, '../db/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    expect(schema).not.toContain('spotify_uri VARCHAR(100) UNIQUE');
    expect(schema).not.toContain('CREATE INDEX IF NOT EXISTS idx_songs_spotify_uri ON songs(spotify_uri);');
    expect(schema).toContain('DO $$');
    expect(schema).toContain('CREATE UNIQUE INDEX idx_songs_spotify_uri_unique ON songs(spotify_uri);');
  });

  it('skips creating a duplicate spotify_uri unique target when the old spotify-era schema already has one', () => {
    const schemaPath = path.resolve(__dirname, '../db/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    expect(schema).toContain('DO $$');
    expect(schema).toContain('IF NOT EXISTS (');
    expect(schema).toContain('pg_constraint');
    expect(schema).toContain('pg_indexes');
    expect(schema).toContain('CREATE UNIQUE INDEX idx_songs_spotify_uri_unique ON songs(spotify_uri);');
    expect(schema).not.toContain('ALTER TABLE songs DROP CONSTRAINT IF EXISTS songs_spotify_uri_key;');
    expect(schema).not.toContain('DROP INDEX IF EXISTS idx_songs_spotify_uri;');
  });
});
