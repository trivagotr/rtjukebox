import type { ParsedFeedEpisode } from './feed-fetcher.port.js';

export interface PodcastFeedRecord { id: string; title: string | null; feed_url: string; is_active: boolean; last_synced_at: Date | null; last_sync_error: string | null; created_by: string | null; created_at: Date | null; updated_at: Date | null }
export interface PodcastFeedsRepository {
  listAll(): Promise<PodcastFeedRecord[]>;
  create(input: { title: string; feedUrl: string; createdBy: string }): Promise<PodcastFeedRecord>;
  findById(feedId: string): Promise<PodcastFeedRecord | null>;
  findForSync(feedId: string): Promise<PodcastFeedRecord | null>;
  deleteById(feedId: string): Promise<boolean>;
  saveEpisodes(feedId: string, episodes: ParsedFeedEpisode[]): Promise<{ processed: number; upserted: number; skipped: number }>;
  markSyncSuccess(feedId: string): Promise<void>;
  markSyncFailure(feedId: string, message: string): Promise<void>;
}
