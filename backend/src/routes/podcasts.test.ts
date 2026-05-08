import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDbQuery, mockSendSuccess, mockSendError, mockRouteHandlers, mockRouter } = vi.hoisted(() => {
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

  return {
    mockDbQuery: vi.fn(),
    mockSendSuccess: vi.fn(),
    mockSendError: vi.fn(),
    mockRouteHandlers: handlers,
    mockRouter: router,
  };
});

vi.mock('../db', () => ({
  db: {
    query: mockDbQuery,
  },
}));

vi.mock('../utils/response', () => ({
  sendSuccess: mockSendSuccess,
  sendError: mockSendError,
}));

vi.mock('express', () => ({
  Router: vi.fn(() => mockRouter),
}));

import { normalizePodcastListQuery } from './podcasts';

describe('normalizePodcastListQuery', () => {
  beforeEach(() => {
    mockDbQuery.mockReset();
    mockSendSuccess.mockReset();
    mockSendError.mockReset();
  });

  it('defaults to page 1 and per_page 10', () => {
    expect(normalizePodcastListQuery({})).toEqual({
      page: 1,
      perPage: 10,
    });
  });

  it('clamps page and per_page to the supported range', () => {
    expect(
      normalizePodcastListQuery({
        page: '0',
        per_page: '999',
      }),
    ).toEqual({
      page: 1,
      perPage: 50,
    });
  });
});

describe('podcasts route contract', () => {
  beforeEach(() => {
    mockDbQuery.mockReset();
    mockSendSuccess.mockReset();
    mockSendError.mockReset();
  });

  it('preserves the public item shape and old default pagination contract', async () => {
    const handler = mockRouteHandlers.get['/'];
    expect(handler).toBeTypeOf('function');

    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'episode-1',
            title: 'Episode 1',
            description: '<p>Hello <strong>world</strong></p>',
            audio_url: 'https://cdn.example.com/episode-1.mp3',
            episode_url: 'https://example.com/episode-1',
            image_url: 'https://cdn.example.com/episode-1.jpg',
            published_at: '2026-04-14T10:00:00.000Z',
            feed_title: 'TEDU Podcast',
          },
        ],
      });

    const req = { query: {} };
    const res = {};

    await handler(req, res);

    expect(mockDbQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('LIMIT $1 OFFSET $2'),
      [10, 0],
    );
    expect(mockSendSuccess).toHaveBeenCalledWith(
      res,
      expect.objectContaining({
        items: [
          expect.objectContaining({
            id: 'episode-1',
            title: 'Episode 1',
            excerpt: 'Hello world',
            featured_image: 'https://cdn.example.com/episode-1.jpg',
            audio_url: 'https://cdn.example.com/episode-1.mp3',
            episode_url: 'https://example.com/episode-1',
            external_url: 'https://example.com/episode-1',
            published_at: '2026-04-14T10:00:00.000Z',
            feed_title: 'TEDU Podcast',
          }),
        ],
        total: 1,
        total_pages: 1,
      }),
    );
    expect(mockSendError).not.toHaveBeenCalled();
  });
});
