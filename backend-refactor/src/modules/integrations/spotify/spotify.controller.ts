import { randomBytes } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import { ForbiddenError, ValidationError } from '../../../core/errors/app-error.js';
import { createOptionalAuth } from '../../../core/auth/auth.middleware.js';
import type { Environment } from '../../../core/config/env.js';
import type { DevicesService } from '../../devices/devices.service.js';
import type { JukeboxService } from '../../jukebox/jukebox.service.js';
import type { LyricsProvider } from './ports/lyrics-provider.port.js';
import type { SpotifyOAuthService } from './spotify-oauth.service.js';
import type { PlaybackProvider } from './ports/playback-provider.port.js';
import { z } from 'zod';

const callbackQuerySchema = z.object({ code: z.string().trim().min(1).max(4096).optional(), error: z.string().trim().max(256).optional(), state: z.string().trim().min(1).max(128) }).strict();
const returnOriginQuerySchema = z.object({ return_origin: z.string().trim().min(1).max(2048).optional() }).strict();
const deviceIdParamsSchema = z.object({ deviceId: z.string().uuid() }).strict();
const deviceStatusQuerySchema = z.object({ device_id: z.string().uuid() }).strict();
const playbackDevicesQuerySchema = z.object({ kiosk_device_id: z.string().uuid().optional() }).strict();
const appConfigSchema = z.object({ client_id: z.string().trim().min(1).max(128), client_secret: z.string().trim().max(512).optional() }).strict();
const kioskDeviceBodySchema = z.object({ device_id: z.string().uuid(), device_pwd: z.string().trim().min(1).max(256).optional(), return_origin: z.string().trim().max(2048).optional() }).strict();
const kioskDeviceStatusBodySchema = z.object({ device_id: z.string().uuid(), device_pwd: z.string().trim().min(1).max(256).optional() }).strict();
const kioskRegistrationSchema = z.object({ device_id: z.string().uuid(), device_pwd: z.string().trim().min(1).max(256).optional(), spotify_device_id: z.string().trim().max(255).nullable().optional(), player_name: z.string().trim().max(160).nullable().optional(), is_active: z.boolean().optional() }).strict();
const lyricsQuerySchema = z.object({ title: z.string().trim().min(1).max(500), artist: z.string().trim().min(1).max(500), duration: z.coerce.number().finite().positive().max(86_400).optional() }).strict();
const emptyRequestSchema = z.object({}).strict();
function emptyBodyAndQuery(req: Request) { return emptyRequestSchema.safeParse(req.body ?? {}).success && emptyRequestSchema.safeParse(req.query).success; }

