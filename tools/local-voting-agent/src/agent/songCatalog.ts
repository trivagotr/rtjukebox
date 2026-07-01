import { readFileSync } from 'node:fs';
import { isPathInsideRoots } from './pathSafety';
import type { CatalogSong } from './types';

function isCatalogSong(value: unknown): value is CatalogSong {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const song = value as Record<string, unknown>;
  return (
    typeof song.id === 'string' &&
    typeof song.title === 'string' &&
    typeof song.artist === 'string' &&
    typeof song.filePath === 'string'
  );
}

function cleanSong(song: CatalogSong): CatalogSong {
  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    filePath: song.filePath,
    ...(song.albumArtPath ? { albumArtPath: song.albumArtPath } : {}),
    ...(typeof song.enabled === 'boolean' ? { enabled: song.enabled } : {}),
    ...(typeof song.durationSeconds === 'number' ? { durationSeconds: song.durationSeconds } : {}),
  };
}

export function loadSongCatalog(catalogPath: string, musicRoots: string[]): CatalogSong[] {
  const raw = JSON.parse(readFileSync(catalogPath, 'utf8')) as unknown;
  const records = Array.isArray(raw) ? raw : [];

  return records
    .filter(isCatalogSong)
    .filter((song) => song.enabled !== false)
    .filter((song) => isPathInsideRoots(song.filePath, musicRoots))
    .map(cleanSong);
}
