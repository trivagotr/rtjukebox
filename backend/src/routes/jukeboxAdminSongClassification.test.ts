import { beforeAll, describe, expect, it } from 'vitest';

let jukeboxModule: typeof import('./jukebox');

beforeAll(async () => {
  process.env.SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || 'test-client';
  process.env.SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || 'test-secret';
  jukeboxModule = await import('./jukebox');
});

describe('jukebox admin song classification helpers', () => {
  it('normalizes hidden asset classification updates', () => {
    expect(
      jukeboxModule.normalizeAdminSongClassificationInput({
        visibility: 'hidden',
        asset_role: 'ad',
      }),
    ).toEqual({
      visibility: 'hidden',
      assetRole: 'ad',
    });
  });

  it('rejects public jingle or ad classification', () => {
    expect(() =>
      jukeboxModule.normalizeAdminSongClassificationInput({
        visibility: 'public',
        asset_role: 'jingle',
      }),
    ).toThrow('jingle and ad assets must remain hidden');
  });
});
