import type { PrismaClient } from '../../../../generated/prisma/client.js';
import type { CatalogAssetsRepository, UploadedSongRecord } from '../ports/catalog-assets.repository.js';

const uploadSelect = { id: true, title: true, artist: true, album: true, fileUrl: true, durationMs: true, isActive: true, isBlocked: true } as const;
function toUploadedRecord(song: { id: string; title: string; artist: string; album: string | null; fileUrl: string | null; durationMs: number | null; isActive: boolean | null; isBlocked: boolean | null }): UploadedSongRecord {
  return { id: song.id, title: song.title, artist: song.artist, album: song.album, file_url: song.fileUrl, duration_ms: song.durationMs, is_active: song.isActive, is_blocked: song.isBlocked };
}

export class PrismaCatalogAssetsRepository implements CatalogAssetsRepository {
  constructor(private readonly client: PrismaClient) {}

  async findUploadedByHash(fileHash: string) {
    const song = await this.client.song.findUnique({ where: { fileHash }, select: uploadSelect });
    return song ? toUploadedRecord(song) : null;
  }

  async reactivateUploadedSong(id: string) {
    const song = await this.client.song.update({ where: { id }, data: { isActive: true }, select: uploadSelect });
    return toUploadedRecord(song);
  }

  async createUploadedSong(input: { fileHash: string; fileUrl: string; title: string }) {
    const song = await this.client.song.create({ data: {
      sourceType: 'local', visibility: 'public', assetRole: 'music', fileHash: input.fileHash,
      fileUrl: input.fileUrl, title: input.title, artist: 'Unknown artist', isActive: true,
    }, select: uploadSelect });
    return toUploadedRecord(song);
  }

  async findSongAsset(id: string) {
    const song = await this.client.song.findUnique({ where: { id }, select: { id: true, fileUrl: true, title: true, artist: true, album: true } });
    return song ? { id: song.id, file_url: song.fileUrl, title: song.title, artist: song.artist, album: song.album } : null;
  }

  async updateSongMetadata(id: string, input: { title: string; artist: string; album: string | null; durationMs: number | null; coverUrl?: string | null; isExplicit?: boolean | null }) {
    await this.client.song.update({ where: { id }, data: {
      title: input.title.slice(0, 200), artist: input.artist.slice(0, 200), album: input.album?.slice(0, 200) ?? null,
      durationMs: input.durationMs, durationSeconds: input.durationMs === null ? null : Math.round(input.durationMs / 1000),
      ...(input.coverUrl !== undefined ? { coverUrl: input.coverUrl?.slice(0, 500) ?? null } : {}),
      ...(input.isExplicit !== undefined ? { isExplicit: input.isExplicit } : {}),
    } });
  }

  async listSpotifyMetadataCandidates() {
    const songs = await this.client.song.findMany({ where: { sourceType: 'spotify', spotifyUri: { not: null } }, select: { id: true, spotifyUri: true }, orderBy: { createdAt: 'asc' } });
    return songs.flatMap((song) => song.spotifyUri ? [{ id: song.id, spotify_uri: song.spotifyUri }] : []);
  }

  async upsertScannedSong(input: { fileHash: string; fileUrl: string; title: string }) {
    try {
      await this.client.song.create({ data: {
        sourceType: 'local', visibility: 'public', assetRole: 'music', fileHash: input.fileHash,
        fileUrl: input.fileUrl, title: input.title.slice(0, 200), artist: 'Unknown artist', isActive: true,
      }, select: { id: true } });
      return 'created';
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') return 'existing';
      throw error;
    }
  }
}
