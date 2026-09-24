import api from './api';
import {waitForBackgroundJob} from './jobsService';

export interface PodcastFeedRow {
  id: string;
  title: string;
  feedUrl: string;
  isActive: boolean;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
}

export interface CreatePodcastFeedInput {
  title: string;
  feedUrl: string;
}

export interface PodcastFeedSyncResult {
  feedId: string;
  status: 'synced' | 'failed';
  processed: number;
  upserted: number;
  skipped: number;
}

type PodcastFeedApiRow = {
  id: string | number;
  title?: string | null;
  feed_url?: string | null;
  is_active?: boolean;
  last_synced_at?: string | null;
  last_sync_error?: string | null;
};

type CreatePodcastFeedResponse = {
  feed?: PodcastFeedApiRow;
  sync_job_id?: string | null;
};

function mapFeedRow(row: PodcastFeedApiRow): PodcastFeedRow {
  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    feedUrl: String(row.feed_url ?? ''),
    isActive: Boolean(row.is_active),
    lastSyncedAt: row.last_synced_at ?? null,
    lastSyncError: row.last_sync_error ?? null,
  };
}

export async function listPodcastFeeds(): Promise<PodcastFeedRow[]> {
  const response = await api.get('/podcast-feeds');
  const feeds = response.data?.data?.feeds;

  if (!Array.isArray(feeds)) {
    return [];
  }

  return feeds.map(mapFeedRow);
}

export async function createPodcastFeed(input: CreatePodcastFeedInput): Promise<{
  feed: PodcastFeedRow;
  syncJobId: string | null;
}> {
  const response = await api.post('/podcast-feeds', {
    title: input.title,
    feed_url: input.feedUrl,
  });

  const payload: CreatePodcastFeedResponse = response.data?.data ?? {};
  const feed = payload.feed ? mapFeedRow(payload.feed) : {
    id: '',
    title: '',
    feedUrl: '',
    isActive: false,
    lastSyncedAt: null,
    lastSyncError: null,
  };

  return {
    feed,
    syncJobId: payload.sync_job_id ?? null,
  };
}

export async function syncPodcastFeeds(): Promise<PodcastFeedSyncResult[]> {
  const response = await api.post('/podcast-feeds/sync', {});
  const jobId = response.data?.data?.job_id;
  if (typeof jobId !== 'string' || !jobId) throw new Error('Podcast sync job was not queued');
  const result = await waitForBackgroundJob<{results?: Array<Record<string, unknown>>}>(jobId);
  const results = result.results;

  if (!Array.isArray(results)) {
    return [];
  }

  return results.map((result) => ({
    feedId: String(result.feed_id ?? ''),
    status: result.status === 'failed' ? 'failed' : 'synced',
    processed: Number(result.processed ?? 0),
    upserted: Number(result.upserted ?? 0),
    skipped: Number(result.skipped ?? 0),
  }));
}

export async function deletePodcastFeed(feedId: string): Promise<PodcastFeedRow | null> {
  const response = await api.delete(`/podcast-feeds/${feedId}`);
  const feed = response.data?.data?.feed;

  return feed ? mapFeedRow(feed) : null;
}

export function hasDuplicatePodcastFeedUrl(feeds: PodcastFeedRow[], feedUrl: string): boolean {
  const normalizedUrl = feedUrl.trim();
  if (!normalizedUrl) {
    return false;
  }

  return feeds.some((feed) => feed.feedUrl.trim() === normalizedUrl);
}

export async function hasDuplicatePodcastFeedUrlOnServer(feedUrl: string): Promise<boolean> {
  const feeds = await listPodcastFeeds();
  return hasDuplicatePodcastFeedUrl(feeds, feedUrl);
}
