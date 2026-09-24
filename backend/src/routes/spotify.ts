import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { db } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { rbacMiddleware } from '../middleware/rbac';
import { sendSuccess, sendError } from '../utils/response';
import { deriveSpotifyDeviceAuthRedirectUri, normalizeSpotifyReturnOrigin, spotifyService, type SpotifyAppConfig } from '../services/spotify';
import { adminAuditLog } from '../middleware/adminAudit';
import { adminRateLimit } from '../middleware/rateLimits';
import { z } from 'zod';

const spotifyAppConfigSchema = z.object({
  client_id: z.string().trim().min(1).max(128),
  client_secret: z.string().trim().max(512).optional(),
}).strict();
const spotifyAuthStartQuerySchema = z.object({
  return_origin: z.string().trim().min(1).max(2048).optional(),
}).strict();
const spotifyCallbackQuerySchema = z.object({
  code: z.string().trim().min(1).max(4096).optional(),
  error: z.string().trim().min(1).max(256).optional(),
  error_description: z.string().trim().max(2048).optional(),
  state: z.string().trim().min(1).max(4096),
}).strict();
const spotifyDeviceAuthStartBodySchema = z.object({
  device_id: z.string().uuid(),
  return_origin: z.string().trim().min(1).max(2048).optional(),
}).strict();
const spotifyDeviceAuthStatusQuerySchema = z.object({ device_id: z.string().uuid() }).strict();
const spotifyPlaybackDevicesQuerySchema = z.object({ kiosk_device_id: z.string().uuid().optional() }).strict();
const emptyRequestBodySchema = z.object({}).strict();
const emptyQuerySchema = z.object({}).strict();

export interface SpotifyAppConfigUpdatePayload {
  client_id?: unknown;
  client_secret?: unknown;
}

export interface SpotifyAppConfigResponse {
  clientId: string;
  clientSecretMasked: string;
  clientSecretSet: boolean;
  redirectUri: string;
  redirectUriReadOnly: true;
  source: 'db' | 'env';
}

export function normalizeSpotifyAppConfigPayload(payload: SpotifyAppConfigUpdatePayload): {
  clientId: string;
  clientSecret?: string;
} {
  const clientId = typeof payload.client_id === 'string' ? payload.client_id.trim() : '';
  const rawClientSecret = typeof payload.client_secret === 'string' ? payload.client_secret.trim() : '';

  if (!clientId) {
    throw new Error('client_id is required');
  }

  if (!rawClientSecret) {
    return { clientId };
  }

  return { clientId, clientSecret: rawClientSecret };
}

