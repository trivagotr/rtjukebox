import { describe, expect, it } from 'vitest';
import {
  maskSpotifyAppConfigForResponse,
  normalizeSpotifyAppConfigPayload,
} from './spotify';

describe('spotify app config route helpers', () => {
  it('normalizes app config update payloads', () => {
    expect(
      normalizeSpotifyAppConfigPayload({
        client_id: '  new-client-id  ',
        client_secret: '  new-client-secret  ',
      }),
    ).toEqual({
      clientId: 'new-client-id',
      clientSecret: 'new-client-secret',
    });
  });

  it('allows app config update payloads to omit the client secret', () => {
    expect(() =>
      normalizeSpotifyAppConfigPayload({
        client_id: '   ',
        client_secret: 'new-client-secret',
      }),
    ).toThrow('client_id is required');

    expect(
      normalizeSpotifyAppConfigPayload({
        client_id: 'new-client-id',
      }),
    ).toEqual({
      clientId: 'new-client-id',
    });
  });

  it('masks the client secret and marks the redirect uri as readonly', () => {
    expect(
      maskSpotifyAppConfigForResponse({
        clientId: 'db-client-id',
        clientSecret: 'db-client-secret',
        redirectUri: 'http://127.0.0.1:3000/api/v1/spotify/callback',
        redirectUriReadOnly: true,
        source: 'db',
      }),
    ).toEqual({
      clientId: 'db-client-id',
      clientSecretMasked: '********',
      clientSecretSet: true,
      redirectUri: 'http://127.0.0.1:3000/api/v1/spotify/callback',
      redirectUriReadOnly: true,
      source: 'db',
    });
  });
});
