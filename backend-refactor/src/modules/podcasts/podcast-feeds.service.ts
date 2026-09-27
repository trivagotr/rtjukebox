import { ConflictError, NotFoundError, ValidationError } from '../../core/errors/app-error.js';
import type { FeedFetcher } from './ports/feed-fetcher.port.js';
import type { PodcastFeedsRepository } from './ports/podcast-feeds.repository.js';
import { normalizeFeedUrl } from './podcast-feed-policy.js';

export class PodcastFeedsService {
  constructor(private readonly repository: PodcastFeedsRepository, private readonly fetcher: FeedFetcher) {}

  list() { return this.repository.listAll(); }

  async create(input: { title: string; feedUrl: string; userId: string }) {
    const title = input.title.trim();
    if (!title) throw new ValidationError('Feed title is required');
    const feedUrl = normalizeFeedUrl(input.feedUrl);
    try { return await this.repository.create({ title, feedUrl, createdBy: input.userId }); }
    catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new ConflictError('Podcast feed URL already exists');
      throw error;
    }
  }

  async assertExists(feedId: string) {
    const feed = await this.repository.findById(feedId);
    if (!feed) throw new NotFoundError('Podcast feed not found');
    return feed;
  }

  async delete(feedId: string) {
    const removed = await this.repository.deleteById(feedId);
    if (!removed) throw new NotFoundError('Podcast feed not found');
  }

  async sync(feedId: string) {
    const feed = await this.repository.findForSync(feedId);
    if (!feed) throw new NotFoundError('Podcast feed not found');
    if (!feed.is_active) throw new ValidationError('Podcast feed is inactive');
    try {
      const episodes = await this.fetcher.fetchEpisodes(feed.feed_url);
      const result = await this.repository.saveEpisodes(feed.id, episodes);
      await this.repository.markSyncSuccess(feed.id);
      return { feed_id: feed.id, status: 'synced', ...result };
    } catch (error) {
      const safeMessage = error instanceof Error ? error.message.slice(0, 1000) : 'Podcast feed sync failed';
      await this.repository.markSyncFailure(feed.id, safeMessage).catch(() => undefined);
      throw new Error('Podcast feed synchronization failed', { cause: error });
    }
  }

  async syncAll() {
    const feeds = await this.repository.listAll();
    const results = [];
    let failed = 0;
    for (const feed of feeds) {
      try { results.push(await this.sync(feed.id)); }
      catch { failed += 1; results.push({ feed_id: feed.id, status: 'failed' }); }
    }
    return { results, succeeded: results.length - failed, failed, total: results.length };
  }
}
