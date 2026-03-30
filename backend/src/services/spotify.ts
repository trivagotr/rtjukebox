import axios from 'axios';
import { db } from '../db';

const SPOTIFY_ACCOUNTS_URL = 'https://accounts.spotify.com';
const SPOTIFY_API_URL = 'https://api.spotify.com/v1';

const REQUIRED_SCOPES = [
  'streaming',
  'user-modify-playback-state',
  'user-read-playback-state',
  'user-read-currently-playing',
].join(' ');

// In-memory cache for Client Credentials token (no user login needed)
let clientToken: { token: string; expiresAt: number } | null = null;

interface SpotifyTokenRow {
  id: string;
  user_id: string | null;
  access_token: string;
  refresh_token: string;
  token_expires_at: Date;
  scopes: string;
}

interface SpotifyTrack {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album: { id: string; name: string; images: { url: string; width: number; height: number }[] };
  duration_ms: number;
  uri: string;
  preview_url: string | null;
  external_urls: { spotify: string };
}

interface SpotifySearchResult {
  tracks: SpotifyTrack[];
  total: number;
}

export class SpotifyService {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor() {
    this.clientId = process.env.SPOTIFY_CLIENT_ID || '';
    this.clientSecret = process.env.SPOTIFY_CLIENT_SECRET || '';
    this.redirectUri = process.env.SPOTIFY_REDIRECT_URI || '';

    if (!this.clientId || !this.clientSecret) {
      console.warn('[SpotifyService] SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET not set');
    }
  }

  // ─── Client Credentials Flow (for search, no user auth needed) ───

  async getClientToken(): Promise<string> {
    // Return cached token if still valid (with 60s buffer)
    if (clientToken && clientToken.expiresAt > Date.now() + 60_000) {
      return clientToken.token;
    }

    const params = new URLSearchParams({ grant_type: 'client_credentials' });
    const authHeader = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    const response = await axios.post(`${SPOTIFY_ACCOUNTS_URL}/api/token`, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${authHeader}`,
      },
    });

    clientToken = {
      token: response.data.access_token,
      expiresAt: Date.now() + response.data.expires_in * 1000,
    };

    console.log('[SpotifyService] Client credentials token obtained');
    return clientToken.token;
  }

  // ─── Authorization Code Flow (for playback control, requires admin auth) ───

  getAuthUrl(state?: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      scope: REQUIRED_SCOPES,
      redirect_uri: this.redirectUri,
      show_dialog: 'true',
    });

    if (state) {
      params.set('state', state);
    }

    return `${SPOTIFY_ACCOUNTS_URL}/authorize?${params.toString()}`;
  }

  async handleCallback(code: string, userId?: string): Promise<void> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
    });

    const authHeader = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

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

    const authHeader = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

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

  // ─── Search ───

  async searchTracks(query: string, market = 'TR', limit = 20): Promise<SpotifySearchResult> {
    const token = await this.getClientToken();

    const response = await axios.get(`${SPOTIFY_API_URL}/search`, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        q: query,
        type: 'track',
        market,
        limit,
      },
    });

    const items = response.data.tracks.items.map((track: any) => ({
      id: track.id,
      name: track.name,
      artists: track.artists.map((a: any) => ({ id: a.id, name: a.name })),
      album: {
        id: track.album.id,
        name: track.album.name,
        images: track.album.images,
      },
      duration_ms: track.duration_ms,
      uri: track.uri,
      preview_url: track.preview_url,
      external_urls: track.external_urls,
    }));

    return {
      tracks: items,
      total: response.data.tracks.total,
    };
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

// Singleton instance
export const spotifyService = new SpotifyService();