export function maskSpotifyAppConfigForResponse(config: SpotifyAppConfig): SpotifyAppConfigResponse {
  return {
    clientId: config.clientId,
    clientSecretMasked: config.clientSecret ? '********' : '',
    clientSecretSet: Boolean(config.clientSecret),
    redirectUri: config.redirectUri,
    redirectUriReadOnly: true,
    source: config.source,
  };
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderSpotifyDeviceAuthSuccess(res: Response, result: {
  deviceId: string;
  spotifyDisplayName: string | null;
  returnOrigin?: string | null;
}) {
  const escapedDisplayName = escapeHtml(result.spotifyDisplayName || 'a Spotify account');
  const escapedDeviceId = escapeHtml(result.deviceId);
  const postMessageScript = result.returnOrigin
    ? `window.opener.postMessage({ type: 'SPOTIFY_DEVICE_AUTH_SUCCESS', deviceId: ${JSON.stringify(result.deviceId)} }, ${JSON.stringify(result.returnOrigin)});`
    : '';

  return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Spotify Bağlandı</title>
      </head>
      <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; text-align: center; padding: 50px 20px; background: #121212; color: #fff;">
        <div style="max-width: 480px; margin: 0 auto; background: #1e1e1e; padding: 30px; border-radius: 12px; border: 1px solid #333;">
          <div style="font-size: 48px; color: #1db954; margin-bottom: 16px;">✓</div>
          <h2 style="margin-bottom: 8px; color: #fff;">Spotify Başarıyla Bağlandı</h2>
          <p style="color: #aaa; margin-bottom: 24px;">Cihaz (${escapedDeviceId}) başarıyla <strong>${escapedDisplayName}</strong> hesabına bağlandı.</p>
          <p style="margin-bottom: 16px;">
            <a href="/jukebox/kiosk/?code=RADIO-01" style="display: inline-block; padding: 12px 24px; background: #1db954; color: #000; text-decoration: none; border-radius: 24px; font-weight: bold;">Kiosk Ekranına Dön</a>
          </p>
          <p style="color: #666; font-size: 13px;">Pencere otomatik olarak kapatılacaktır...</p>
        </div>
        <script>
          if (window.opener) {
            ${postMessageScript}
            setTimeout(() => window.close(), 2500);
          }
        </script>
      </body>
      </html>
    `);
}

async function completeSpotifyDeviceAuthCallback(req: Request, res: Response, redirectUriOverride?: string) {
  const parsedQuery = spotifyCallbackQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) return sendError(res, 'Invalid Spotify device callback parameters', 400, 'INVALID_SPOTIFY_CALLBACK');
  const { code, error, state } = parsedQuery.data;

  if (error) {
    console.error('[Spotify Device Auth Callback] Authorization denied:', error);
    return sendError(res, `Spotify authorization denied: ${error}`, 400);
  }

  if (!code || typeof code !== 'string') {
    return sendError(res, 'Missing authorization code', 400);
  }

  if (!state || typeof state !== 'string') {
    return sendError(res, 'Missing device auth state', 400);
  }

  const result = await spotifyService.handleDeviceAuthCallback(code, state, redirectUriOverride);
  return renderSpotifyDeviceAuthSuccess(res, result);
}

export async function handleSpotifyDeviceAuthStart(req: Request, res: Response) {
  try {
    const parsedBody = spotifyDeviceAuthStartBodySchema.safeParse(req.body);
    if (!parsedBody.success || !emptyQuerySchema.safeParse(req.query).success) return sendError(res, 'Invalid Spotify device authorization request', 400, 'INVALID_SPOTIFY_DEVICE_AUTH_START');
    const deviceId = parsedBody.data.device_id;
    const requestedOrigin = parsedBody.data.return_origin ?? null;
    const returnOrigin = normalizeSpotifyReturnOrigin(requestedOrigin);
    if (requestedOrigin && !returnOrigin) return sendError(res, 'Invalid Spotify return origin', 400, 'INVALID_SPOTIFY_RETURN_ORIGIN');

    const deviceResult = await db.query('SELECT id FROM devices WHERE id = $1', [deviceId]);
    if (deviceResult.rows.length === 0) {
      return sendError(res, 'Device not found', 404);
    }

    const authUrl = await spotifyService.getDeviceAuthStartUrl(
      deviceId,
      returnOrigin,
    );
    return sendSuccess(res, { authUrl }, 'Spotify device auth start url fetched');
  } catch (error: any) {
    console.error('[Spotify Device Auth Start] Error:', error.message);
    return sendError(res, error.message || 'Failed to initiate device Spotify authorization', 500);
  }
}

export async function handleSpotifyDeviceAuthCallback(req: Request, res: Response) {
  try {
    const appConfig = await spotifyService.getSpotifyAppConfig();
    return await completeSpotifyDeviceAuthCallback(
      req,
      res,
      deriveSpotifyDeviceAuthRedirectUri(appConfig.redirectUri)
    );
  } catch (error: any) {
    console.error('[Spotify Device Auth Callback] Error:', error.message);
    return res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Spotify Device Connection Failed</title></head>
      <body style="font-family: sans-serif; text-align: center; padding: 40px;">
        <h2>Spotify Connection Failed</h2>
        <p>${error.message || 'An unexpected error occurred'}</p>
        <p>Please try again from the admin dashboard.</p>
      </body>
      </html>
    `);
  }
}

