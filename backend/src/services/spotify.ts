import axios from 'axios';
import crypto from 'crypto';
import { db } from '../db';
import { SpotifyTrack as ContentFilterTrack } from './contentFilter';

const SPOTIFY_ACCOUNTS_URL = 'https://accounts.spotify.com';
const SPOTIFY_API_URL = 'https://api.spotify.com/v1';
const DEVICE_SPOTIFY_CALLBACK_PATH = '/api/v1/spotify/device-auth/callback';

export const SPOTIFY_REQUIRED_SCOPES = [
  'streaming',
  'user-modify-playback-state',
  'user-read-playback-state',
  'user-read-currently-playing',
  'user-read-email',
  'user-read-private',
  'playlist-read-private',
  'playlist-read-collaborative',
].join(' ');

// In-memory cache for Client Credentials token (no user login needed)
let clientToken: { token: string; expiresAt: number; credentialsKey: string } | null = null;

interface SpotifyTokenRow {
  id: string;
  user_id: string | null;
  access_token: string;
  refresh_token: string;
  token_expires_at: Date;
  scopes: string;
}

interface SpotifyDeviceAuthRow {
  device_id: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: Date;
  scopes: string;
  spotify_account_id: string;
  spotify_display_name: string;
  spotify_email: string | null;
  spotify_product: string | null;
  spotify_country: string | null;
}

export interface SpotifyAppConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  redirectUriReadOnly: true;
  source: 'db' | 'env';
}

export interface SpotifyDeviceAuthStatus {
  deviceId: string;
  connected: boolean;
  spotifyAccountId: string | null;
  spotifyDisplayName: string | null;
  spotifyEmail: string | null;
  spotifyProduct: string | null;
  spotifyCountry: string | null;
  tokenExpiresAt: Date | null;
  scopes: string | null;
  hasRefreshToken: boolean;
}

interface SpotifyTrack {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album: { id: string; name: string; images: { url: string; width: number; height: number }[] };
  duration_ms: number;
  uri: string;
  preview_url: string | null;
  explicit: boolean;
  external_urls: { spotify: string };
}

interface SpotifySearchResult {
  tracks: SpotifyTrack[];
  total: number;
}

export interface CatalogSongSearchItem {
  id: string | null;
  source_type: 'spotify' | 'local';
  visibility: 'public' | 'hidden';
  asset_role: 'music' | 'jingle' | 'ad';
  spotify_uri: string | null;
  spotify_id: string | null;
  title: string;
  artist: string;
  artist_id: string | null;
  album: string | null;
  cover_url: string | null;
  duration_ms: number | null;
  is_explicit: boolean;
  is_blocked: boolean;
  file_url: string | null;
  play_count: number;
}

export function normalizeSpotifySearchLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return 10;
  }

  return Math.max(1, Math.min(Math.trunc(limit), 10));
}

export function deriveSpotifyDeviceAuthRedirectUri(redirectUri: string): string {
  const url = new URL(redirectUri);
  const mainCallbackPath = '/api/v1/spotify/callback';
  if (url.pathname.endsWith(mainCallbackPath)) {
    url.pathname = `${url.pathname.slice(0, -mainCallbackPath.length)}${DEVICE_SPOTIFY_CALLBACK_PATH}`;
  } else {
    url.pathname = DEVICE_SPOTIFY_CALLBACK_PATH;
  }
  url.search = '';
  url.hash = '';
  return url.toString();
}

export class SpotifyService {
  private async loadSpotifyAppConfig(): Promise<SpotifyAppConfig> {
    const result = await db.query(
      `SELECT client_id, client_secret
       FROM spotify_app_config
       WHERE id = 1
       LIMIT 1`
    );

    const redirectUri = process.env.SPOTIFY_REDIRECT_URI || '';
    const row = result?.rows?.[0];

    if (row?.client_id && row?.client_secret) {
      return {
        clientId: row.client_id,
        clientSecret: row.client_secret,
        redirectUri,
        redirectUriReadOnly: true,
        source: 'db',
      };
    }

    return {
      clientId: process.env.SPOTIFY_CLIENT_ID || '',
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',
      redirectUri,
      redirectUriReadOnly: true,
      source: 'env',
    };
  }