function callbackPage(input: { title: string; text: string; message?: Record<string, unknown>; returnOrigin?: string | null }) {
  const nonce = randomBytes(18).toString('base64url');
  const target = input.returnOrigin ? JSON.stringify(input.returnOrigin) : 'null';
  const message = input.message ? JSON.stringify(input.message).replaceAll('<', '\\u003c') : 'null';
  const script = input.returnOrigin && input.message
    ? `if (window.opener) { window.opener.postMessage(${message}, ${target}); setTimeout(() => window.close(), 1500); }`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${input.title}</title></head><body><main><h1>${input.title}</h1><p>${input.text}</p></main><script nonce="${nonce}">${script}</script></body></html>`;
}

function errorPage() { return callbackPage({ title: 'Spotify bağlantısı tamamlanamadı', text: 'Yetkilendirme geçersiz veya süresi dolmuş olabilir. Pencereyi kapatıp yeniden deneyin.' }); }

export function createSpotifyController(service: SpotifyOAuthService, playback: PlaybackProvider, jukebox: JukeboxService, devices: DevicesService, lyrics: LyricsProvider, environment: Environment) {
  const adminStart: RequestHandler = async (req, res, next) => {
    const query = returnOriginQuerySchema.safeParse(req.query);
    if (!query.success || !emptyRequestSchema.safeParse(req.body ?? {}).success) return next(new ValidationError('Invalid Spotify authorization request'));
    if (!req.user) return next(new ForbiddenError('Administrator authentication required'));
    try { return res.redirect(303, await service.startAdminAuthorization(req.user.userId, query.data.return_origin)); } catch (error) { return next(error); }
  };

  const adminCallback: RequestHandler = async (req, res) => {
    const query = callbackQuerySchema.safeParse(req.query);
    if (!query.success || !emptyRequestSchema.safeParse(req.body ?? {}).success) return res.status(400).type('html').send(errorPage());
    try {
      const result = await service.completeAdminAuthorization(query.data.error ? undefined : query.data.code, query.data.state);
      const page = callbackPage({ title: 'Spotify bağlandı', text: 'Spotify hesabı başarıyla yetkilendirildi.', returnOrigin: result.returnOrigin, message: { type: 'SPOTIFY_AUTH_SUCCESS' } });
      res.setHeader('Content-Security-Policy', `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${/nonce="([^"]+)/.exec(page)?.[1] ?? ''}`);
      return res.type('html').send(page);
    } catch { return res.status(400).type('html').send(errorPage()); }
  };

  const deviceCallback: RequestHandler = async (req, res) => {
    const query = callbackQuerySchema.safeParse(req.query);
    if (!query.success || !emptyRequestSchema.safeParse(req.body ?? {}).success) return res.status(400).type('html').send(errorPage());
    try {
      const result = await service.completeDeviceAuthorization(query.data.error ? undefined : query.data.code, query.data.state);
      const page = callbackPage({
        title: 'Spotify cihazı bağlandı', text: 'Spotify hesabı kioska bağlandı.', returnOrigin: result.returnOrigin as string | null,
        message: { type: 'SPOTIFY_DEVICE_AUTH_SUCCESS', deviceId: result.deviceId },
      });
      const nonce = /nonce="([^"]+)/.exec(page)?.[1] ?? '';
      res.setHeader('Content-Security-Policy', `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'`);
      return res.type('html').send(page);
    } catch { return res.status(400).type('html').send(errorPage()); }
  };

  const status: RequestHandler = async (req, res, next) => { if (!emptyBodyAndQuery(req)) return next(new ValidationError('Unexpected Spotify status input')); try { return res.json({ success: true, data: await service.getAdminStatus() }); } catch (error) { return next(error); } };
  const appConfigGet: RequestHandler = async (req, res, next) => { if (!emptyBodyAndQuery(req)) return next(new ValidationError('Unexpected Spotify configuration input')); try { return res.json({ success: true, data: await service.adminConfig(), message: 'Spotify app config fetched' }); } catch (error) { return next(error); } };
  const appConfigPut: RequestHandler = async (req, res, next) => {
    const body = appConfigSchema.safeParse(req.body);
    if (!body.success || !emptyRequestSchema.safeParse(req.query).success) return next(new ValidationError('Invalid Spotify app config payload'));
    try { return res.json({ success: true, data: await service.saveAdminConfig({ clientId: body.data.client_id, ...(body.data.client_secret ? { clientSecret: body.data.client_secret } : {}) }), message: 'Spotify app config updated' }); } catch (error) { return next(error); }
  };
  const adminDeviceAuthStart: RequestHandler = async (req, res, next) => {
    const body = z.object({ device_id: z.string().uuid(), return_origin: z.string().trim().max(2048).optional() }).strict().safeParse(req.body);
    if (!body.success || Object.keys(req.query).length) return next(new ValidationError('Invalid Spotify device authorization request'));
    try { return res.json({ success: true, data: await service.startDeviceAuthorization(body.data.device_id, body.data.return_origin), message: 'Spotify device authorization started' }); } catch (error) { return next(error); }
  };
  const deviceStatus: RequestHandler = async (req, res, next) => {
    const query = deviceStatusQuerySchema.safeParse(req.query);
    if (!query.success || !emptyRequestSchema.safeParse(req.body ?? {}).success) return next(new ValidationError('Invalid Spotify device ID'));
    try { return res.json({ success: true, data: await service.getDeviceAuthStatus(query.data.device_id) }); } catch (error) { return next(error); }
  };
  const deviceDelete: RequestHandler = async (req, res, next) => {
    const params = deviceIdParamsSchema.safeParse(req.params);
    if (!params.success || Object.keys(req.query).length || Object.keys(req.body ?? {}).length) return next(new ValidationError('Invalid Spotify device ID'));
    try { await service.deleteDeviceAuth(params.data.deviceId); return res.json({ success: true, data: { deviceId: params.data.deviceId } }); } catch (error) { return next(error); }
  };
  const playbackDevices: RequestHandler = async (req, res, next) => {
    const query = playbackDevicesQuerySchema.safeParse(req.query);
    if (!query.success || !emptyRequestSchema.safeParse(req.body ?? {}).success) return next(new ValidationError('Invalid playback-device query'));
    try { return res.json({ success: true, data: { devices: await playback.listDevices(query.data.kiosk_device_id) }, message: 'Spotify devices fetched' }); } catch (error) { return next(error); }
  };

  const kioskStatus: RequestHandler = async (req, res, next) => {
    const body = kioskDeviceStatusBodySchema.safeParse(req.body);
    const credential = req.get('x-kiosk-credential')?.trim() || body.data?.device_pwd;
    if (!body.success || !credential || Object.keys(req.query).length) return next(new ValidationError('Invalid Spotify device-auth status request'));
    try {
      if (!await jukebox.canReadQueue({ deviceId: body.data.device_id, isAdmin: false, kioskCredential: credential })) return next(new ForbiddenError('Invalid kiosk credential'));
      return res.json({ success: true, data: await service.getDeviceAuthStatus(body.data.device_id) });
    } catch (error) { return next(error); }
  };
  const kioskStart: RequestHandler = async (req, res, next) => {
    const body = kioskDeviceBodySchema.safeParse(req.body);
    const credential = req.get('x-kiosk-credential')?.trim() || body.data?.device_pwd;
    if (!body.success || !credential || Object.keys(req.query).length) return next(new ValidationError('Invalid Spotify device-auth request'));
    try {
      if (!await jukebox.canReadQueue({ deviceId: body.data.device_id, isAdmin: false, kioskCredential: credential })) return next(new ForbiddenError('Invalid kiosk credential'));
      return res.json({ success: true, data: await service.startDeviceAuthorization(body.data.device_id, body.data.return_origin), message: 'Spotify device auth URL fetched' });
    } catch (error) { return next(error); }
  };
  const kioskToken: RequestHandler = async (req, res, next) => {
    const body = kioskDeviceStatusBodySchema.safeParse(req.body);
    const credential = req.get('x-kiosk-credential')?.trim() || body.data?.device_pwd;
    if (!body.success || !credential || Object.keys(req.query).length) return next(new ValidationError('Invalid Spotify token request'));
    try {
      if (!await jukebox.canReadQueue({ deviceId: body.data.device_id, isAdmin: false, kioskCredential: credential })) return next(new ForbiddenError('Invalid kiosk credential'));
      const token = await service.getPlaybackToken(body.data.device_id);
      return res.json({ success: true, data: {
        device_id: body.data.device_id,
        access_token: token.accessToken,
        token_expires_at: token.expiresAt.toISOString(),
        expires_in: Math.min(token.expiresIn, 3600),
        scopes: token.scopes,
      }, message: 'Spotify kiosk token ready' });
    } catch (error) { return next(error); }
  };
  const kioskRegister: RequestHandler = async (req, res, next) => {
    const body = kioskRegistrationSchema.safeParse(req.body);
    const credential = req.get('x-kiosk-credential')?.trim() || body.data?.device_pwd;
    if (!body.success || !credential || Object.keys(req.query).length) return next(new ValidationError('Invalid Spotify playback-device registration'));
    try {
      if (!await jukebox.canReadQueue({ deviceId: body.data.device_id, isAdmin: false, kioskCredential: credential })) return next(new ForbiddenError('Invalid kiosk credential'));
      const active = body.data.is_active ?? true;
      const device = await devices.updateSpotifyPlaybackTarget(body.data.device_id, {
        spotify_playback_device_id: active ? body.data.spotify_device_id ?? null : null,
        spotify_player_name: active ? body.data.player_name ?? null : null,
      });
      return res.json({ success: true, data: { device }, message: 'Spotify playback device registered' });
    } catch (error) { return next(error); }
  };
  const playbackState: RequestHandler = async (req, res, next) => {
    const params = deviceIdParamsSchema.safeParse(req.params);
    if (!params.success || !emptyRequestSchema.safeParse(req.query).success || !emptyRequestSchema.safeParse(req.body ?? {}).success) return next(new ValidationError('Invalid playback-state request'));
    const principal = req.user;
    const credential = req.get('x-kiosk-credential')?.trim();
    try {
      if (!await jukebox.canReadQueue({ deviceId: params.data.deviceId, userId: principal?.userId, isAdmin: principal?.roles.includes('ADMIN') ?? false, kioskCredential: credential })) return next(new ForbiddenError('An active device session is required'));
      return res.json({ success: true, data: await playback.getState(params.data.deviceId), message: 'Playback state fetched' });
    } catch (error) { return next(error); }
  };
  const getLyrics: RequestHandler = async (req, res, next) => {
    const query = lyricsQuerySchema.safeParse(req.query);
    if (!query.success || !emptyRequestSchema.safeParse(req.body ?? {}).success) return next(new ValidationError('Invalid lyrics query'));
    try { return res.json({ success: true, data: await lyrics.getLyrics({ title: query.data.title, artist: query.data.artist }), message: 'Lyrics fetched' }); } catch (error) { return next(error); }
  };

  const authOptional = createOptionalAuth(environment.JWT_SECRET, environment.JWT_ISSUER, environment.JWT_AUDIENCE, environment.JWT_ALLOW_LEGACY_TOKENS);
  return {
    adminStart, adminCallback, deviceCallback, status, appConfigGet, appConfigPut, adminDeviceAuthStart, deviceStatus, deviceDelete,
    playbackDevices, kioskStatus, kioskStart, kioskToken, kioskRegister, playbackState, authOptional, lyrics: getLyrics,
  };
}
