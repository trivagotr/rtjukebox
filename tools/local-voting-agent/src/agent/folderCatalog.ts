import { createHash } from 'node:crypto';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import type { CatalogSong, JingleTrack } from './types';

const AUDIO_EXTENSIONS = new Set(['.aac', '.flac', '.m4a', '.mp3', '.ogg', '.wav']);
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const GENERIC_ART_NAMES = ['cover', 'folder', 'front', 'album'];

function stableId(prefix: string, filePath: string): string {
  return `${prefix}-${createHash('sha1').update(path.resolve(filePath).toLowerCase()).digest('hex').slice(0, 12)}`;
}

function titleFromFile(filePath: string): string {
  return path.basename(filePath, path.extname(filePath)).replaceAll(/[_-]+/g, ' ').trim();
}

function artistFromFolder(filePath: string): string {
  const folder = path.basename(path.dirname(filePath)).trim();
  return folder || 'RadioTEDU';
}

function walkAudioFiles(root: string): string[] {
  if (!existsSync(root)) {
    return [];
  }

  const found: string[] = [];
  const entries = readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      found.push(...walkAudioFiles(fullPath));
      continue;
    }

    if (entry.isFile() && AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      found.push(fullPath);
    }
  }

  return found;
}

function findAlbumArt(audioPath: string): string | null {
  const folder = path.dirname(audioPath);
  const baseName = path.basename(audioPath, path.extname(audioPath)).toLowerCase();
  const entries = readdirSync(folder, { withFileTypes: true }).filter((entry) => entry.isFile());
  const byLowerName = new Map(entries.map((entry) => [entry.name.toLowerCase(), entry.name]));

  for (const extension of IMAGE_EXTENSIONS) {
    const exact = byLowerName.get(`${baseName}${extension}`);
    if (exact) {
      return path.join(folder, exact);
    }
  }

  for (const name of GENERIC_ART_NAMES) {
    for (const extension of IMAGE_EXTENSIONS) {
      const exact = byLowerName.get(`${name}${extension}`);
      if (exact) {
        return path.join(folder, exact);
      }
    }
  }

  return null;
}

function isReadableFile(filePath: string): boolean {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

export function scanFolderCatalog(musicRoots: string[]): CatalogSong[] {
  return musicRoots
    .flatMap(walkAudioFiles)
    .filter(isReadableFile)
    .sort((a, b) => a.localeCompare(b))
    .map((filePath) => ({
      id: stableId('song', filePath),
      title: titleFromFile(filePath),
      artist: artistFromFolder(filePath),
      filePath,
      ...(findAlbumArt(filePath) ? { albumArtPath: findAlbumArt(filePath) } : {}),
      enabled: true,
    }));
}

export function scanJingleCatalog(jingleRoots: string[]): JingleTrack[] {
  return jingleRoots
    .flatMap(walkAudioFiles)
    .filter(isReadableFile)
    .sort((a, b) => a.localeCompare(b))
    .map((filePath) => ({
      id: stableId('jingle', filePath),
      title: titleFromFile(filePath),
      filePath,
      enabled: true,
    }));
}
