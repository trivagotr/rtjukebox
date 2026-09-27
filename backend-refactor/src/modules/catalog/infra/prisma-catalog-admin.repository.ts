import type { PrismaClient } from '../../../../generated/prisma/client.js';
import type { CatalogAdminRepository } from '../ports/catalog-admin.repository.js';

export class PrismaCatalogAdminRepository implements CatalogAdminRepository {
  constructor(private readonly client: PrismaClient) {}

  async listSongs() {
    const songs = await this.client.song.findMany({ orderBy: { createdAt: 'desc' } });
    const played = await this.client.queueItem.groupBy({ by: ['songId'], where: { status: 'played' }, _count: { _all: true } });
    const playCounts = new Map(played.map((item) => [item.songId, item._count._all]));
    return songs.map((song) => ({
      id: song.id, source_type: song.sourceType, visibility: song.visibility, asset_role: song.assetRole,
      file_url: song.fileUrl, is_active: song.isActive, spotify_uri: song.spotifyUri, spotify_id: song.spotifyId,
      title: song.title, artist: song.artist, artist_id: song.artistId, album: song.album, cover_url: song.coverUrl,
      duration_ms: song.durationMs, is_explicit: song.isExplicit, is_blocked: song.isBlocked,
      play_count: song.playCount, score: song.score, last_played_at: song.lastPlayedAt,
      created_at: song.createdAt, total_plays: playCounts.get(song.id) ?? 0,
    }));
  }

  async classifySong(id: string, visibility?: 'public' | 'hidden', assetRole?: 'music' | 'jingle' | 'ad') {
    const song = await this.client.song.findUnique({ where: { id }, select: { sourceType: true, visibility: true, assetRole: true } });
    if (!song) return { kind: 'not_found' as const };
    if (song.sourceType !== 'local') return { kind: 'not_local' as const };
    const nextVisibility = visibility ?? (song.visibility === 'hidden' ? 'hidden' : 'public');
    const nextAssetRole = assetRole ?? (song.assetRole === 'jingle' || song.assetRole === 'ad' ? song.assetRole : 'music');
    await this.client.song.update({ where: { id }, data: { visibility: nextVisibility, assetRole: nextAssetRole } });
    return { kind: 'updated' as const, visibility: nextVisibility, assetRole: nextAssetRole };
  }

  async blockSong(id: string) {
    const result = await this.client.song.updateMany({ where: { id }, data: { isBlocked: true } });
    return result.count > 0;
  }
}
