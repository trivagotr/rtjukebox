import { createHash, randomBytes } from 'node:crypto';
import { NotFoundError, ServiceUnavailableError, ValidationError } from '../../../core/errors/app-error.js';
import type { Environment } from '../../../core/config/env.js';
import type { SpotifyConfigReader } from './ports/spotify-config.repository.js';
import type { SpotifyOAuthRepository, SpotifyTokenRecord } from './ports/spotify-oauth.repository.js';
import type { Clock } from '../../../core/ports/clock.port.js';
import type { SpotifyOAuthHttpProvider, SpotifyTokenResponse } from './ports/spotify-oauth-http.port.js';

const ACCOUNTS_URL = 'https://accounts.spotify.com';
const REQUIRED_SCOPES = ['streaming', 'user-modify-playback-state', 'user-read-playback-state', 'user-read-currently-playing', 'user-read-email', 'user-read-private', 'playlist-read-private', 'playlist-read-collaborative'].join(' ');
const PLAYBACK_SCOPES = new Set(['streaming', 'user-modify-playback-state', 'user-read-playback-state']);

function hashState(state: string) { return createHash('sha256').update(state).digest('hex'); }
function safeReturnOrigin(value: string | undefined, allowed: string[]) {
  if (!value) return null;
  let origin: string;
  try { origin = new URL(value).origin; } catch { throw new ValidationError('Invalid Spotify return origin'); }
  if (!allowed.includes(origin)) throw new ValidationError('Spotify return origin is not allowed');
  return origin;
}

export class SpotifyOAuthService {
  constructor(
    private readonly config: SpotifyConfigReader,
    private readonly repository: SpotifyOAuthRepository,
    private readonly environment: Environment,
    private readonly clock: Clock,
    private readonly spotifyHttp: SpotifyOAuthHttpProvider,
  ) {}

  async adminConfig() {
    if (!('getAdminConfig' in this.config)) throw new ServiceUnavailableError('Spotify configuration is unavailable');
    return (this.config as SpotifyConfigReader & { getAdminConfig(): Promise<unknown> }).getAdminConfig();
  }

  async saveAdminConfig(input: { clientId: string; clientSecret?: string }) {
    if (!('saveAdminConfig' in this.config)) throw new ServiceUnavailableError('Spotify configuration is unavailable');
    await (this.config as SpotifyConfigReader & { saveAdminConfig(value: typeof input): Promise<void> }).saveAdminConfig(input);
    return this.adminConfig();
  }

  private async credentials() {
    const credentials = await this.config.getCredentials();
    if (!credentials) throw new ServiceUnavailableError('Spotify application credentials are not configured', 'SPOTIFY_NOT_CONFIGURED');
    if (!this.environment.SPOTIFY_REDIRECT_URI) throw new ServiceUnavailableError('SPOTIFY_REDIRECT_URI is not configured', 'SPOTIFY_NOT_CONFIGURED');
    try {
      const redirect = new URL(this.environment.SPOTIFY_REDIRECT_URI);
      if (redirect.protocol !== 'https:' && this.environment.NODE_ENV === 'production') throw new Error('HTTPS is required');
      return { ...credentials, redirectUri: redirect.toString() };
    } catch (error) {
      throw new ServiceUnavailableError('Spotify redirect URI configuration is invalid', 'SPOTIFY_NOT_CONFIGURED', { cause: error });
    }
  }

  private async authorizationUrl(input: { state: string; challenge: string; redirectUri: string }) {
    const credentials = await this.config.getCredentials();
    if (!credentials) throw new ServiceUnavailableError('Spotify application credentials are not configured', 'SPOTIFY_NOT_CONFIGURED');
    const params = new URLSearchParams({
      response_type: 'code', client_id: credentials.clientId, scope: REQUIRED_SCOPES,
      redirect_uri: input.redirectUri, show_dialog: 'true', state: input.state,
      code_challenge_method: 'S256', code_challenge: input.challenge,
    });
    return `${ACCOUNTS_URL}/authorize?${params}`;
  }

  async startAdminAuthorization(adminUserId: string, requestedOrigin?: string) {
    const { redirectUri } = await this.credentials();
    const returnOrigin = safeReturnOrigin(requestedOrigin, this.environment.CORS_ORIGINS);
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(48).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    await this.repository.saveOAuthState({ stateHash: hashState(state), stateKind: 'admin', adminUserId, returnOrigin, codeVerifier: verifier, expiresAt: new Date(this.clock.now().getTime() + 10 * 60_000) });
    return this.authorizationUrl({ state, challenge, redirectUri });
  }