export async function handleSpotifyAuthCallback(req: Request, res: Response) {
  try {
    const parsedQuery = spotifyCallbackQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) return sendError(res, 'Invalid Spotify callback parameters', 400, 'INVALID_SPOTIFY_CALLBACK');
    const { code, error, state } = parsedQuery.data;

    if (spotifyService.isDeviceAuthState(state)) {
      return await completeSpotifyDeviceAuthCallback(req, res);
    }

    const stateHash = crypto.createHash('sha256').update(state).digest('hex');
    const consumedState = await db.query(
      `DELETE FROM spotify_oauth_states
       WHERE state_hash = $1 AND expires_at > NOW()
       RETURNING return_origin, code_verifier`,
      [stateHash],
    );
    if (!consumedState.rows[0]) {
      return sendError(res, 'Spotify authorization state is invalid, expired, or already used', 400, 'INVALID_SPOTIFY_STATE');
    }

    const signedReturnOrigin = await spotifyService.getAuthReturnOriginFromState(state);
    const returnOrigin = consumedState.rows[0].return_origin as string | null;
    const codeVerifier = consumedState.rows[0].code_verifier as string | null;
    if (!codeVerifier) return sendError(res, 'Spotify authorization state is invalid', 400, 'INVALID_SPOTIFY_STATE');
    if (signedReturnOrigin !== returnOrigin) {
      return sendError(res, 'Spotify authorization state did not match its stored origin', 400, 'INVALID_SPOTIFY_STATE');
    }

    if (error) {
      console.error('[Spotify Callback] Authorization denied:', error);
      return sendError(res, `Spotify authorization denied: ${error}`, 400);
    }

    if (!code) {
      return sendError(res, 'Missing authorization code', 400);
    }
    const postMessageScript = returnOrigin
      ? `window.opener.postMessage({ type: 'SPOTIFY_AUTH_SUCCESS' }, ${JSON.stringify(returnOrigin)});`
      : '';

    await spotifyService.handleCallback(code, undefined, codeVerifier);

    return res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Spotify Connected</title></head>
      <body style="font-family: sans-serif; text-align: center; padding: 40px;">
        <h2>Spotify Connected Successfully</h2>
        <p>You can close this window and return to the admin dashboard.</p>
        <script>
          if (window.opener) {
            ${postMessageScript}
            setTimeout(() => window.close(), 2000);
          }
        </script>
      </body>
      </html>
    `);
  } catch (error: any) {
    console.error('[Spotify Callback] Error:', error.message);
    return res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Spotify Connection Failed</title></head>
      <body style="font-family: sans-serif; text-align: center; padding: 40px;">
        <h2>Spotify Connection Failed</h2>
        <p>${error.message || 'An unexpected error occurred'}</p>
        <p>Please try again from the admin dashboard.</p>
      </body>
      </html>
    `);
  }
}

export async function handleSpotifyAuthStart(req: Request, res: Response) {
  try {
    const parsedQuery = spotifyAuthStartQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) return sendError(res, 'Invalid Spotify authorization parameters', 400, 'INVALID_SPOTIFY_AUTH_START');
    const requestedOrigin = parsedQuery.data.return_origin ?? null;
    const returnOrigin = normalizeSpotifyReturnOrigin(requestedOrigin);
    if (requestedOrigin && !returnOrigin) return sendError(res, 'Invalid Spotify return origin', 400, 'INVALID_SPOTIFY_RETURN_ORIGIN');

    const nonce = crypto.randomBytes(32).toString('base64url');
    const codeVerifier = crypto.randomBytes(48).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    const authUrl = await spotifyService.getAuthUrl(nonce, returnOrigin, codeChallenge);
    const state = new URL(authUrl).searchParams.get('state');
    if (!state) throw new Error('Spotify authorization URL did not include state');
    const stateHash = crypto.createHash('sha256').update(state).digest('hex');
    await db.query('DELETE FROM spotify_oauth_states WHERE expires_at <= NOW()');
    await db.query(
      `INSERT INTO spotify_oauth_states (state_hash, state_kind, return_origin, code_verifier, expires_at)
       VALUES ($1, 'admin', $2, $3, NOW() + INTERVAL '10 minutes')`,
      [stateHash, returnOrigin, codeVerifier],
    );
    if (process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST)) {
      return res.redirect(authUrl);
    }
    const safeUrl = escapeHtml(authUrl);
    return res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Spotify'a Aktarılıyor...</title>
  <meta http-equiv="refresh" content="0;url=${safeUrl}">
  <script>window.location.replace(${JSON.stringify(authUrl)});</script>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:center;padding:50px 20px;background:#121212;color:#fff;">
  <h2 style="margin-bottom:10px;">Spotify Girişine Yönlendiriliyorsunuz...</h2>
  <p style="color:#aaa;margin-bottom:20px;">Lütfen bekleyin, Spotify yetkilendirme ekranı açılıyor.</p>
  <p><a href="${safeUrl}" style="color:#1db954;text-decoration:underline;">Otomatik yönlendirilmediyseniz buraya tıklayın</a></p>
