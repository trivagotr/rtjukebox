import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createRequireAuth, createRequireRole } from '../../core/auth/auth.middleware.js';
import type { AdminAuditRepository } from './ports/admin-audit.repository.js';
import { logger } from '../../core/logging/logger.js';

export function createAdminRouter(accessTokenSecret: string, issuer: string, audience: string, allowLegacyTokens: boolean, auditRepository: AdminAuditRepository) {
  const router = Router();
  router.use(createRequireAuth(accessTokenSecret, issuer, audience, allowLegacyTokens), createRequireRole('ADMIN'));
  router.use(rateLimit({ windowMs: 60_000, limit: 100, standardHeaders: 'draft-8', legacyHeaders: false }));
  router.use((req, res, next) => {
    const userId = req.user?.userId;
    if (!userId) return next();
    res.once('finish', () => {
      const path = `${req.baseUrl}${req.path}`;
      const explicit = res.locals.adminAudit as { action?: string; entityType?: string | null; entityId?: string | null; metadata?: Record<string, unknown> } | undefined;
      const requestIds = ['id', 'device_id', 'song_id', 'feed_id', 'queue_item_id'];
      const entityId = explicit?.entityId
        ?? Object.values(req.params).find((value): value is string => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value))
        ?? requestIds.map((key) => (req.body as Record<string, unknown> | undefined)?.[key]).find((value): value is string => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value))
        ?? null;
      const requestIp = typeof req.ip === 'string' ? req.ip : null;
      void auditRepository.record({
        userId,
        action: (explicit?.action ?? `HTTP_${req.method}`).slice(0, 50),
        entityType: explicit?.entityType ?? path.split('/').filter(Boolean).slice(-2, -1)[0]?.slice(0, 50) ?? null,
        entityId,
        ipAddress: requestIp,
        metadata: { path, statusCode: res.statusCode, requestId: req.requestId ?? null, ...explicit?.metadata },
      }).catch((error: unknown) => logger.error({ err: error, requestId: req.requestId }, 'Admin audit write failed'));
    });
    next();
  });
  return router;
}
