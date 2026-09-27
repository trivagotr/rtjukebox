import type { PrismaClient } from '../../../../generated/prisma/client.js';
import type { CatalogModerationSnapshot, CatalogRepository, LocalCatalogSong } from '../ports/catalog.repository.js';

export class PrismaCatalogRepository implements CatalogRepository {
  constructor(private readonly client: PrismaClient) {}

  async listLocalSongs(input: { search?: string; offset: number; limit: number }) {
    const visibilityFilter = {
      visibility: 'public',
      OR: [{ isBlocked: false }, { isBlocked: null }],
    };
    const searchFilter = input.search ? {
      OR: [
        { title: { contains: input.search, mode: 'insensitive' as const } },
        { artist: { contains: input.search, mode: 'insensitive' as const } },
      ],
    } : {};
    const sourceFilter = input.search
      ? { sourceType: 'local', OR: [{ isActive: true }, { isActive: null }] }
      : { OR: [
        { sourceType: 'spotify' },
        { sourceType: 'local', OR: [{ isActive: true }, { isActive: null }] },
      ] };
    const songs = await this.client.song.findMany({
      where: { AND: [visibilityFilter, searchFilter, sourceFilter] },
      orderBy: [{ playCount: 'desc' }, { title: 'asc' }],
      skip: input.offset,
      take: input.limit,
    });
    return songs.map((song): LocalCatalogSong => ({
      id: song.id,
      sourceType: song.sourceType,
      visibility: song.visibility,
      assetRole: song.assetRole,
      spotifyUri: song.spotifyUri,
      spotifyId: song.spotifyId,
      title: song.title,
      artist: song.artist,
      artistId: song.artistId,
      album: song.album,
      coverUrl: song.coverUrl,
      durationMs: song.durationMs,
      durationSeconds: song.durationSeconds,
      isExplicit: song.isExplicit,
      isBlocked: song.isBlocked,
      fileUrl: song.fileUrl,
      playCount: song.playCount,
      isActive: song.isActive,
    }));
  }

  async loadModerationSnapshot(): Promise<CatalogModerationSnapshot> {
    const [songs, artists, keywords] = await Promise.all([
      this.client.song.findMany({ where: { isBlocked: true, spotifyId: { not: null } }, select: { spotifyId: true } }),
      this.client.blockedArtist.findMany({ select: { spotifyArtistId: true, artistName: true } }),
      this.client.blockedKeyword.findMany({ select: { word: true } }),
    ]);
    return {
      blockedSpotifyIds: new Set(songs.flatMap((song) => song.spotifyId ? [song.spotifyId] : [])),
      blockedArtistIds: new Set(artists.flatMap((artist) => artist.spotifyArtistId ? [artist.spotifyArtistId] : [])),
      blockedArtistNames: new Set(artists.map((artist) => artist.artistName.trim().toLocaleLowerCase('tr-TR'))),
      blockedKeywords: keywords.map((keyword) => keyword.word.trim().toLocaleLowerCase('tr-TR')).filter(Boolean),
    };
  }
}
