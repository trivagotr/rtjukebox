import type { PrismaClient } from '../../../../generated/prisma/client.js';
import type { ParsedFeedEpisode } from '../ports/feed-fetcher.port.js';
import type { PodcastFeedRecord, PodcastFeedsRepository } from '../ports/podcast-feeds.repository.js';

function toFeed(row: { id: string; title: string | null; feedUrl: string; isActive: boolean; lastSyncedAt: Date | null; lastSyncError: string | null; createdBy: string | null; createdAt: Date | null; updatedAt: Date | null }): PodcastFeedRecord {
  return { id: row.id, title: row.title, feed_url: row.feedUrl, is_active: row.isActive, last_synced_at: row.lastSyncedAt, last_sync_error: row.lastSyncError, created_by: row.createdBy, created_at: row.createdAt, updated_at: row.updatedAt };
}

export class PrismaPodcastFeedsRepository implements PodcastFeedsRepository {
  constructor(private readonly client: PrismaClient) {}
  async listAll() {
    const rows = await this.client.podcastFeed.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    return rows.map(toFeed);
  }
  async create(input: { title: string; feedUrl: string; createdBy: string }) {
    return toFeed(await this.client.podcastFeed.create({ data: { title: input.title, feedUrl: input.feedUrl, createdBy: input.createdBy } }));
  }
  async findById(feedId: string) {
    const row = await this.client.podcastFeed.findUnique({ where: { id: feedId } });
    return row ? toFeed(row) : null;
  }
  async findForSync(feedId: string) {
    const row = await this.client.podcastFeed.findUnique({ where: { id: feedId } });
    return row ? toFeed(row) : null;
  }
  async deleteById(feedId: string) {
    const result = await this.client.podcastFeed.deleteMany({ where: { id: feedId } });
    return result.count > 0;
  }
  async saveEpisodes(feedId: string, episodes: ParsedFeedEpisode[]) {
    return this.client.$transaction(async (tx) => {
      let upserted = 0;
      for (const episode of episodes) {
        const identities = [episode.guid ? { guid: episode.guid } : null, episode.audioUrl ? { audioUrl: episode.audioUrl } : null, episode.episodeUrl ? { episodeUrl: episode.episodeUrl } : null].filter((item): item is { guid: string } | { audioUrl: string } | { episodeUrl: string } => item !== null);
        if (!identities.length || !episode.audioUrl) continue;
        const matches = await tx.podcastEpisode.findMany({ where: { feedId, OR: identities }, orderBy: { createdAt: 'desc' }, select: { id: true } });
        const canonicalId = matches[0]?.id;
        if (matches.length > 1) await tx.podcastEpisode.deleteMany({ where: { id: { in: matches.slice(1).map((row) => row.id) } } });
        const data = { feedId, guid: episode.guid, audioUrl: episode.audioUrl, episodeUrl: episode.episodeUrl, title: episode.title.slice(0, 500), description: episode.description, imageUrl: episode.imageUrl, publishedAt: episode.publishedAt, author: episode.author?.slice(0, 255) ?? null, durationSeconds: episode.durationSeconds };
        if (canonicalId) await tx.podcastEpisode.update({ where: { id: canonicalId }, data });
        else await tx.podcastEpisode.create({ data });
        upserted += 1;
      }
      return { processed: episodes.length, upserted, skipped: episodes.length - upserted };
    }, { isolationLevel: 'Serializable' });
  }
  async markSyncSuccess(feedId: string) { await this.client.podcastFeed.update({ where: { id: feedId }, data: { lastSyncedAt: new Date(), lastSyncError: null } }); }
  async markSyncFailure(feedId: string, message: string) { await this.client.podcastFeed.update({ where: { id: feedId }, data: { lastSyncError: message.slice(0, 1000) } }); }
}
