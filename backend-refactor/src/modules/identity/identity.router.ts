import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { validateBodySchema } from '../../core/validation/validation.middleware.js';
import { createIdentityController } from './identity.controller.js';
import { guestRequestSchema, loginRequestSchema, refreshRequestSchema, registerRequestSchema } from './identity.schema.js';
import type { IdentityService } from './identity.service.js';

export function createIdentityRouter(service: IdentityService) {
  const router = Router();
  const controller = createIdentityController(service);
  const authRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });
  const guestRateLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false });

  router.post('/register', authRateLimit, validateBodySchema(registerRequestSchema), controller.register);
  router.post('/login', authRateLimit, validateBodySchema(loginRequestSchema), controller.login);
  router.post('/guest', guestRateLimit, validateBodySchema(guestRequestSchema), controller.guest);
  router.post('/refresh', authRateLimit, validateBodySchema(refreshRequestSchema), controller.refresh);
  router.post('/logout', authRateLimit, validateBodySchema(refreshRequestSchema), controller.logout);

  return router;
}
