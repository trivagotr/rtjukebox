import type { SpotifyConfigReader } from '../ports/spotify-config.repository.js';
import type { SpotifyCatalogProvider, SpotifyTrack } from '../ports/spotify-catalog.port.js';

const ACCOUNTS_API = 'https://accounts.spotify.com/api';
const SPOTIFY_API = 'https://api.spotify.com/v1';
const TOKEN_REFRESH_SKEW_MS = 30_000;

interface TokenCache { key: string; token: string; expiresAt: number }
interface ApiTrack {
  id: string;
  uri: string;
  name: string;
  duration_ms: number;
  explicit: boolean;
  popularity: number;
  artists: Array<{ id: string; name: string }>;
  album: { name: string; images?: Array<{ url: string; width?: number | null }> };
}

function mapTrack(track: ApiTrack): SpotifyTrack {
  const image = [...(track.album.images ?? [])].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
  return {
    spotify_uri: track.uri,
    spotify_id: track.id,
    title: track.name,
    artist: track.artists.map((artist) => artist.name).join(', '),
    artist_id: track.artists[0]?.id ?? '',
    album: track.album.name,
    cover_url: image?.url ?? '',
    duration_ms: track.duration_ms,
    explicit: track.explicit,
    popularity: track.popularity,
  };
}

export class SpotifyWebApiAdapter implements SpotifyCatalogProvider {
  private tokenCache: TokenCache | null = null;

  constructor(private readonly config: SpotifyConfigReader) {}

  private async getClientToken() {
    const credentials = await this.config.getCredentials();
    if (!credentials) throw new Error('Spotify application credentials are not configured');
    const cacheKey = `${credentials.clientId}:${credentials.clientSecret}`;
    if (this.tokenCache?.key === cacheKey && this.tokenCache.expiresAt > Date.now() + TOKEN_REFRESH_SKEW_MS) {
      return this.tokenCache.token;
    }
    const response = await fetch(`${ACCOUNTS_API}/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Spotify token service returned ${response.status}`);
    const token = await response.json() as { access_token?: string; expires_in?: number };
    if (!token.access_token || !Number.isFinite(token.expires_in)) throw new Error('Spotify token response is invalid');
    this.tokenCache = { key: cacheKey, token: token.access_token, expiresAt: Date.now() + token.expires_in! * 1000 };
    return token.access_token;
  }

  async searchTracks(query: string, market = 'TR', limit = 20) {
    const token = await this.getClientToken();
    const url = new URL(`${SPOTIFY_API}/search`);
    url.search = new URLSearchParams({ q: query, type: 'track', market, limit: String(Math.min(10, Math.max(1, limit))) }).toString();
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Spotify search returned ${response.status}`);
    const payload = await response.json() as { tracks?: { items?: ApiTrack[] } };
    return (payload.tracks?.items ?? []).map(mapTrack);
  }

  async getTrackByUri(spotifyUri: string, market = 'TR') {
    const match = /^spotify:track:([A-Za-z0-9]{22})$/.exec(spotifyUri.trim());
    if (!match?.[1]) throw new Error('Invalid Spotify track URI');
    const token = await this.getClientToken();
    const url = new URL(`${SPOTIFY_API}/tracks/${match[1]}`);
    url.searchParams.set('market', market);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Spotify track lookup returned ${response.status}`);
    return mapTrack(await response.json() as ApiTrack);
  }

  async getPlaylistPreview(playlistUriOrUrl: string, market = 'TR') {
    const match = /^(?:spotify:playlist:|https:\/\/open\.spotify\.com\/playlist\/)([A-Za-z0-9]{22})(?:\?.*)?$/.exec(playlistUriOrUrl.trim());
    if (!match?.[1]) throw new Error('Invalid Spotify playlist URI or URL');
    const token = await this.getClientToken();
    const url = new URL(`${SPOTIFY_API}/playlists/${match[1]}`);
    url.search = new URLSearchParams({ market, fields: 'id,name,description,images,owner(display_name),tracks.total' }).toString();
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Spotify playlist lookup returned ${response.status}`);
    const data = await response.json() as { id: string; name?: string; description?: string; images?: Array<{ url: string }>; owner?: { display_name?: string }; tracks?: { total?: number } };
    if (!data.id || !data.name) throw new Error('Spotify playlist response is invalid');
    return { id: data.id, uri: `spotify:playlist:${data.id}`, name: data.name, description: data.description ?? '', cover_url: data.images?.[0]?.url ?? null, owner_name: data.owner?.display_name ?? 'Spotify', total_tracks: Number(data.tracks?.total ?? 0) };
  }

  async getPlaylistTracks(playlistUriOrUrl: string, market = 'TR', limit = 100) {
    const match = /^(?:spotify:playlist:|https:\/\/open\.spotify\.com\/playlist\/)([A-Za-z0-9]{22})(?:\?.*)?$/.exec(playlistUriOrUrl.trim());
    if (!match?.[1]) throw new Error('Invalid Spotify playlist URI or URL');
    const token = await this.getClientToken();
    const url = new URL(`${SPOTIFY_API}/playlists/${match[1]}/tracks`);
    url.search = new URLSearchParams({ market, limit: String(Math.min(100, Math.max(1, limit))), fields: 'items(track(id,uri,name,duration_ms,explicit,popularity,artists(id,name),album(name,images)))' }).toString();
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Spotify playlist tracks returned ${response.status}`);
    const payload = await response.json() as { items?: Array<{ track?: ApiTrack | null }> };
    return (payload.items ?? []).flatMap(({ track }) => track?.uri?.startsWith('spotify:track:') && track.id ? [mapTrack(track)] : []);
  }
}
