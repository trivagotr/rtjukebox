import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import { parseBuffer } from 'music-metadata';
import { NotFoundError, ValidationError } from '../../core/errors/app-error.js';
import type { StorageService } from '../../core/ports/storage.port.js';
import type { SpotifyCatalogProvider } from '../integrations/spotify/ports/spotify-catalog.port.js';
import type { CatalogAssetsRepository } from './ports/catalog-assets.repository.js';
import type { AudioProbe } from './ports/audio-probe.port.js';
import type { IdGenerator } from '../../core/ports/id-generator.port.js';

const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
const MAX_AUDIO_DURATION_SECONDS = 4 * 60 * 60;
const AUDIO_TYPES = new Set(['mp3', 'wav', 'flac', 'ogg', 'oga', 'm4a', 'aac']);

function safeTitle(filename: string) {
  const title = path.basename(filename, path.extname(filename)).split('').filter((character) => character.charCodeAt(0) >= 32).join('').replace(/[<>:"/\\|?*]/g, ' ').replace(/\s+/g, ' ').trim();
  return (title || 'Untitled track').slice(0, 200);
}

function safeStorageKey(fileUrl: string) {
  if (!fileUrl.startsWith('/uploads/songs/')) throw new ValidationError('Song file is outside the managed storage area');
  const key = fileUrl.slice('/uploads/'.length);
  if (!/^[A-Za-z0-9/_-]+\.(?:mp3|wav|flac|ogg|oga|m4a|aac)$/.test(key) || key.includes('..')) throw new ValidationError('Song file key is invalid');
  return key;
}

export class CatalogAssetsService {
  constructor(private readonly repository: CatalogAssetsRepository, private readonly storage: StorageService, private readonly spotify: SpotifyCatalogProvider, private readonly audioProbe: AudioProbe, private readonly ids: IdGenerator) {}

  private async inspectAudio(content: Uint8Array) {
    try {
      const probe = await this.audioProbe.inspect(content);
      if (!probe.hasAudioStream || probe.durationSeconds > MAX_AUDIO_DURATION_SECONDS) throw new Error('Audio stream is missing or exceeds the duration limit');
      return probe;
    } catch {
      throw new ValidationError('Audio file is invalid, could not be inspected, or exceeds 4 hours');
    }
  }

  async uploadSong(filename: string, content: Uint8Array) {
    if (content.byteLength === 0 || content.byteLength > MAX_AUDIO_BYTES) throw new ValidationError('Audio file must be between 1 byte and 50 MB');
    const detected = await fileTypeFromBuffer(content);
    if (!detected || !AUDIO_TYPES.has(detected.ext)) throw new ValidationError('Unsupported audio format');
    const fileHash = createHash('sha256').update(content).digest('hex');
    const prior = await this.repository.findUploadedByHash(fileHash);
    if (prior) {
      const song = prior.is_active === false ? await this.repository.reactivateUploadedSong(prior.id) : prior;
      return { status: prior.is_active === false ? 'reactivated' as const : 'duplicate' as const, song, filename: `${fileHash}.${detected.ext}` };
    }
    await this.inspectAudio(content);

    const key = `songs/${fileHash}.${detected.ext}`;
    await this.storage.put({ key, content, contentType: detected.mime });
    try {
      const song = await this.repository.createUploadedSong({ fileHash, fileUrl: `/uploads/${key}`, title: safeTitle(filename) });
      return { status: 'created' as const, song, filename: `${fileHash}.${detected.ext}` };
    } catch (error) {
      const raced = await this.repository.findUploadedByHash(fileHash);
      if (raced) return { status: raced.is_active === false ? 'reactivated' as const : 'duplicate' as const, song: raced.is_active === false ? await this.repository.reactivateUploadedSong(raced.id) : raced, filename: `${fileHash}.${detected.ext}` };
      throw error;
    }
  }

  async processSong(songId: string) {
    const song = await this.repository.findSongAsset(songId);
    if (!song?.file_url) throw new NotFoundError('Uploaded song not found');
    const key = safeStorageKey(song.file_url);
    const content = await this.storage.get(key);
    if (!content) throw new NotFoundError('Uploaded song file not found');
    if (content.byteLength > MAX_AUDIO_BYTES) throw new ValidationError('Uploaded song exceeds the processing limit');
    const type = await fileTypeFromBuffer(content);
    if (!type || !AUDIO_TYPES.has(type.ext)) throw new ValidationError('Stored song format is invalid');
    const probe = await this.inspectAudio(content);
    const metadata = await parseBuffer(Buffer.from(content), { mimeType: type.mime, size: content.byteLength }, { duration: true });
    const title = metadata.common.title?.trim() || song.title;
    const artist = metadata.common.artist?.trim() || song.artist;
    const album = metadata.common.album?.trim() || song.album;
    const durationMs = Math.round(probe.durationSeconds * 1000);
    await this.repository.updateSongMetadata(songId, { title, artist, album, durationMs });
    return { song_id: songId, title, artist, duration_ms: durationMs };
  }

  async scanFolder(updateProgress: (value: number) => Promise<void>) {
    const keys = await this.storage.list('songs');
    let indexed = 0;
    let skipped = 0;
    for (const [index, key] of keys.entries()) {
      try {
        const content = await this.storage.get(key);
        if (!content || content.byteLength > MAX_AUDIO_BYTES) { skipped += 1; continue; }
        const type = await fileTypeFromBuffer(content);
        if (!type || !AUDIO_TYPES.has(type.ext)) { skipped += 1; continue; }
        const hash = createHash('sha256').update(content).digest('hex');
        const canonicalKey = `songs/${hash}.${type.ext}`;
        if (canonicalKey !== key) { skipped += 1; continue; }
        const result = await this.repository.upsertScannedSong({ fileHash: hash, fileUrl: `/uploads/${key}`, title: safeTitle(path.basename(key)) });
        if (result === 'created') {
          const indexedSong = await this.repository.findUploadedByHash(hash);
          if (!indexedSong) throw new NotFoundError('Scanned song was not indexed');
          await this.processSong(indexedSong.id);
          indexed += 1;
        }
      } catch { skipped += 1; }
      if (keys.length) await updateProgress(Math.floor(((index + 1) / keys.length) * 100));
    }
    return { scanned: keys.length, indexed, skipped };
  }

  async syncMetadata(updateProgress: (value: number) => Promise<void>) {
    const songs = await this.repository.listSpotifyMetadataCandidates();
    let updated = 0;
    let skipped = 0;
    for (const [index, song] of songs.entries()) {
      try {
        const track = await this.spotify.getTrackByUri(song.spotify_uri, 'TR');
        await this.repository.updateSongMetadata(song.id, {
          title: track.title, artist: track.artist, album: track.album, durationMs: track.duration_ms,
          coverUrl: track.cover_url || null, isExplicit: track.explicit,
        });
        updated += 1;
      } catch { skipped += 1; }
      if (songs.length) await updateProgress(Math.floor(((index + 1) / songs.length) * 100));
    }
    return { total: songs.length, updated, skipped };
  }

  createJobId() { return `catalog-${this.ids.generate()}`; }
}
