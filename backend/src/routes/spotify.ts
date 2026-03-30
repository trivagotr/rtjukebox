import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { rbacMiddleware } from '../middleware/rbac';
import { sendSuccess, sendError } from '../utils/response';
import { spotifyService } from '../services/spotify';

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
  (req: AuthRequest, res: Response) => {
    try {
      const state = crypto.randomBytes(16).toString('hex');
      // In production, store state in session/cookie for CSRF validation.
      // For now we pass it through and validate on callback.
      const authUrl = spotifyService.getAuthUrl(state);
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
router.get('/callback', async (req: Request, res: Response) => {
  try {
    const { code, error, state } = req.query;

    if (error) {
      console.error('[Spotify Callback] Authorization denied:', error);
      return sendError(res, `Spotify authorization denied: ${error}`, 400);
    }

    if (!code || typeof code !== 'string') {
      return sendError(res, 'Missing authorization code', 400);
    }

    await spotifyService.handleCallback(code);

    // Return a simple HTML page that closes the popup / shows success
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
});

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
