import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDbQuery,
  mockSendSuccess,
  mockSendError,
  mockRecordNowPlaying,
  mockRouteHandlers,
  mockRouter,
} = vi.hoisted(() => {
  const handlers: Record<string, Record<string, (...args: any[]) => any>> = {
    get: {},
    post: {},
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

  return {
    mockDbQuery: vi.fn(),
    mockSendSuccess: vi.fn(),
    mockSendError: vi.fn(),
    mockRecordNowPlaying: vi.fn(),
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

vi.mock('../services/radioHistory', () => ({
  recordNowPlaying: mockRecordNowPlaying,
}));

vi.mock('express', () => ({
  Router: vi.fn(() => mockRouter),
}));

import './radio';

describe('radio history routes', () => {
  beforeEach(() => {
    mockDbQuery.mockReset();
    mockSendSuccess.mockReset();
    mockSendError.mockReset();
    mockRecordNowPlaying.mockReset();
  });

  it('returns an empty array (not 404) when there is no recent history', async () => {
    const handler = mockRouteHandlers.get['/history/:channelId'];
    expect(handler).toBeTypeOf('function');

    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    const res = {};
    await handler({ params: { channelId: 'main' } }, res);

    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining("interval '15 minutes'"),
      ['main'],
    );
    expect(mockSendSuccess).toHaveBeenCalledWith(res, []);
    expect(mockSendError).not.toHaveBeenCalled();
  });

  it('returns the recorded rows ordered by played_at desc', async () => {
    const handler = mockRouteHandlers.get['/history/:channelId'];
    const rows = [
      { title: 'Song B', artist: 'Artist B', cover_url: null, played_at: '2026-06-20T10:01:00Z' },
      { title: 'Song A', artist: 'Artist A', cover_url: null, played_at: '2026-06-20T10:00:00Z' },
    ];
    mockDbQuery.mockResolvedValueOnce({ rows });

    const res = {};
    await handler({ params: { channelId: 'main' } }, res);

    expect(mockSendSuccess).toHaveBeenCalledWith(res, rows);
  });

  it('records a now-playing song via the service on POST', async () => {
    const handler = mockRouteHandlers.post['/history/:channelId'];
    expect(handler).toBeTypeOf('function');
    mockRecordNowPlaying.mockResolvedValueOnce(true);

    const res = {};
    await handler(
      { params: { channelId: 'main' }, body: { title: 'New Song', artist: 'New Artist', cover_url: 'http://x/cover.jpg' } },
      res,
    );

    expect(mockRecordNowPlaying).toHaveBeenCalledWith('main', {
      title: 'New Song',
      artist: 'New Artist',
      coverUrl: 'http://x/cover.jpg',
    });
    expect(mockSendSuccess).toHaveBeenCalledWith(res, { recorded: true }, 'Song recorded', null, 201);
  });

  it('rejects a POST without a title', async () => {
    const handler = mockRouteHandlers.post['/history/:channelId'];
    const res = {};
    await handler({ params: { channelId: 'main' }, body: {} }, res);

    expect(mockRecordNowPlaying).not.toHaveBeenCalled();
    expect(mockSendError).toHaveBeenCalledWith(res, 'title is required', 400);
  });
});