  private deviceRedirectUri(mainRedirectUri: string) {
    const redirect = new URL(mainRedirectUri);
    if (!redirect.pathname.endsWith('/spotify/callback')) throw new ServiceUnavailableError('Spotify callback URI must end with /spotify/callback', 'SPOTIFY_NOT_CONFIGURED');
    redirect.pathname = `${redirect.pathname.slice(0, -'/spotify/callback'.length)}/spotify/device-auth/callback`;
    return redirect.toString();
  }

  async startDeviceAuthorization(deviceId: string, requestedOrigin?: string) {
    if (!await this.repository.deviceExists(deviceId)) throw new NotFoundError('Device not found');
    const { redirectUri: mainRedirectUri } = await this.credentials();
    const redirectUri = this.deviceRedirectUri(mainRedirectUri);
    const returnOrigin = safeReturnOrigin(requestedOrigin, this.environment.CORS_ORIGINS);
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(48).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    await this.repository.saveOAuthState({ stateHash: hashState(state), stateKind: 'device', deviceId, returnOrigin, codeVerifier: verifier, expiresAt: new Date(this.clock.now().getTime() + 10 * 60_000) });
    return { deviceId, authUrl: await this.authorizationUrl({ state, challenge, redirectUri }) };
  }

  private async requestToken(form: URLSearchParams): Promise<SpotifyTokenResponse> {
    const { clientId, clientSecret } = await this.credentials();
    return this.spotifyHttp.requestToken({ clientId, clientSecret, form });
  }

