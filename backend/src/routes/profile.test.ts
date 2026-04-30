import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDbQuery,
  mockSendSuccess,
  mockSendError,
  mockAuthMiddleware,
  mockRouteHandlers,
  mockRouter,
} = vi.hoisted(() => {
  const handlers: Record<string, Record<string, (...args: any[]) => any>> = {
    get: {},
    put: {},
  };

  const router: any = {};
  router.use = vi.fn(() => router);
  router.get = vi.fn((path: string, handler: (...args: any[]) => any) => {
    handlers.get[path] = handler;
    return router;
  });
  router.put = vi.fn((path: string, handler: (...args: any[]) => any) => {
    handlers.put[path] = handler;
    return router;
  });

  return {
    mockDbQuery: vi.fn(),
    mockSendSuccess: vi.fn(),
    mockSendError: vi.fn(),
    mockAuthMiddleware: vi.fn(),
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

vi.mock('../utils/response', () => ({
  sendSuccess: mockSendSuccess,
  sendError: mockSendError,
}));

vi.mock('express', () => ({
  Router: vi.fn(() => mockRouter),
}));

import { normalizeProfileCustomizationPayload } from './profile';

describe('profile customization router', () => {
  beforeEach(() => {
    mockDbQuery.mockReset();
    mockSendSuccess.mockReset();
    mockSendError.mockReset();
  });

  it('normalizes profile favorite fields from the mobile form payload', () => {
    expect(
      normalizeProfileCustomizationPayload({
        favorite_song_title: '  Ankara Ruzgari  ',
        favorite_song_artist: '  Artist  ',
        favorite_song_spotify_uri: 'spotify:track:1',
        favorite_artist_name: '  Singer  ',
        favorite_podcast_title: '  Morning Show  ',
        profile_headline: '  Radio lover  ',
        theme_key: 'neon',
      }),
    ).toEqual({
      favorite_song_title: 'Ankara Ruzgari',
      favorite_song_artist: 'Artist',
      favorite_song_spotify_uri: 'spotify:track:1',
      favorite_artist_name: 'Singer',
      favorite_artist_spotify_id: null,
      favorite_podcast_id: null,
      favorite_podcast_title: 'Morning Show',
      profile_headline: 'Radio lover',
      featured_badge_id: null,
      theme_key: 'neon',
    });
  });

  it('requires auth before profile mutation routes', () => {
    expect(mockRouter.use).toHaveBeenCalledWith(mockAuthMiddleware);
  });

  it('upserts the current user profile customization', async () => {
    const handler = mockRouteHandlers.put['/me'];
    expect(handler).toBeTypeOf('function');
    mockDbQuery.mockResolvedValueOnce({
      rows: [
        {
          user_id: 'user-1',
          favorite_song_title: 'Ankara Ruzgari',
          profile_headline: 'Radio lover',
        },
      ],
    });

    await handler({
      user: { id: 'user-1', role: 'user' },
      body: {
        favorite_song_title: ' Ankara Ruzgari ',
        profile_headline: ' Radio lover ',
      },
    }, {});

    expect(mockDbQuery).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (user_id) DO UPDATE'), expect.any(Array));
    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        profile: expect.objectContaining({
          favorite_song_title: 'Ankara Ruzgari',
        }),
      }),
      'Profile updated',
    );
  });
});
