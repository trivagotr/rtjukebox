export const SPOTIFY_APP_SECRET_MASK = '********';

export interface SpotifyAppConfigApiResponse {
  clientId: string;
  clientSecretMasked: string;
  clientSecretSet: boolean;
  redirectUri: string;
  redirectUriReadOnly: true;
  source: 'db' | 'env';
}

export interface SpotifyAppConfigFormState {
  client_id: string;
  client_secret: string;
}

export interface SpotifyDeviceAuthStatusApiResponse {
  deviceId: string;
  connected: boolean;
  spotifyAccountId: string | null;
  spotifyDisplayName: string | null;
  spotifyEmail: string | null;
  spotifyProduct: string | null;
  spotifyCountry: string | null;
  tokenExpiresAt: string | Date | null;
  scopes: string | null;
  hasRefreshToken: boolean;
  reason?: string | null;
}

export interface SpotifyDeviceAuthStatusView {
  isConnected: boolean;
  label: string;
  detail: string;
  actionLabel: string;
  tone: 'success' | 'danger';
}

export interface SpotifyDeviceAuthEndpoints {
  status: string;
  start: string;
  disconnect: {
    method: 'DELETE';
    url: string;
  };
}

export interface SpotifyDeviceAuthStartRequest {
  method: 'GET';
  url: string;
  headers: {
    Authorization: string;
  };
}

export interface SpotifyDeviceAuthDisconnectRequest {
  method: 'DELETE';
  url: string;
  headers: {
    Authorization: string;
  };
}

export interface SpotifyDeviceAuthSuccessMessage {
  type: 'SPOTIFY_DEVICE_AUTH_SUCCESS';
  deviceId?: string;
}

export function maskSpotifyAppConfigForForm(
  config: SpotifyAppConfigApiResponse | null | undefined
): SpotifyAppConfigFormState {
  return {
    client_id: config?.clientId ?? '',
    client_secret: config?.clientSecretSet ? SPOTIFY_APP_SECRET_MASK : '',
  };
}

export function buildSpotifyAppConfigPayload(form: SpotifyAppConfigFormState): {
  client_id: string;
  client_secret?: string;
} {
  const client_id = form.client_id.trim();
  const client_secret = form.client_secret.trim();
  const payload: { client_id: string; client_secret?: string } = { client_id };

  if (client_secret && client_secret !== SPOTIFY_APP_SECRET_MASK) {
    payload.client_secret = client_secret;
  }

  return payload;
}

export function formatSpotifyDeviceAuthStatus(
  status: SpotifyDeviceAuthStatusApiResponse | null | undefined
): SpotifyDeviceAuthStatusView {
  if (!status?.connected) {
    const detail =
      status?.spotifyDisplayName ||
      status?.spotifyEmail ||
      'Bu cihazın Spotify bağlantısı yok';

    return {
      isConnected: false,
      label: status?.reason || 'Bağlantı yok',
      detail,
      actionLabel: status?.reason ? 'Yeniden bağla' : 'Bağla',
      tone: 'danger',
    };
  }

  const detail =
    status.spotifyDisplayName ||
    status.spotifyEmail ||
    'Spotify hesabı bağlı';

  return {
    isConnected: true,
    label: 'Bağlı',
    detail,
    actionLabel: 'Yenile',
    tone: 'success',
  };
}

export function buildSpotifyDeviceAuthEndpoints(
  baseUrl: string,
  deviceId: string
): SpotifyDeviceAuthEndpoints {
  const encodedDeviceId = encodeURIComponent(deviceId);

  return {
    status: `${baseUrl}/api/v1/spotify/device-auth/status?device_id=${encodedDeviceId}`,
    start: `${baseUrl}/api/v1/spotify/device-auth/start?device_id=${encodedDeviceId}`,
    disconnect: {
      method: 'DELETE',
      url: `${baseUrl}/api/v1/spotify/device-auth/${encodedDeviceId}`,
    },
  };
}

export function buildSpotifyDeviceAuthStartRequest(
  baseUrl: string,
  token: string,
  deviceId: string,
  returnOrigin?: string
): SpotifyDeviceAuthStartRequest {
  const params = new URLSearchParams({
    device_id: deviceId,
    format: 'json',
  });
  if (returnOrigin) {
    params.set('return_origin', returnOrigin);
  }

  return {
    method: 'GET',
    url: `${baseUrl}/api/v1/spotify/device-auth/start?${params.toString()}`,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
}

export function buildSpotifyDeviceAuthDisconnectRequest(
  baseUrl: string,
  token: string,
  deviceId: string
): SpotifyDeviceAuthDisconnectRequest {
  const encodedDeviceId = encodeURIComponent(deviceId);

  return {
    method: 'DELETE',
    url: `${baseUrl}/api/v1/spotify/device-auth/${encodedDeviceId}`,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
}

export function isSpotifyDeviceAuthSuccessMessage(data: unknown): data is SpotifyDeviceAuthSuccessMessage {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const message = data as Record<string, unknown>;
  return message.type === 'SPOTIFY_DEVICE_AUTH_SUCCESS' &&
    (message.deviceId === undefined || typeof message.deviceId === 'string');
}