  async getSpotifyAppConfig(): Promise<SpotifyAppConfig> {
    return this.loadSpotifyAppConfig();
  }

  async saveSpotifyAppConfig(input: { clientId: string; clientSecret?: string }): Promise<void> {
    const currentConfig = await this.getSpotifyAppConfig();
    const nextClientSecret = typeof input.clientSecret === 'string' && input.clientSecret.trim()
      ? input.clientSecret.trim()
      : currentConfig.clientSecret;

    if (!nextClientSecret) {
      throw new Error('client_secret is required');
    }

    const credentialsChanged =
      currentConfig.clientId !== input.clientId || currentConfig.clientSecret !== nextClientSecret;

    await db.query(
      `INSERT INTO spotify_app_config (id, client_id, client_secret)
       VALUES (1, $1, $2)
       ON CONFLICT (id) DO UPDATE SET
        client_id = EXCLUDED.client_id,
        client_secret = EXCLUDED.client_secret,
        updated_at = NOW()`,
      [input.clientId, nextClientSecret]
    );

    if (credentialsChanged) {
      await db.query('DELETE FROM spotify_auth WHERE TRUE');
      await db.query('DELETE FROM spotify_device_auth WHERE TRUE');
    }

    clientToken = null;
  }

  private async buildSignedDeviceAuthState(deviceId: string): Promise<string> {
    const appConfig = await this.getSpotifyAppConfig();
    const nonce = crypto.randomBytes(12).toString('hex');
    const payload = `device.${deviceId}.${nonce}`;
    const signature = crypto
      .createHmac('sha256', appConfig.clientSecret)
      .update(payload)
      .digest('base64url');

    return `${payload}.${signature}`;
  }

  private parseSignedDeviceAuthState(state: string, clientSecret: string): { deviceId: string } {
    const [prefix, deviceId, nonce, signature] = state.split('.');

    if (prefix !== 'device' || !deviceId || !nonce || !signature) {
      throw new Error('Invalid Spotify device auth state');
    }

    const payload = `${prefix}.${deviceId}.${nonce}`;
    const expectedSignature = crypto
      .createHmac('sha256', clientSecret)
      .update(payload)
      .digest('base64url');

    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
    const signaturesMatch =
      signatureBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(signatureBuffer, expectedBuffer);

    if (!signaturesMatch) {
      throw new Error('Invalid Spotify device auth state');
    }

    return { deviceId };
  }

  isDeviceAuthState(state: string): boolean {
    return typeof state === 'string' && state.startsWith('device.') && state.split('.').length === 4;
  }

