import api from './api';

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

export type PodcastFeedCreateSync =
  | {
      status: 'failed';
    }
  | {
      processed: number;
      upserted: number;
      skipped: number;
    };

export interface PodcastFeedSyncResult {
  feedId: string;
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
  sync?: {
    status?: string;
    processed?: number;
    upserted?: number;
    skipped?: number;
  };
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
  sync: PodcastFeedCreateSync | null;
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
    sync: mapCreateSyncPayload(payload.sync),
  };
}

export async function syncPodcastFeeds(): Promise<PodcastFeedSyncResult[]> {
  const response = await api.post('/podcast-feeds/sync', {});
  const results = response.data?.data?.results;

  if (!Array.isArray(results)) {
    return [];
  }

  return results.map((result) => ({
    feedId: String(result.feed_id ?? ''),
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

function mapCreateSyncPayload(sync: CreatePodcastFeedResponse['sync']): PodcastFeedCreateSync | null {
  if (!sync) {
    return null;
  }

  if (sync.status === 'failed') {
    return { status: 'failed' };
  }

  if (
    typeof sync.processed === 'number' ||
    typeof sync.upserted === 'number' ||
    typeof sync.skipped === 'number'
  ) {
    return {
      processed: Number(sync.processed ?? 0),
      upserted: Number(sync.upserted ?? 0),
      skipped: Number(sync.skipped ?? 0),
    };
  }

  return null;
}
