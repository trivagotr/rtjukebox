import { Router } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { createOptionalAuth } from '../../core/auth/auth.middleware.js';
import type { Environment } from '../../core/config/env.js';
import type { JukeboxService } from './jukebox.service.js';
import { createJukeboxController } from './jukebox.controller.js';

export function createJukeboxRouter(service: JukeboxService, environment: Environment) {
  const router = Router();
  router.use(createOptionalAuth(environment.JWT_SECRET, environment.JWT_ISSUER, environment.JWT_AUDIENCE, environment.JWT_ALLOW_LEGACY_TOKENS));
  const controller = createJukeboxController(service);
  const writeLimit = rateLimit({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => req.user?.userId ?? ipKeyGenerator(req.ip ?? 'unknown'),
  });
  const autoplayLimit = rateLimit({
    windowMs: 60_000,
    limit: 1,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => typeof req.body?.device_id === 'string' ? `autoplay:${req.body.device_id}` : ipKeyGenerator(req.ip ?? 'unknown'),
  });
  router.post('/connect', controller.connect);
  router.post('/queue', writeLimit, controller.addSong);
  router.post('/vote', writeLimit, controller.vote);
  router.post('/kiosk/heartbeat', controller.kioskHeartbeat);
  router.post('/kiosk/now-playing', controller.kioskNowPlaying);
  router.post('/autoplay/trigger', autoplayLimit, controller.autoplayTrigger);
  router.get('/queue/:deviceId', controller.queue);
  router.post('/disconnect', controller.disconnect);
  return router;
}