  async getDeviceAuthStartUrl(deviceId: string): Promise<string> {
    const appConfig = await this.getSpotifyAppConfig();
    const state = await this.buildSignedDeviceAuthState(deviceId);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: appConfig.clientId,
      scope: SPOTIFY_REQUIRED_SCOPES,
      redirect_uri: appConfig.redirectUri,
      show_dialog: 'true',
      state,
    });

    return `${SPOTIFY_ACCOUNTS_URL}/authorize?${params.toString()}`;
  }

  async saveDeviceSpotifyAuth(input: {
    deviceId: string;
    accessToken: string;
    refreshToken: string;
    tokenExpiresAt: Date;
    scopes: string;
    spotifyAccountId: string;
    spotifyDisplayName: string;
    spotifyEmail: string | null;
    spotifyProduct: string | null;
    spotifyCountry: string | null;
  }): Promise<void> {
    await db.query(
      `INSERT INTO spotify_device_auth (
         device_id,
         spotify_account_id,
         spotify_display_name,
         spotify_email,
         spotify_product,
         spotify_country,
         access_token,
         refresh_token,
         token_expires_at,
         scopes
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (device_id) DO UPDATE SET
         spotify_account_id = EXCLUDED.spotify_account_id,
         spotify_display_name = EXCLUDED.spotify_display_name,
         spotify_email = EXCLUDED.spotify_email,
         spotify_product = EXCLUDED.spotify_product,
         spotify_country = EXCLUDED.spotify_country,
         access_token = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         token_expires_at = EXCLUDED.token_expires_at,
         scopes = EXCLUDED.scopes,
         updated_at = NOW()`,
      [
        input.deviceId,
        input.spotifyAccountId,
        input.spotifyDisplayName,
        input.spotifyEmail,
        input.spotifyProduct,
        input.spotifyCountry,
        input.accessToken,
        input.refreshToken,
        input.tokenExpiresAt,
        input.scopes,
      ]
    );
  }

  async handleDeviceAuthCallback(
    code: string,
    state: string,
    redirectUriOverride?: string
  ): Promise<SpotifyDeviceAuthStatus> {
    const appConfig = await this.getSpotifyAppConfig();
    const { deviceId } = this.parseSignedDeviceAuthState(state, appConfig.clientSecret);
    const redirectUri = redirectUriOverride?.trim() || appConfig.redirectUri;

    const deviceResult = await db.query('SELECT id FROM devices WHERE id = $1', [deviceId]);
    if (deviceResult.rows.length === 0) {
      throw new Error('Device not found');
    }

    const existingAuth = await this.getDeviceAuthRow(deviceId);

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    });

    const authHeader = Buffer.from(`${appConfig.clientId}:${appConfig.clientSecret}`).toString('base64');

    const tokenResponse = await axios.post(`${SPOTIFY_ACCOUNTS_URL}/api/token`, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${authHeader}`,
      },
    });

    const accessToken = tokenResponse.data.access_token;
    const refreshToken = tokenResponse.data.refresh_token || existingAuth?.refresh_token || null;
    if (!refreshToken) {
      throw new Error('Spotify did not return a refresh token and no existing device refresh token was found');
    }
    const expiresIn = tokenResponse.data.expires_in;
    const scopes = tokenResponse.data.scope || SPOTIFY_REQUIRED_SCOPES;
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

    const profileResponse = await axios.get(`${SPOTIFY_API_URL}/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    await this.saveDeviceSpotifyAuth({
      deviceId,
      accessToken,
      refreshToken,
      tokenExpiresAt,
      scopes,
      spotifyAccountId: profileResponse.data.id,
      spotifyDisplayName: profileResponse.data.display_name || profileResponse.data.id || 'Spotify Account',
      spotifyEmail: profileResponse.data.email || null,
      spotifyProduct: profileResponse.data.product || null,
      spotifyCountry: profileResponse.data.country || null,
    });

    return {
      deviceId,
      connected: true,
      spotifyAccountId: profileResponse.data.id,
      spotifyDisplayName: profileResponse.data.display_name || profileResponse.data.id || 'Spotify Account',
      spotifyEmail: profileResponse.data.email || null,
      spotifyProduct: profileResponse.data.product || null,
      spotifyCountry: profileResponse.data.country || null,
      tokenExpiresAt,
      scopes,
      hasRefreshToken: Boolean(refreshToken),
    };
  }

  // ─── Client Credentials Flow (for search, no user auth needed) ───

  async getClientToken(): Promise<string> {
    const appConfig = await this.getSpotifyAppConfig();
    const credentialsKey = `${appConfig.clientId}:${appConfig.clientSecret}`;

    // Return cached token if still valid (with 60s buffer)
    if (clientToken && clientToken.credentialsKey === credentialsKey && clientToken.expiresAt > Date.now() + 60_000) {
      return clientToken.token;
    }

    const params = new URLSearchParams({ grant_type: 'client_credentials' });
    const authHeader = Buffer.from(`${appConfig.clientId}:${appConfig.clientSecret}`).toString('base64');

    const response = await axios.post(`${SPOTIFY_ACCOUNTS_URL}/api/token`, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${authHeader}`,
      },
    });

    clientToken = {
      token: response.data.access_token,
      expiresAt: Date.now() + response.data.expires_in * 1000,
      credentialsKey,
    };

    console.log('[SpotifyService] Client credentials token obtained');
    return clientToken.token;
  }

  // ─── Authorization Code Flow (for playback control, requires admin auth) ───

  async getAuthUrl(state?: string): Promise<string> {
    const appConfig = await this.getSpotifyAppConfig();
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: appConfig.clientId,
      scope: SPOTIFY_REQUIRED_SCOPES,
      redirect_uri: appConfig.redirectUri,
      show_dialog: 'true',
    });

    if (state) {
      params.set('state', state);
    }

    return `${SPOTIFY_ACCOUNTS_URL}/authorize?${params.toString()}`;
  }

  async handleCallback(code: string, userId?: string): Promise<void> {
    const appConfig = await this.getSpotifyAppConfig();
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: appConfig.redirectUri,
    });

    const authHeader = Buffer.from(`${appConfig.clientId}:${appConfig.clientSecret}`).toString('base64');

    const response = await axios.post(`${SPOTIFY_ACCOUNTS_URL}/api/token`, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${authHeader}`,
      },
    });

    const { access_token, refresh_token, expires_in, scope } = response.data;
    const tokenExpiresAt = new Date(Date.now() + expires_in * 1000);

    // Upsert: delete any existing tokens then insert new ones
    // We only keep one active Spotify auth (the school's Premium account)
    await db.query('DELETE FROM spotify_auth WHERE TRUE');
    await db.query(
      `INSERT INTO spotify_auth (user_id, access_token, refresh_token, token_expires_at, scopes)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId || null, access_token, refresh_token, tokenExpiresAt, scope]
    );

    console.log('[SpotifyService] OAuth tokens stored successfully');
  }

  async getAccessToken(): Promise<string> {
    const result = await db.query(
      'SELECT * FROM spotify_auth ORDER BY updated_at DESC LIMIT 1'
    );

    if (result.rows.length === 0) {
      throw new Error('No Spotify authorization found. Admin must authorize via /api/v1/spotify/auth');
    }

    const row = result.rows[0] as SpotifyTokenRow;

    // If token expires within 5 minutes, refresh it
    const expiresAt = new Date(row.token_expires_at).getTime();
    if (expiresAt < Date.now() + 5 * 60 * 1000) {
      return this.refreshAccessToken(row.refresh_token, row.id);
    }

    return row.access_token;
  }

  async refreshAccessToken(refreshToken?: string, rowId?: string): Promise<string> {
    const appConfig = await this.getSpotifyAppConfig();

    // If no refreshToken passed, fetch from DB
    if (!refreshToken) {
      const result = await db.query(
        'SELECT * FROM spotify_auth ORDER BY updated_at DESC LIMIT 1'
      );
      if (result.rows.length === 0) {
        throw new Error('No Spotify authorization found');
      }
      refreshToken = result.rows[0].refresh_token;
      rowId = result.rows[0].id;
    }

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken!,
    });

    const authHeader = Buffer.from(`${appConfig.clientId}:${appConfig.clientSecret}`).toString('base64');

    const response = await axios.post(`${SPOTIFY_ACCOUNTS_URL}/api/token`, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${authHeader}`,
      },
    });

    const { access_token, refresh_token: newRefreshToken, expires_in } = response.data;
    const tokenExpiresAt = new Date(Date.now() + expires_in * 1000);

    // Update stored tokens (Spotify may or may not return a new refresh_token)
    await db.query(
      `UPDATE spotify_auth
       SET access_token = $1,
           refresh_token = COALESCE($2, refresh_token),
           token_expires_at = $3,
           updated_at = NOW()
       WHERE id = $4`,
      [access_token, newRefreshToken || null, tokenExpiresAt, rowId]
    );

    console.log('[SpotifyService] Access token refreshed');
    return access_token;
  }

  private async getDeviceAuthRow(deviceId: string): Promise<SpotifyDeviceAuthRow | null> {
    const result = await db.query(
      `SELECT device_id,
              access_token,
              refresh_token,
              token_expires_at,
              scopes,
              spotify_account_id,
              spotify_display_name,
              spotify_email,
              spotify_product,
              spotify_country
       FROM spotify_device_auth
       WHERE device_id = $1
       LIMIT 1`,
      [deviceId]
    );

    return result.rows[0] ?? null;
  }

  async refreshDeviceAccessToken(deviceId: string, refreshToken?: string): Promise<string> {
    const appConfig = await this.getSpotifyAppConfig();

    let currentRow = null as SpotifyDeviceAuthRow | null;
    if (!refreshToken) {
      currentRow = await this.getDeviceAuthRow(deviceId);
      if (!currentRow) {
        throw new Error('No Spotify authorization found for device');
      }
      refreshToken = currentRow.refresh_token;
    }

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken!,
    });

    const authHeader = Buffer.from(`${appConfig.clientId}:${appConfig.clientSecret}`).toString('base64');

    const response = await axios.post(`${SPOTIFY_ACCOUNTS_URL}/api/token`, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${authHeader}`,
      },
    });

    const { access_token, refresh_token: newRefreshToken, expires_in, scope } = response.data;
    const tokenExpiresAt = new Date(Date.now() + expires_in * 1000);

    await db.query(
      `UPDATE spotify_device_auth
       SET access_token = $1,
           refresh_token = COALESCE($2, refresh_token),
           token_expires_at = $3,
           scopes = COALESCE($4, scopes),
           updated_at = NOW()
       WHERE device_id = $5`,
      [access_token, newRefreshToken || null, tokenExpiresAt, scope || null, deviceId]
    );

    if (currentRow) {
      currentRow.access_token = access_token;
      currentRow.refresh_token = newRefreshToken || currentRow.refresh_token;
      currentRow.token_expires_at = tokenExpiresAt;
      currentRow.scopes = scope || currentRow.scopes;
    }

    return access_token;
  }

  async getDeviceAuthStatus(deviceId: string): Promise<SpotifyDeviceAuthStatus> {
    const row = await this.getDeviceAuthRow(deviceId);

    if (!row) {
      return {
        deviceId,
        connected: false,
        spotifyAccountId: null,
        spotifyDisplayName: null,
        spotifyEmail: null,
        spotifyProduct: null,
        spotifyCountry: null,
        tokenExpiresAt: null,
        scopes: null,
        hasRefreshToken: false,
      };
    }

    return {
      deviceId,
      connected: true,
      spotifyAccountId: row.spotify_account_id,
      spotifyDisplayName: row.spotify_display_name,
      spotifyEmail: row.spotify_email,
      spotifyProduct: row.spotify_product,
      spotifyCountry: row.spotify_country,
      tokenExpiresAt: row.token_expires_at,
      scopes: row.scopes,
      hasRefreshToken: Boolean(row.refresh_token),
    };
  }

  async deleteDeviceAuth(deviceId: string): Promise<void> {
    await db.query('DELETE FROM spotify_device_auth WHERE device_id = $1', [deviceId]);
  }

  // ─── Search ───

  private mapSpotifyApiTrack(track: any): SpotifyTrack {
    return {
      id: track.id,
      name: track.name,
      artists: track.artists.map((artist: any) => ({ id: artist.id, name: artist.name })),
      album: {
        id: track.album.id,
        name: track.album.name,
        images: track.album.images,
      },
      duration_ms: track.duration_ms,
      uri: track.uri,
      preview_url: track.preview_url,
      explicit: track.explicit || false,
      external_urls: track.external_urls,
    };
  }

  async searchTracks(query: string, market = 'TR', limit = 20): Promise<SpotifySearchResult> {
    const token = await this.getClientToken();
    const normalizedLimit = normalizeSpotifySearchLimit(limit);

    const response = await axios.get(`${SPOTIFY_API_URL}/search`, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        q: query,
        type: 'track',
        market,
        limit: normalizedLimit,
      },
    });

    const items = response.data.tracks.items.map((track: any) => this.mapSpotifyApiTrack(track));

    return {
      tracks: items,
      total: response.data.tracks.total,
    };
  }

  async getTrackByUri(spotifyUri: string, market = 'TR'): Promise<ContentFilterTrack> {
    const token = await this.getClientToken();
    const trackId = spotifyUri.startsWith('spotify:track:')
      ? spotifyUri.split(':').pop()
      : spotifyUri;

    if (!trackId) {
      throw new Error('Invalid Spotify track URI');
    }

    const response = await axios.get(`${SPOTIFY_API_URL}/tracks/${trackId}`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { market },
    });

    return toContentFilterTrack(this.mapSpotifyApiTrack(response.data));
  }

  async getPlaylistTracks(playlistUri: string, market = 'TR', limit = 50): Promise<ContentFilterTrack[]> {
    const token = await this.getAccessToken();
    const playlistId = playlistUri.startsWith('spotify:playlist:')
      ? playlistUri.split(':').pop()
      : playlistUri;

    if (!playlistId) {
      throw new Error('Invalid Spotify playlist URI');
    }

    const response = await axios.get(`${SPOTIFY_API_URL}/playlists/${playlistId}/items`, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        market,
        limit,
      },
    });

    return response.data.items
      .map((item: any) => item.item ?? item.track)
      .filter((track: any) => track && track.type === 'track')
      .map((track: any) => toContentFilterTrack(this.mapSpotifyApiTrack(track)));
  }

  // ─── Playback Control ───

  async playTrack(deviceId: string, spotifyUri: string): Promise<void> {
    const token = await this.getAccessToken();

    await axios.put(
      `${SPOTIFY_API_URL}/me/player/play`,
      { uris: [spotifyUri] },
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { device_id: deviceId },
      }
    );
  }

  async transferPlayback(deviceId: string, play = true): Promise<void> {
    const token = await this.getAccessToken();

    await axios.put(
      `${SPOTIFY_API_URL}/me/player`,
      {
        device_ids: [deviceId],
        play,
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
  }

  async pausePlayback(deviceId: string): Promise<void> {
    const token = await this.getAccessToken();

    await axios.put(
      `${SPOTIFY_API_URL}/me/player/pause`,
      {},
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { device_id: deviceId },
      }
    );
  }

  async resumePlayback(deviceId: string): Promise<void> {
    const token = await this.getAccessToken();

    await axios.put(
      `${SPOTIFY_API_URL}/me/player/play`,
      {},
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { device_id: deviceId },
      }
    );
  }

  async setVolume(deviceId: string, volumePercent: number): Promise<void> {
    const token = await this.getAccessToken();

    const clamped = Math.max(0, Math.min(100, Math.round(volumePercent)));

    await axios.put(
      `${SPOTIFY_API_URL}/me/player/volume`,
      null,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { volume_percent: clamped, device_id: deviceId },
      }
    );
  }

  async skipTrack(deviceId: string): Promise<void> {
    const token = await this.getAccessToken();

    await axios.post(
      `${SPOTIFY_API_URL}/me/player/next`,
      null,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { device_id: deviceId },
      }
    );
  }

  async getCurrentPlaybackSnapshot(): Promise<{
    deviceId: string | null;
    isPlaying: boolean;
    progressMs: number | null;
    itemUri: string | null;
  } | null> {
    const token = await this.getAccessToken();

    const response = await axios.get(
      `${SPOTIFY_API_URL}/me/player`,
      {
        headers: { Authorization: `Bearer ${token}` },
        validateStatus: (status) => status === 200 || status === 204,
      }
    );

    if (response.status === 204 || !response.data) {
      return null;
    }

    return {
      deviceId: response.data.device?.id ?? null,
      isPlaying: Boolean(response.data.is_playing),
      progressMs: typeof response.data.progress_ms === 'number' ? response.data.progress_ms : null,
      itemUri: response.data.item?.uri ?? null,
    };
  }

  async getKioskPlaybackToken(deviceId: string): Promise<{
    accessToken: string;
    tokenExpiresAt: Date;
    scopes: string;
  }> {
    const row = await this.getDeviceAuthRow(deviceId);
    if (!row) {
      throw new Error('No Spotify authorization found for device');
    }

    const expiresAt = new Date(row.token_expires_at).getTime();
    if (expiresAt < Date.now() + 5 * 60 * 1000) {
      const accessToken = await this.refreshDeviceAccessToken(deviceId, row.refresh_token);
      const refreshedRow = await this.getDeviceAuthRow(deviceId);
      if (!refreshedRow) {
        throw new Error('No Spotify authorization found for device');
      }

      return {
        accessToken,
        tokenExpiresAt: refreshedRow.token_expires_at,
        scopes: refreshedRow.scopes,
      };
    }

    return {
      accessToken: row.access_token,
      tokenExpiresAt: row.token_expires_at,
      scopes: row.scopes,
    };
  }

  // ─── Status ───

  async getAuthStatus(): Promise<{
    authorized: boolean;
    tokenExpiresAt: Date | null;
    scopes: string | null;
    hasRefreshToken: boolean;
  }> {
    const result = await db.query(
      'SELECT token_expires_at, scopes, refresh_token FROM spotify_auth ORDER BY updated_at DESC LIMIT 1'
    );

    if (result.rows.length === 0) {
      return { authorized: false, tokenExpiresAt: null, scopes: null, hasRefreshToken: false };
    }

    const row = result.rows[0];
    return {
      authorized: true,
      tokenExpiresAt: row.token_expires_at,
      scopes: row.scopes,
      hasRefreshToken: !!row.refresh_token,
    };
  }
}

/**
 * Convert a Spotify API track response to the ContentFilter format used
 * by the filtering pipeline and the new songs table schema.
 */
export function toContentFilterTrack(track: SpotifyTrack): ContentFilterTrack {
  const primaryArtist = track.artists[0];
  const bestImage = track.album.images.reduce(
    (best, img) => (img.width > (best?.width || 0) ? img : best),
    track.album.images[0]
  );

  return {
    spotify_uri: track.uri,
    spotify_id: track.id,
    title: track.name,
    artist: track.artists.map(a => a.name).join(', '),
    artist_id: primaryArtist?.id || '',
    album: track.album.name,
    cover_url: bestImage?.url || '',
    duration_ms: track.duration_ms,
    explicit: track.explicit,
  };
}

export function toCatalogSongSearchItem(track: ContentFilterTrack): CatalogSongSearchItem {
  return {
    id: null,
    source_type: 'spotify',
    visibility: 'public',
    asset_role: 'music',
    spotify_uri: track.spotify_uri,
    spotify_id: track.spotify_id,
    title: track.title,
    artist: track.artist,
    artist_id: track.artist_id || null,
    album: track.album || null,
    cover_url: track.cover_url || null,
    duration_ms: track.duration_ms,
    is_explicit: track.explicit,
    is_blocked: false,
    file_url: null,
    play_count: 0,
  };
}

/**
 * Upsert a Spotify track into the local songs table (lazy catalog).
 * Returns the song's UUID from our DB.
 */
export async function upsertSpotifyTrack(track: ContentFilterTrack): Promise<string> {
  const result = await db.query(
    `INSERT INTO songs (
       source_type, visibility, asset_role, spotify_uri, spotify_id, title, artist, artist_id, album, cover_url, duration_ms, is_explicit
     )
     VALUES ('spotify', 'public', 'music', $1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (spotify_uri) DO UPDATE SET
       source_type = 'spotify',
       visibility = 'public',
       asset_role = 'music',
       title = EXCLUDED.title,
       artist = EXCLUDED.artist,
       artist_id = EXCLUDED.artist_id,
       album = EXCLUDED.album,
       cover_url = EXCLUDED.cover_url,
       duration_ms = EXCLUDED.duration_ms,
       is_explicit = EXCLUDED.is_explicit
     RETURNING id`,
    [
      track.spotify_uri,
      track.spotify_id,
      track.title,
      track.artist,
      track.artist_id,
      track.album,
      track.cover_url,
      track.duration_ms,
      track.explicit,
    ]
  );
  return result.rows[0].id;
}

// Singleton instance
export const spotifyService = new SpotifyService();
