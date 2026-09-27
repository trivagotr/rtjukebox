import { ServiceUnavailableError } from '../../../../core/errors/app-error.js';
import type { PlaybackDevice, PlaybackState } from '../ports/playback-provider.port.js';
import type { SpotifyAccountProfile, SpotifyOAuthHttpProvider, SpotifyTokenResponse } from '../ports/spotify-oauth-http.port.js';

const ACCOUNTS_URL = 'https://accounts.spotify.com';
const API_URL = 'https://api.spotify.com/v1';

export class SpotifyOAuthHttpAdapter implements SpotifyOAuthHttpProvider {
  async requestToken(input: { clientId: string; clientSecret: string; form: URLSearchParams }): Promise<SpotifyTokenResponse> {
    const response = await fetch(`${ACCOUNTS_URL}/api/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${input.clientId}:${input.clientSecret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: input.form,
      signal: AbortSignal.timeout(10_000),
    });
    const payload = await response.json().catch(() => ({})) as SpotifyTokenResponse;
    if (!response.ok || !payload.access_token || !Number.isFinite(payload.expires_in)) {
      throw new ServiceUnavailableError('Spotify token exchange failed', 'SPOTIFY_TOKEN_EXCHANGE_FAILED', { cause: new Error(`Spotify returned ${response.status}`) });
    }
    return payload;
  }

  private async getJson(url: string, accessToken: string) {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new ServiceUnavailableError('Spotify API request failed', 'SPOTIFY_API_FAILED', { cause: new Error(`Spotify returned ${response.status}`) });
    return response.json() as Promise<Record<string, unknown>>;
  }

  async getAccountProfile(accessToken: string): Promise<SpotifyAccountProfile> {
    const data = await this.getJson(`${API_URL}/me`, accessToken);
    if (typeof data.id !== 'string') throw new ServiceUnavailableError('Spotify profile response is invalid', 'SPOTIFY_API_FAILED');
    return {
      id: data.id,
      display_name: typeof data.display_name === 'string' ? data.display_name : undefined,
      email: typeof data.email === 'string' ? data.email : undefined,
      product: typeof data.product === 'string' ? data.product : undefined,
      country: typeof data.country === 'string' ? data.country : undefined,
    };
  }

  async getPlaybackState(accessToken: string): Promise<PlaybackState | null> {
    const response = await fetch(`${API_URL}/me/player`, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(8_000) });
    if (response.status === 204 || response.status === 404) return null;
    if (!response.ok) throw new ServiceUnavailableError('Spotify playback state is unavailable', 'SPOTIFY_API_FAILED', { cause: new Error(`Spotify returned ${response.status}`) });
    const data = await response.json() as { device?: { id?: string }; is_playing?: boolean; progress_ms?: number; item?: { uri?: string; name?: string; duration_ms?: number; artists?: Array<{ name?: string }> } };
    return {
      deviceId: data.device?.id ?? null, isPlaying: Boolean(data.is_playing),
      progressMs: typeof data.progress_ms === 'number' ? data.progress_ms : null,
      durationMs: typeof data.item?.duration_ms === 'number' ? data.item.duration_ms : null,
      itemUri: data.item?.uri ?? null, trackName: data.item?.name ?? null,
      artistName: data.item?.artists?.[0]?.name ?? null,
    };
  }

  async playTrack(input: { accessToken: string; targetDeviceId: string; trackUri: string }) {
    const url = new URL(`${API_URL}/me/player/play`);
    url.searchParams.set('device_id', input.targetDeviceId);
    const response = await fetch(url, {
      method: 'PUT', headers: { Authorization: `Bearer ${input.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: [input.trackUri] }), signal: AbortSignal.timeout(10_000),
    });
    if (response.status !== 204 && !response.ok) throw new ServiceUnavailableError('Spotify playback could not be started', 'SPOTIFY_API_FAILED', { cause: new Error(`Spotify returned ${response.status}`) });
  }

  async pausePlayback(input: { accessToken: string; targetDeviceId: string }) {
    const url = new URL(`${API_URL}/me/player/pause`);
    url.searchParams.set('device_id', input.targetDeviceId);
    const response = await fetch(url, { method: 'PUT', headers: { Authorization: `Bearer ${input.accessToken}` }, signal: AbortSignal.timeout(10_000) });
    if (response.status !== 204 && !response.ok) throw new ServiceUnavailableError('Spotify playback could not be paused', 'SPOTIFY_API_FAILED', { cause: new Error(`Spotify returned ${response.status}`) });
  }

  async listPlaybackDevices(accessToken: string): Promise<PlaybackDevice[]> {
    const data = await this.getJson(`${API_URL}/me/player/devices`, accessToken);
    return (Array.isArray(data.devices) ? data.devices : []).flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const row = item as Record<string, unknown>;
      if (typeof row.id !== 'string') return [];
      return [{ id: row.id, name: typeof row.name === 'string' ? row.name : 'Spotify Connect', is_active: Boolean(row.is_active), type: typeof row.type === 'string' ? row.type : 'Speaker', volume_percent: typeof row.volume_percent === 'number' ? row.volume_percent : null }];
    });
  }
}
