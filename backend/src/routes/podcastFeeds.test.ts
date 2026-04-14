import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDbQuery,
  mockSendSuccess,
  mockSendError,
  mockSyncPodcastFeed,
  mockAuthMiddleware,
  mockRbacMiddleware,
  mockRbacGuard,
  mockRouteHandlers,
  mockRouter,
} = vi.hoisted(() => {
  const handlers: Record<string, Record<string, (...args: any[]) => any>> = {
    get: {},
    post: {},
    delete: {},
  };

  const router: any = {};
  router.use = vi.fn(() => router);
  router.get = vi.fn((path: string, handler: (...args: any[]) => any) => {
    handlers.get[path] = handler;
    return router;
  });
  router.post = vi.fn((path: string, handler: (...args: any[]) => any) => {
    handlers.post[path] = handler;
    return router;
  });
  router.delete = vi.fn((path: string, handler: (...args: any[]) => any) => {
    handlers.delete[path] = handler;
    return router;
  });

  const authMiddleware = vi.fn();
  const rbacGuard = vi.fn();
  const rbacMiddleware = vi.fn(() => rbacGuard);

  return {
    mockDbQuery: vi.fn(),
    mockSendSuccess: vi.fn(),
    mockSendError: vi.fn(),
    mockSyncPodcastFeed: vi.fn(),
    mockAuthMiddleware: authMiddleware,
    mockRbacMiddleware: rbacMiddleware,
    mockRbacGuard: rbacGuard,
    mockRouteHandlers: handlers,
    mockRouter: router,
  };
});

vi.mock('../db', () => ({
  db: {
    query: mockDbQuery,
  },
}));

vi.mock('../middleware/auth', () => ({
  authMiddleware: mockAuthMiddleware,
}));

vi.mock('../middleware/rbac', () => ({
  ROLES: {
    GUEST: 'guest',
    USER: 'user',
    MODERATOR: 'moderator',
    ADMIN: 'admin',
  },
  rbacMiddleware: mockRbacMiddleware,
}));

vi.mock('../utils/response', () => ({
  sendSuccess: mockSendSuccess,
  sendError: mockSendError,
}));

vi.mock('../services/podcastFeeds', () => ({
  syncPodcastFeed: mockSyncPodcastFeed,
}));

vi.mock('express', () => ({
  Router: vi.fn(() => mockRouter),
}));

import { normalizePodcastFeedPayload } from './podcastFeeds';

describe('normalizePodcastFeedPayload', () => {
  beforeEach(() => {
    mockDbQuery.mockReset();
    mockSendSuccess.mockReset();
    mockSendError.mockReset();
    mockSyncPodcastFeed.mockReset();
  });

  it('trims whitespace and normalizes feed_url to feedUrl', () => {
    expect(
      normalizePodcastFeedPayload({
        title: '  TEDU Podcast  ',
        feed_url: ' https://example.com/feed.xml ',
      }),
    ).toEqual({
      title: 'TEDU Podcast',
      feedUrl: 'https://example.com/feed.xml',
    });
  });

  it('rejects feed_url values that do not start with http or https', () => {
    expect(() =>
      normalizePodcastFeedPayload({
        title: 'Podcast',
        feed_url: 'ftp://example.com/feed.xml',
      }),
    ).toThrow('feed_url must start with http or https');
  });
});

describe('podcastFeeds admin router', () => {
  beforeEach(() => {
    mockDbQuery.mockReset();
    mockSendSuccess.mockReset();
    mockSendError.mockReset();
    mockSyncPodcastFeed.mockReset();
  });

  it('registers auth and admin RBAC middleware before route handlers', () => {
    expect(mockRbacMiddleware).toHaveBeenCalledWith(['admin']);
    expect(mockRouter.use).toHaveBeenCalledWith(mockAuthMiddleware);
    expect(mockRouter.use).toHaveBeenCalledWith(mockRbacGuard);
  });

  it('returns a partial success response when create succeeds but initial sync fails', async () => {
    const handler = mockRouteHandlers.post['/'];
    expect(handler).toBeTypeOf('function');

    mockDbQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'feed-1',
          title: 'TEDU Podcast',
          feed_url: 'https://example.com/feed.xml',
          created_by: 'user-1',
        },
      ],
    });
    mockSyncPodcastFeed.mockRejectedValueOnce(new Error('upstream exploded'));

    const req = {
      body: {
        title: 'TEDU Podcast',
        feed_url: 'https://example.com/feed.xml',
      },
      user: { id: 'user-1' },
    };
    const res = {};

    await handler(req, res);

    expect(mockSendSuccess).toHaveBeenCalledWith(
      res,
      expect.objectContaining({
        feed: expect.objectContaining({
          id: 'feed-1',
          title: 'TEDU Podcast',
          feed_url: 'https://example.com/feed.xml',
        }),
        sync: expect.objectContaining({
          status: 'failed',
        }),
      }),
      'Podcast feed created; initial sync failed',
      expect.objectContaining({
        sync_status: 'failed',
      }),
      201,
    );
    expect(mockSendError).not.toHaveBeenCalled();
  });

  it('returns a conflict response when the feed url already exists', async () => {
    const handler = mockRouteHandlers.post['/'];
    expect(handler).toBeTypeOf('function');

    mockDbQuery.mockRejectedValueOnce({
      code: '23505',
      constraint: 'podcast_feeds_feed_url_key',
    });

    const req = {
      body: {
        title: 'TEDU Podcast',
        feed_url: 'https://example.com/feed.xml',
      },
      user: { id: 'user-1' },
    };
    const res = {};

    await handler(req, res);

    expect(mockSendError).toHaveBeenCalledWith(res, 'Podcast feed URL already exists', 409);
    expect(mockSendSuccess).not.toHaveBeenCalled();
    expect(mockSyncPodcastFeed).not.toHaveBeenCalled();
  });

  it('returns per-feed sync results even when one feed fails', async () => {
    const handler = mockRouteHandlers.post['/sync'];
    expect(handler).toBeTypeOf('function');

    mockDbQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'feed-1',
          title: 'Feed One',
          feed_url: 'https://example.com/feed-1.xml',
        },
        {
          id: 'feed-2',
          title: 'Feed Two',
          feed_url: 'https://example.com/feed-2.xml',
        },
      ],
    });

    mockSyncPodcastFeed
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({
        processed: 8,
        upserted: 6,
        skipped: 2,
      });

    const req = {
      body: {},
    };
    const res = {};

    await handler(req, res);

    expect(mockSyncPodcastFeed).toHaveBeenCalledTimes(2);
    expect(mockSendSuccess).toHaveBeenCalledWith(
      res,
      {
        results: [
          {
            feed_id: 'feed-1',
            status: 'failed',
            error: 'timeout',
          },
          {
            feed_id: 'feed-2',
            status: 'synced',
            processed: 8,
            upserted: 6,
            skipped: 2,
          },
        ],
      },
      'Podcast feeds synced with some failures',
      expect.objectContaining({
        failed: 1,
        succeeded: 1,
      }),
    );
    expect(mockSendError).not.toHaveBeenCalled();
  });
});