</body>
</html>`);
  } catch (error: any) {
    console.error('[Spotify Auth] Error initiating OAuth:', error.message);
    return sendError(res, 'Failed to initiate Spotify authorization', 500);
  }
}

export async function handleSpotifyDeviceAuthStatus(req: Request, res: Response) {
  try {
    const parsedQuery = spotifyDeviceAuthStatusQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) return sendError(res, 'Invalid Spotify device ID', 400, 'INVALID_DEVICE_ID');
    const deviceId = parsedQuery.data.device_id;

    const status = await spotifyService.getDeviceAuthStatus(deviceId);
    return sendSuccess(res, status, 'Spotify device auth status fetched');
  } catch (error: any) {
    console.error('[Spotify Device Auth Status] Error:', error.message);
    return sendError(res, 'Failed to fetch Spotify device auth status', 500);
  }
}

export async function handleSpotifyDeviceAuthDelete(req: Request, res: Response) {
  try {
    const parsedParams = z.object({ deviceId: z.string().uuid() }).strict().safeParse(req.params);
    if (!parsedParams.success || !emptyQuerySchema.safeParse(req.query).success || !emptyRequestBodySchema.safeParse(req.body ?? {}).success) {
      return sendError(res, 'Invalid Spotify device ID', 400, 'INVALID_DEVICE_ID');
    }
    const deviceId = parsedParams.data.deviceId;

    await spotifyService.deleteDeviceAuth(deviceId);
    return sendSuccess(res, { deviceId }, 'Spotify device auth disconnected');
  } catch (error: any) {
    console.error('[Spotify Device Auth Delete] Error:', error.message);
    return sendError(res, 'Failed to disconnect Spotify device auth', 500);
  }
}

const router = Router();

/**
 * GET /api/v1/spotify/auth
 * Initiates Spotify OAuth flow. Admin only.
 * Redirects the admin to Spotify's authorization page.
 */
router.get(
  '/auth',
  authMiddleware,
  rbacMiddleware(['admin']),
  adminAuditLog,
  handleSpotifyAuthStart
);

/**
 * GET /api/v1/spotify/callback
 * Handles Spotify OAuth callback. Exchanges code for tokens and stores them.
 * No auth middleware -- Spotify redirects here directly.
 */
router.get('/callback', handleSpotifyAuthCallback);

/**
 * GET /api/v1/spotify/status
 * Returns current Spotify auth status. Admin only.
 */
router.get(
  '/status',
  authMiddleware,
  rbacMiddleware(['admin']),
  adminAuditLog,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!emptyQuerySchema.safeParse(req.query).success) return sendError(res, 'Unexpected Spotify status query parameters', 400, 'INVALID_QUERY');
      const status = await spotifyService.getAuthStatus();
      return sendSuccess(res, status);
    } catch (error: any) {
      console.error('[Spotify Status] Error:', error.message);
      return sendError(res, 'Failed to fetch Spotify status', 500);
    }
  }
);

router.post(
  '/device-auth/start',
  authMiddleware,
  rbacMiddleware(['admin']),
  adminAuditLog,
  handleSpotifyDeviceAuthStart
);

router.get(
  '/device-auth/callback',
  handleSpotifyDeviceAuthCallback
);

router.get(
  '/device-auth/status',
  authMiddleware,
  rbacMiddleware(['admin']),
  adminAuditLog,
  handleSpotifyDeviceAuthStatus
);

router.delete(
  '/device-auth/:deviceId',
  authMiddleware,
  rbacMiddleware(['admin']),
  adminAuditLog,
  handleSpotifyDeviceAuthDelete
);

/**
 * GET /api/v1/spotify/app-config
 * Returns the effective Spotify app config with the client secret masked. Admin only.
 */
router.get(
  '/app-config',
  authMiddleware,
  rbacMiddleware(['admin']),
  adminAuditLog,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!emptyQuerySchema.safeParse(req.query).success) return sendError(res, 'Unexpected Spotify config query parameters', 400, 'INVALID_QUERY');
      const config = await spotifyService.getSpotifyAppConfig();
      return sendSuccess(res, maskSpotifyAppConfigForResponse(config), 'Spotify app config fetched');
    } catch (error: any) {
      console.error('[Spotify App Config] Error fetching config:', error.message);
      return sendError(res, 'Failed to fetch Spotify app config', 500);
    }
  }
);

/**
 * PUT /api/v1/spotify/app-config
 * Replaces the global Spotify app credentials. Admin only.
 */
router.put(
  '/app-config',
  authMiddleware,
  rbacMiddleware(['admin']),
  adminAuditLog,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!emptyQuerySchema.safeParse(req.query).success) return sendError(res, 'Unexpected Spotify config query parameters', 400, 'INVALID_QUERY');
      const parsed = spotifyAppConfigSchema.safeParse(req.body ?? {});
      if (!parsed.success) return sendError(res, 'Invalid Spotify app config payload', 400, 'INVALID_SPOTIFY_APP_CONFIG');
      const payload = normalizeSpotifyAppConfigPayload(parsed.data);
      await spotifyService.saveSpotifyAppConfig(payload);
      const config = await spotifyService.getSpotifyAppConfig();
      return sendSuccess(res, maskSpotifyAppConfigForResponse(config), 'Spotify app config updated');
    } catch (error: any) {
      console.error('[Spotify App Config] Error updating config:', error.message);
      return sendError(res, error.message || 'Failed to update Spotify app config', 400);
    }
  }
);

/**
 * GET /api/v1/spotify/playback-devices
 * Returns active Spotify Connect devices available for playback. Admin only.
 */
router.get(
  '/playback-devices',
  adminRateLimit,
  authMiddleware,
  rbacMiddleware(['admin']),
  adminAuditLog,
  async (req: AuthRequest, res: Response) => {
    try {
      const parsedQuery = spotifyPlaybackDevicesQuerySchema.safeParse(req.query);
      if (!parsedQuery.success) return sendError(res, 'Invalid playback-device query', 400, 'INVALID_DEVICE_ID');
      const kioskDeviceId = parsedQuery.data.kiosk_device_id ?? null;
      let accessTokenOverride: string | undefined = undefined;

      if (kioskDeviceId) {
        try {
          const tokenObj = await spotifyService.getKioskPlaybackToken(kioskDeviceId);
          accessTokenOverride = tokenObj.accessToken;
        } catch (tokenErr: any) {
          console.warn('[Spotify Devices] Could not get kiosk token for the requested device');
        }
      }

      const devices = await spotifyService.getAvailableDevices(accessTokenOverride);
      return sendSuccess(res, { devices }, 'Active Spotify devices fetched');
    } catch (error: any) {
      console.error('[Spotify Devices] Error fetching playback devices:', error.message);
      return sendSuccess(res, { devices: [] }, 'Failed to fetch Spotify devices');
    }
  }
);

export default router;

