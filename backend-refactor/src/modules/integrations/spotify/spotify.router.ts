import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Environment } from '../../../core/config/env.js';
import type { DevicesService } from '../../devices/devices.service.js';
import type { JukeboxService } from '../../jukebox/jukebox.service.js';
import type { LyricsProvider } from './ports/lyrics-provider.port.js';
import type { SpotifyOAuthService } from './spotify-oauth.service.js';
import type { PlaybackProvider } from './ports/playback-provider.port.js';
import { createSpotifyController } from './spotify.controller.js';

export function createSpotifyRouters(service: SpotifyOAuthService, playback: PlaybackProvider, jukebox: JukeboxService, devices: DevicesService, lyrics: LyricsProvider, environment: Environment) {
  const controller = createSpotifyController(service, playback, jukebox, devices, lyrics, environment);
  const publicRouter = Router();
  publicRouter.get('/callback', controller.adminCallback);
  publicRouter.get('/device-auth/callback', controller.deviceCallback);

  const adminRouter = Router();
  const oauthStartLimit = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });
  const kioskTokenLimit = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });
  const kioskAuthStartLimit = rateLimit({ windowMs: 60_000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false });
  adminRouter.get('/auth', oauthStartLimit, controller.adminStart);
  adminRouter.get('/status', controller.status);
  adminRouter.get('/app-config', controller.appConfigGet);
  adminRouter.put('/app-config', controller.appConfigPut);
  adminRouter.post('/device-auth/start', oauthStartLimit, controller.adminDeviceAuthStart);
  adminRouter.get('/device-auth/status', controller.deviceStatus);
  adminRouter.delete('/device-auth/:deviceId', controller.deviceDelete);
  adminRouter.get('/playback-devices', controller.playbackDevices);

  const kioskRouter = Router();
  kioskRouter.use(controller.authOptional);
  kioskRouter.post('/kiosk/spotify-token', kioskTokenLimit, controller.kioskToken);
  kioskRouter.post('/kiosk/spotify-device-auth/status', controller.kioskStatus);
  kioskRouter.post('/kiosk/spotify-device-auth/start', kioskAuthStartLimit, controller.kioskStart);
  kioskRouter.post('/kiosk/spotify-device', controller.kioskRegister);
  kioskRouter.get('/kiosk/playback-state/:deviceId', controller.playbackState);
  kioskRouter.get('/lyrics', controller.lyrics);
  return { publicRouter, adminRouter, kioskRouter };
}
