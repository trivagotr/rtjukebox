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
    patch: {},
  };

  const router: any = {};
  router.use = vi.fn(() => router);
  router.get = vi.fn((path: string, handler: (...args: any[]) => any) => {
    handlers.get[path] = handler;
    return router;
  });
  router.patch = vi.fn((path: string, handler: (...args: any[]) => any) => {
    handlers.patch[path] = handler;
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
      favorite_podcast_title: 'Morning Show',
      profile_headline: 'Radio lover',
      theme_key: 'neon',
    });
  });

  it('requires auth before profile mutation routes', () => {
    expect(mockRouter.use).toHaveBeenCalledWith(mockAuthMiddleware);
  });

  it('upserts the current user profile customization', async () => {
    const handler = mockRouteHandlers.patch['/me'];
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

    expect(mockDbQuery).toHaveBeenCalledWith(expect.stringContaining('favorite_song_title = EXCLUDED.favorite_song_title'), [
      'user-1', 'Ankara Ruzgari', 'Radio lover',
    ]);
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

  it('does not include omitted fields in a partial update', async () => {
    const handler = mockRouteHandlers.patch['/me'];
    mockDbQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user-1', theme_key: 'neon' }] });

    await handler({ user: { id: 'user-1', role: 'user' }, body: { theme_key: 'neon' } }, {});

    expect(mockDbQuery).toHaveBeenCalledWith(expect.stringContaining('(user_id, theme_key, updated_at)'), ['user-1', 'neon']);
    expect(mockDbQuery.mock.calls[0][0]).not.toContain('favorite_song_title');
  });
});
