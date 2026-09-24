import { Router } from 'express';
import { requireAuth, requireRole } from '../../core/auth/auth.middleware.js';

export function createAdminRouter() {
  const router = Router();
  router.use(requireAuth, requireRole('ADMIN'));
  return router;
}
