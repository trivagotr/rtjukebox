import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { validateBodySchema } from '../../core/validation/validation.middleware.js';
import type { Environment } from '../../core/config/env.js';
import { createRequireAuth } from '../../core/auth/auth.middleware.js';
import { createIdentityController } from './identity.controller.js';
import { validateQuerySchema } from '../../core/validation/validation.middleware.js';
import { z } from 'zod';
import { guestRequestSchema, loginRequestSchema, refreshRequestSchema, registerRequestSchema } from './identity.schema.js';
import type { IdentityService } from './identity.service.js';

export function createIdentityRouter(service: IdentityService, environment: Environment) {
  const router = Router();
  const controller = createIdentityController(service, environment);
  const authRateLimit = rateLimit({ windowMs: 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false });
  const guestRateLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 3, standardHeaders: 'draft-8', legacyHeaders: false });
  const requireAuth = createRequireAuth(environment.JWT_SECRET, environment.JWT_ISSUER, environment.JWT_AUDIENCE, environment.JWT_ALLOW_LEGACY_TOKENS);
  const emptyQuery = validateQuerySchema(z.strictObject({}));

  router.post('/register', authRateLimit, emptyQuery, validateBodySchema(registerRequestSchema), controller.register);
  router.post('/login', authRateLimit, emptyQuery, validateBodySchema(loginRequestSchema), controller.login);
  router.post('/guest', guestRateLimit, emptyQuery, validateBodySchema(guestRequestSchema), controller.guest);
  router.post('/refresh', authRateLimit, emptyQuery, validateBodySchema(refreshRequestSchema), controller.refresh);
  router.post('/logout', emptyQuery, validateBodySchema(refreshRequestSchema), controller.logout);
  router.get('/me', requireAuth, emptyQuery, controller.me);

  return router;
}
