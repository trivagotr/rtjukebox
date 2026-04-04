import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { db } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { rbacMiddleware } from '../middleware/rbac';
import { sendSuccess, sendError } from '../utils/response';
import { deriveSpotifyDeviceAuthRedirectUri, spotifyService, type SpotifyAppConfig } from '../services/spotify';

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

function readSpotifyDeviceIdFromRequest(req: Request): string | null {
  const queryDeviceId = typeof req.query?.device_id === 'string' ? req.query.device_id : null;
  const paramDeviceId = typeof req.params?.deviceId === 'string' ? req.params.deviceId : null;
  return (queryDeviceId ?? paramDeviceId)?.trim() || null;
}

function readSpotifyDeviceIdFromPathParam(req: Request): string | null {
  return typeof req.params?.deviceId === 'string' ? req.params.deviceId.trim() || null : null;
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
}) {
  const escapedDisplayName = escapeHtml(result.spotifyDisplayName || 'a Spotify account');
  const escapedDeviceId = escapeHtml(result.deviceId);

  return res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Spotify Device Connected</title></head>
      <body style="font-family: sans-serif; text-align: center; padding: 40px;">
        <h2>Spotify Connected Successfully</h2>
        <p>Device ${escapedDeviceId} is now linked to ${escapedDisplayName}.</p>
        <p>You can close this window and return to the admin dashboard.</p>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'SPOTIFY_DEVICE_AUTH_SUCCESS', deviceId: ${JSON.stringify(result.deviceId)} }, '*');
            setTimeout(() => window.close(), 2000);
          }
        </script>
      </body>
      </html>
    `);
}

async function completeSpotifyDeviceAuthCallback(req: Request, res: Response, redirectUriOverride?: string) {
  const { code, error, state } = req.query;

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
    const deviceId = readSpotifyDeviceIdFromRequest(req);
    if (!deviceId) {
      return sendError(res, 'Missing device_id', 400);
    }

    const deviceResult = await db.query('SELECT id FROM devices WHERE id = $1', [deviceId]);
    if (deviceResult.rows.length === 0) {
      return sendError(res, 'Device not found', 404);
    }

    const authUrl = await spotifyService.getDeviceAuthStartUrl(deviceId);
    if (typeof req.query?.format === 'string' && req.query.format.toLowerCase() === 'json') {
      return sendSuccess(res, { authUrl }, 'Spotify device auth start url fetched');
    }
    return res.redirect(authUrl);
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
    const { code, error, state } = req.query;

    if (error) {
      console.error('[Spotify Callback] Authorization denied:', error);
      return sendError(res, `Spotify authorization denied: ${error}`, 400);
    }

    if (!code || typeof code !== 'string') {
      return sendError(res, 'Missing authorization code', 400);
    }

    if (typeof state === 'string' && spotifyService.isDeviceAuthState(state)) {
      return await completeSpotifyDeviceAuthCallback(req, res);
    }

    await spotifyService.handleCallback(code);

    return res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Spotify Connected</title></head>
      <body style="font-family: sans-serif; text-align: center; padding: 40px;">
        <h2>Spotify Connected Successfully</h2>
        <p>You can close this window and return to the admin dashboard.</p>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'SPOTIFY_AUTH_SUCCESS' }, '*');
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

export async function handleSpotifyDeviceAuthStatus(req: Request, res: Response) {
  try {
    const deviceId = readSpotifyDeviceIdFromRequest(req);
    if (!deviceId) {
      return sendError(res, 'Missing device_id', 400);
    }

    const status = await spotifyService.getDeviceAuthStatus(deviceId);
    return sendSuccess(res, status, 'Spotify device auth status fetched');
  } catch (error: any) {
    console.error('[Spotify Device Auth Status] Error:', error.message);
    return sendError(res, 'Failed to fetch Spotify device auth status', 500);
  }
}

export async function handleSpotifyDeviceAuthDelete(req: Request, res: Response) {
  try {
    const deviceId = readSpotifyDeviceIdFromPathParam(req);
    if (!deviceId) {
      return sendError(res, 'Missing device_id', 400);
    }

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
  async (req: AuthRequest, res: Response) => {
    try {
      const state = crypto.randomBytes(16).toString('hex');
      // In production, store state in session/cookie for CSRF validation.
      // For now we pass it through and validate on callback.
      const authUrl = await spotifyService.getAuthUrl(state);
      return res.redirect(authUrl);
    } catch (error: any) {
      console.error('[Spotify Auth] Error initiating OAuth:', error.message);
      return sendError(res, 'Failed to initiate Spotify authorization', 500);
    }
  }
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
  async (req: AuthRequest, res: Response) => {
    try {
      const status = await spotifyService.getAuthStatus();
      return sendSuccess(res, status);
    } catch (error: any) {
      console.error('[Spotify Status] Error:', error.message);
      return sendError(res, 'Failed to fetch Spotify status', 500);
    }
  }
);

router.get(
  '/device-auth/start',
  authMiddleware,
  rbacMiddleware(['admin']),
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
  handleSpotifyDeviceAuthStatus
);

router.delete(
  '/device-auth/:deviceId',
  authMiddleware,
  rbacMiddleware(['admin']),
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
  async (req: AuthRequest, res: Response) => {
    try {
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
  async (req: AuthRequest, res: Response) => {
    try {
      const payload = normalizeSpotifyAppConfigPayload(req.body || {});
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
 * POST /api/v1/spotify/refresh
 * Force refresh the Spotify access token. Admin only.
 */
router.post(
  '/refresh',
  authMiddleware,
  rbacMiddleware(['admin']),
  async (req: AuthRequest, res: Response) => {
    try {
      await spotifyService.refreshAccessToken();
      const status = await spotifyService.getAuthStatus();
      return sendSuccess(res, status, 'Token refreshed successfully');
    } catch (error: any) {
      console.error('[Spotify Refresh] Error:', error.message);
      return sendError(res, `Failed to refresh token: ${error.message}`, 500);
    }
  }
);

export default router;
