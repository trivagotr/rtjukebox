import { describe, expect, it, jest, beforeEach } from '@jest/globals';

import api from '../src/services/api';
import {
  createPodcastFeed,
  deletePodcastFeed,
  listPodcastFeeds,
  hasDuplicatePodcastFeedUrl,
  hasDuplicatePodcastFeedUrlOnServer,
  syncPodcastFeeds,
} from '../src/services/podcastFeedsAdmin';

jest.mock('../src/services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  },
}));

describe('podcastFeedsAdmin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads podcast feeds from the backend list endpoint', async () => {
    const getMock = api.get as jest.MockedFunction<(path: string) => Promise<any>>;
    getMock.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          feeds: [
            {
              id: 'feed-1',
              title: 'Morning Show',
              feed_url: 'https://example.com/feed-1.xml',
              is_active: true,
              last_synced_at: '2026-04-10T09:30:00Z',
              last_sync_error: null,
            },
          ],
        },
      },
    });

    await expect(listPodcastFeeds()).resolves.toEqual([
      {
        id: 'feed-1',
        title: 'Morning Show',
        feedUrl: 'https://example.com/feed-1.xml',
        isActive: true,
        lastSyncedAt: '2026-04-10T09:30:00Z',
        lastSyncError: null,
      },
    ]);

    expect(getMock).toHaveBeenCalledWith('/podcast-feeds');
  });

  it('creates podcast feeds through the backend payload shape', async () => {
    const postMock = api.post as jest.MockedFunction<(path: string, body?: any) => Promise<any>>;
    postMock.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          feed: {
            id: 'feed-2',
            title: 'Late Night',
            feed_url: 'https://example.com/feed-2.xml',
            is_active: true,
            last_synced_at: null,
            last_sync_error: null,
          },
          sync: {
            processed: 12,
            upserted: 8,
            skipped: 4,
          },
        },
      },
    });

    await expect(
      createPodcastFeed({
        title: 'Late Night',
        feedUrl: 'https://example.com/feed-2.xml',
      }),
    ).resolves.toEqual({
      feed: {
        id: 'feed-2',
        title: 'Late Night',
        feedUrl: 'https://example.com/feed-2.xml',
        isActive: true,
        lastSyncedAt: null,
        lastSyncError: null,
      },
      sync: {
        processed: 12,
        upserted: 8,
        skipped: 4,
      },
    });

    expect(postMock).toHaveBeenCalledWith('/podcast-feeds', {
      title: 'Late Night',
      feed_url: 'https://example.com/feed-2.xml',
    });
  });

  it('preserves a failed initial sync response when the feed is created', async () => {
    const postMock = api.post as jest.MockedFunction<(path: string, body?: any) => Promise<any>>;
    postMock.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          feed: {
            id: 'feed-4',
            title: 'Broken Sync',
            feed_url: 'https://example.com/feed-4.xml',
            is_active: true,
            last_synced_at: null,
            last_sync_error: 'feed fetch failed',
          },
          sync: {
            status: 'failed',
          },
        },
      },
    });

    await expect(
      createPodcastFeed({
        title: 'Broken Sync',
        feedUrl: 'https://example.com/feed-4.xml',
      }),
    ).resolves.toEqual({
      feed: {
        id: 'feed-4',
        title: 'Broken Sync',
        feedUrl: 'https://example.com/feed-4.xml',
        isActive: true,
        lastSyncedAt: null,
        lastSyncError: 'feed fetch failed',
      },
      sync: {
        status: 'failed',
      },
    });
  });

  it('syncs podcast feeds through the backend sync endpoint', async () => {
    const postMock = api.post as jest.MockedFunction<(path: string, body?: any) => Promise<any>>;
    postMock.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          results: [
            {
              feed_id: 'feed-1',
              processed: 8,
              upserted: 6,
              skipped: 2,
            },
          ],
        },
      },
    });

    await expect(syncPodcastFeeds()).resolves.toEqual([
      {
        feedId: 'feed-1',
        processed: 8,
        upserted: 6,
        skipped: 2,
      },
    ]);

    expect(postMock).toHaveBeenCalledWith('/podcast-feeds/sync', {});
  });

  it('deletes podcast feeds through the backend delete endpoint', async () => {
    const deleteMock = api.delete as jest.MockedFunction<(path: string) => Promise<any>>;
    deleteMock.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          feed: {
            id: 'feed-3',
            title: 'Archived Feed',
            feed_url: 'https://example.com/feed-3.xml',
          },
        },
      },
    });

    await expect(deletePodcastFeed('feed-3')).resolves.toEqual({
      id: 'feed-3',
      title: 'Archived Feed',
      feedUrl: 'https://example.com/feed-3.xml',
      isActive: false,
      lastSyncedAt: null,
      lastSyncError: null,
    });

    expect(deleteMock).toHaveBeenCalledWith('/podcast-feeds/feed-3');
  });

  it('detects duplicate podcast feed urls in the current feed list', () => {
    expect(
      hasDuplicatePodcastFeedUrl(
        [
          {
            id: 'feed-1',
            title: 'Morning Show',
            feedUrl: 'https://example.com/feed-1.xml',
            isActive: true,
            lastSyncedAt: null,
            lastSyncError: null,
          },
        ],
        'https://example.com/feed-1.xml',
      ),
    ).toBe(true);

    expect(
      hasDuplicatePodcastFeedUrl(
        [
          {
            id: 'feed-1',
            title: 'Morning Show',
            feedUrl: 'https://example.com/feed-1.xml',
            isActive: true,
            lastSyncedAt: null,
            lastSyncError: null,
          },
        ],
        'https://example.com/other.xml',
      ),
    ).toBe(false);
  });

  it('detects duplicate podcast feed urls against the backend list', async () => {
    const getMock = api.get as jest.MockedFunction<(path: string) => Promise<any>>;
    getMock.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          feeds: [
            {
              id: 'feed-1',
              title: 'Morning Show',
              feed_url: 'https://example.com/feed-1.xml',
              is_active: true,
              last_synced_at: null,
              last_sync_error: null,
            },
          ],
        },
      },
    });

    await expect(hasDuplicatePodcastFeedUrlOnServer('https://example.com/feed-1.xml')).resolves.toBe(true);
    expect(getMock).toHaveBeenCalledWith('/podcast-feeds');
  });
});
