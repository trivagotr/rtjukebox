import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Environment } from '../../../core/config/env.js';
import type { SpotifyConfigReader, SpotifyCredentials } from './ports/spotify-config.repository.js';
import type { SpotifyOAuthRepository, SpotifyOAuthStateInput, SpotifyOAuthStateRecord } from './ports/spotify-oauth.repository.js';
import { SpotifyOAuthService } from './spotify-oauth.service.js';
import { systemClock } from '../../../core/infra/system-clock.js';
import { SpotifyOAuthHttpAdapter } from './infra/spotify-oauth-http.adapter.js';

const environment = {
  NODE_ENV: 'test', SPOTIFY_REDIRECT_URI: 'https://radiotedu.com/jukebox/api/v1/spotify/callback',
  CORS_ORIGINS: ['https://admin.radiotedu.com'], SPOTIFY_ENCRYPTION_KEY: 'k'.repeat(64),
} as Environment;

function makeFixture() {
  const credentials: SpotifyCredentials = { clientId: 'client-id', clientSecret: 'client-secret' };
  const config = { getCredentials: vi.fn(async () => credentials) } as unknown as SpotifyConfigReader;
  let savedState: SpotifyOAuthStateInput | null = null;
  let consumed = false;
  const saveGlobalAuth = vi.fn(async () => undefined);
  const repository = {
    saveOAuthState: vi.fn(async (input: SpotifyOAuthStateInput) => { savedState = input; }),
    consumeOAuthState: vi.fn(async (hash: string): Promise<SpotifyOAuthStateRecord | null> => {
      if (!savedState || consumed) return null;
      const expected = await import('node:crypto').then(({ createHash }) => createHash('sha256').update(new URLSearchParams(startedUrl.search).get('state') ?? '').digest('hex'));
      if (hash !== expected) return null;
      consumed = true;
      return { stateKind: 'admin', adminUserId: 'admin-uuid', adminRole: 'ADMIN', adminIsGuest: false, deviceId: null, returnOrigin: savedState.returnOrigin ?? null, codeVerifier: savedState.codeVerifier };
    }),
    deviceExists: vi.fn(async () => true),
    saveGlobalAuth,
    getGlobalAuth: vi.fn(async () => null),
    saveDeviceAuth: vi.fn(async () => undefined),
    getDeviceAuth: vi.fn(async () => null),
    getDeviceAuthStatus: vi.fn(async () => null),
    listDeviceAuthIds: vi.fn(async () => []),
    deleteDeviceAuth: vi.fn(async () => true),
  } as unknown as SpotifyOAuthRepository;
  let startedUrl = new URL('https://accounts.spotify.com/authorize');
  const service = new SpotifyOAuthService(config, repository, environment, systemClock, new SpotifyOAuthHttpAdapter());
  return { service, repository, saveGlobalAuth, get state() { return savedState; }, setStartedUrl(url: string) { startedUrl = new URL(url); } };
}

describe('Spotify OAuth service', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('creates a short-lived, user-bound PKCE state and fixed callback URL', async () => {
    const fixture = makeFixture();
    const url = await fixture.service.startAdminAuthorization('admin-uuid', 'https://admin.radiotedu.com/dashboard');
    fixture.setStartedUrl(url);
    const parsed = new URL(url);
    expect(parsed.origin).toBe('https://accounts.spotify.com');
    expect(parsed.searchParams.get('redirect_uri')).toBe(environment.SPOTIFY_REDIRECT_URI);
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
    expect(parsed.searchParams.get('state')).toHaveLength(43);
    expect(fixture.state?.adminUserId).toBe('admin-uuid');
    expect(fixture.state?.stateKind).toBe('admin');
    expect(fixture.state?.expiresAt.getTime()).toBeGreaterThan(Date.now() + 9 * 60_000);
    expect(fixture.state?.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 10 * 60_000);
    expect(fixture.state?.returnOrigin).toBe('https://admin.radiotedu.com');
  });

  it('rejects a return origin outside the configured allowlist', async () => {
    const fixture = makeFixture();
    await expect(fixture.service.startAdminAuthorization('admin-uuid', 'https://attacker.example')).rejects.toThrow('not allowed');
    expect(fixture.repository.saveOAuthState).not.toHaveBeenCalled();
  });

  it('consumes state once, verifies its admin binding, and stores the token response server-side', async () => {
    const fixture = makeFixture();
    const url = await fixture.service.startAdminAuthorization('admin-uuid');
    fixture.setStartedUrl(url);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ access_token: 'short-lived', refresh_token: 'long-lived', expires_in: 3600, scope: 'user-read-playback-state' }), { status: 200, headers: { 'content-type': 'application/json' } })));
    const state = new URL(url).searchParams.get('state')!;
    const result = await fixture.service.completeAdminAuthorization('authorization-code', state);
    expect(result.returnOrigin).toBeNull();
    expect(fixture.saveGlobalAuth).toHaveBeenCalledWith(expect.objectContaining({ userId: 'admin-uuid', accessToken: 'short-lived', refreshToken: 'long-lived', scopes: 'user-read-playback-state' }));
    await expect(fixture.service.completeAdminAuthorization('authorization-code', state)).rejects.toThrow('invalid, expired, or already used');
  });
});