  async completeAdminAuthorization(code: string | undefined, state: string) {
    const consumed = await this.repository.consumeOAuthState(hashState(state), this.clock.now());
    if (!consumed || consumed.stateKind !== 'admin' || !consumed.adminUserId || consumed.adminRole?.toUpperCase() !== 'ADMIN' || consumed.adminIsGuest) {
      throw new ValidationError('Spotify authorization state is invalid, expired, or already used');
    }
    if (!code || !consumed.codeVerifier) throw new ValidationError('Spotify authorization was not completed');
    const { redirectUri } = await this.credentials();
    const token = await this.requestToken(new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: consumed.codeVerifier }));
    if (!token.refresh_token) throw new ServiceUnavailableError('Spotify did not issue a refresh token', 'SPOTIFY_TOKEN_EXCHANGE_FAILED');
    await this.repository.saveGlobalAuth({ userId: consumed.adminUserId, accessToken: token.access_token!, refreshToken: token.refresh_token, expiresAt: new Date(this.clock.now().getTime() + token.expires_in! * 1000), scopes: token.scope ?? REQUIRED_SCOPES });
    return { returnOrigin: consumed.returnOrigin };
  }

  async completeDeviceAuthorization(code: string | undefined, state: string) {
    const consumed = await this.repository.consumeOAuthState(hashState(state), this.clock.now());
    if (!consumed || consumed.stateKind !== 'device' || !consumed.deviceId || !consumed.codeVerifier) throw new ValidationError('Spotify device authorization state is invalid, expired, or already used');
    if (!code) throw new ValidationError('Spotify authorization was not completed');
    if (!await this.repository.deviceExists(consumed.deviceId)) throw new NotFoundError('Device not found');
    const { redirectUri: mainRedirectUri } = await this.credentials();
    const token = await this.requestToken(new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: this.deviceRedirectUri(mainRedirectUri), code_verifier: consumed.codeVerifier }));
    const old = await this.repository.getDeviceAuth(consumed.deviceId);
    const refreshToken = token.refresh_token ?? old?.refreshToken;
    if (!refreshToken) throw new ServiceUnavailableError('Spotify did not issue a refresh token', 'SPOTIFY_TOKEN_EXCHANGE_FAILED');
    const profile = await this.spotifyHttp.getAccountProfile(token.access_token!);
    await this.repository.saveDeviceAuth({
      deviceId: consumed.deviceId, accessToken: token.access_token!, refreshToken,
      expiresAt: new Date(this.clock.now().getTime() + token.expires_in! * 1000), scopes: token.scope ?? REQUIRED_SCOPES,
      spotifyAccountId: profile.id,
      spotifyDisplayName: profile.display_name ?? profile.id,
      spotifyEmail: profile.email ?? null,
      spotifyProduct: profile.product ?? null,
      spotifyCountry: profile.country ?? null,
    });
    return { ...(await this.repository.getDeviceAuthStatus(consumed.deviceId) ?? {}), deviceId: consumed.deviceId, returnOrigin: consumed.returnOrigin };
  }

  async getAdminStatus() {
    const auth = await this.repository.getGlobalAuth();
    return { authorized: Boolean(auth), tokenExpiresAt: auth?.expiresAt ?? null, scopes: auth?.scopes ?? null, hasRefreshToken: Boolean(auth?.refreshToken) };
  }

  async getDeviceAuthStatus(deviceId: string) { return this.repository.getDeviceAuthStatus(deviceId); }

  async deleteDeviceAuth(deviceId: string) {
    if (!await this.repository.deleteDeviceAuth(deviceId)) throw new NotFoundError('Spotify device authorization not found');
  }

  private async refreshToken(record: SpotifyTokenRecord, deviceId?: string) {
    const token = await this.requestToken(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: record.refreshToken }));
    const next = {
      accessToken: token.access_token!, refreshToken: token.refresh_token ?? record.refreshToken,
      expiresAt: new Date(this.clock.now().getTime() + token.expires_in! * 1000), scopes: token.scope ?? record.scopes,
    };
    if (deviceId) {
      const current = await this.repository.getDeviceAuth(deviceId);
      if (!current) throw new NotFoundError('Spotify device authorization not found');
      await this.repository.saveDeviceAuth({ ...current, ...next, deviceId });
    } else await this.repository.saveGlobalAuth({ ...record, ...next });
    return next.accessToken;
  }

  async getPlaybackToken(deviceId: string) {
    const record = await this.repository.getDeviceAuth(deviceId);
    if (!record) throw new ServiceUnavailableError('Spotify authorization is required for this kiosk', 'SPOTIFY_AUTH_REQUIRED');
    const scopes = new Set(record.scopes.split(/\s+/));
    if ([...PLAYBACK_SCOPES].some((scope) => !scopes.has(scope))) throw new ServiceUnavailableError('Spotify playback permissions are missing', 'SPOTIFY_SCOPE_REQUIRED');
    const expired = record.expiresAt.getTime() <= this.clock.now().getTime() + 60_000;
    const accessToken = expired ? await this.refreshToken(record, deviceId) : record.accessToken;
    const current = expired ? await this.repository.getDeviceAuth(deviceId) : record;
    const expiresAt = current?.expiresAt ?? record.expiresAt;
    return { accessToken, expiresAt, expiresIn: Math.max(0, Math.floor((expiresAt.getTime() - this.clock.now().getTime()) / 1000)), scopes: current?.scopes ?? record.scopes };
  }

  async getPlaybackState(deviceId: string) {
    const { accessToken } = await this.getPlaybackToken(deviceId);
    return this.spotifyHttp.getPlaybackState(accessToken);
  }

  async playTrack(deviceId: string, trackUri: string) {
    if (!/^spotify:track:[A-Za-z0-9]{22}$/.test(trackUri)) throw new ValidationError('Invalid Spotify track reference');
    const target = await this.repository.getPlaybackTarget(deviceId);
    if (!target?.isActive || !target.targetId) throw new ServiceUnavailableError('A Spotify playback target is not configured for this kiosk', 'SPOTIFY_DEVICE_REQUIRED');
    const { accessToken } = await this.getPlaybackToken(deviceId);
    await this.spotifyHttp.playTrack({ accessToken, targetDeviceId: target.targetId, trackUri });
  }

  async pausePlayback(deviceId: string) {
    const target = await this.repository.getPlaybackTarget(deviceId);
    if (!target?.isActive || !target.targetId) throw new ServiceUnavailableError('A Spotify playback target is not configured for this kiosk', 'SPOTIFY_DEVICE_REQUIRED');
    const { accessToken } = await this.getPlaybackToken(deviceId);
    await this.spotifyHttp.pausePlayback({ accessToken, targetDeviceId: target.targetId });
  }

  async playbackDevices(deviceId?: string) {
    const tokens = new Set<string>();
    if (deviceId) {
      try { tokens.add((await this.getPlaybackToken(deviceId)).accessToken); } catch { return []; }
    } else {
      const auth = await this.repository.getGlobalAuth();
      if (auth) {
        try { tokens.add(auth.expiresAt.getTime() <= this.clock.now().getTime() + 60_000 ? await this.refreshToken(auth) : auth.accessToken); } catch { /* Continue with authorized kiosk accounts. */ }
      }
      for (const id of await this.repository.listDeviceAuthIds()) {
        try { tokens.add((await this.getPlaybackToken(id)).accessToken); } catch { /* One disconnected kiosk must not hide other devices. */ }
      }
    }
    const result = new Map<string, { id: string; name: string; is_active: boolean; type: string; volume_percent: number | null }>();
    for (const token of tokens) {
      try {
        for (const device of await this.spotifyHttp.listPlaybackDevices(token)) result.set(device.id, device);
      } catch { /* Ignore tokens that lack playback-device permissions. */ }
    }
    return [...result.values()];
  }
}
