import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSpotifyAppConfigPayload,
  buildSpotifyDeviceAuthDisconnectRequest,
  buildSpotifyDeviceAuthStartRequest,
  formatSpotifyDeviceAuthStatus,
  isSpotifyDeviceAuthSuccessMessage,
  maskSpotifyAppConfigForForm,
  SPOTIFY_APP_SECRET_MASK
} from './adminSpotifyConfig.js';

test('masks spotify app config secrets in read mode', () => {
  const view = maskSpotifyAppConfigForForm({
    clientId: 'client-123',
    clientSecretMasked: SPOTIFY_APP_SECRET_MASK,
    clientSecretSet: true,
    redirectUri: 'http://127.0.0.1:3000/api/v1/spotify/callback',
    redirectUriReadOnly: true,
    source: 'db'
  });

  assert.equal(view.client_id, 'client-123');
  assert.equal(view.client_secret, SPOTIFY_APP_SECRET_MASK);
});

test('keeps masked spotify secrets out of save payloads', () => {
  const payload = buildSpotifyAppConfigPayload({
    client_id: 'client-123',
    client_secret: SPOTIFY_APP_SECRET_MASK
  });

  assert.deepEqual(payload, {
    client_id: 'client-123'
  });
});

test('surfaces connected and disconnected spotify device status', () => {
  const connected = formatSpotifyDeviceAuthStatus({
    deviceId: 'device-1',
    connected: true,
    spotifyAccountId: 'spotify-1',
    spotifyDisplayName: 'Campus Radio',
    spotifyEmail: 'campus@example.com',
    spotifyProduct: 'premium',
    spotifyCountry: 'TR',
    tokenExpiresAt: null,
    scopes: 'streaming',
    hasRefreshToken: true
  });
  const disconnected = formatSpotifyDeviceAuthStatus({
    deviceId: 'device-2',
    connected: false,
    spotifyAccountId: null,
    spotifyDisplayName: null,
    spotifyEmail: null,
    spotifyProduct: null,
    spotifyCountry: null,
    tokenExpiresAt: null,
    scopes: null,
    hasRefreshToken: false
  });

  assert.equal(connected.isConnected, true);
  assert.equal(connected.label, 'Bağlı');
  assert.equal(connected.detail, 'Campus Radio');
  assert.equal(disconnected.isConnected, false);
  assert.equal(disconnected.label, 'Bağlantı yok');
});

test('builds authenticated spotify device auth start requests', () => {
  const request = buildSpotifyDeviceAuthStartRequest(
    'http://127.0.0.1:3000',
    'admin-token-123',
    'device-123'
  );

  assert.deepEqual(request, {
    method: 'GET',
    url: 'http://127.0.0.1:3000/api/v1/spotify/device-auth/start?device_id=device-123&format=json',
    headers: {
      Authorization: 'Bearer admin-token-123',
    },
  });
});

test('builds authenticated spotify device auth disconnect requests', () => {
  const request = buildSpotifyDeviceAuthDisconnectRequest(
    'http://127.0.0.1:3000',
    'admin-token-123',
    'device-123'
  );

  assert.deepEqual(request, {
    method: 'DELETE',
    url: 'http://127.0.0.1:3000/api/v1/spotify/device-auth/device-123',
    headers: {
      Authorization: 'Bearer admin-token-123',
    },
  });
});

test('detects spotify device auth success messages', () => {
  assert.equal(
    isSpotifyDeviceAuthSuccessMessage({
      type: 'SPOTIFY_DEVICE_AUTH_SUCCESS',
      deviceId: 'device-123'
    }),
    true
  );

  assert.equal(
    isSpotifyDeviceAuthSuccessMessage({
      type: 'OTHER_EVENT'
    }),
    false
  );
});
