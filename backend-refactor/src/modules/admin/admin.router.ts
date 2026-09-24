import { Router } from 'express';
import { createRequireAuth, createRequireRole } from '../../core/auth/auth.middleware.js';

export function createAdminRouter(accessTokenSecret: string) {
  const router = Router();
  router.use(createRequireAuth(accessTokenSecret), createRequireRole('ADMIN'));
  return router;
}
