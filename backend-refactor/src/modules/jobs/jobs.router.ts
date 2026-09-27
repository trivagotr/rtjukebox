import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { createRequireAuth } from '../../core/auth/auth.middleware.js';
import type { Environment } from '../../core/config/env.js';
import type { BullMqJobQueue } from './infra/bullmq-job-queue.js';

const jobIdSchema = z.object({ jobId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/) }).strict();
const emptySchema = z.object({}).strict();

export function createJobsRouter(queue: BullMqJobQueue, environment: Environment) {
  const router = Router();
  router.use(createRequireAuth(environment.JWT_SECRET, environment.JWT_ISSUER, environment.JWT_AUDIENCE, environment.JWT_ALLOW_LEGACY_TOKENS));
  router.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }));
  router.get('/:jobId', async (req, res, next) => {
    const params = jobIdSchema.safeParse(req.params);
    if (!params.success || !emptySchema.safeParse(req.query).success || !emptySchema.safeParse(req.body ?? {}).success) return res.status(400).json({ success: false, error: 'Invalid job ID', code: 'INVALID_JOB_ID' });
    try {
      const job = await queue.getJobStatus(params.data.jobId);
      if (!job) return res.status(404).json({ success: false, error: 'Job not found', code: 'JOB_NOT_FOUND' });
      if (!req.user?.roles.includes('ADMIN') && job.ownerId !== req.user?.userId) return res.status(403).json({ success: false, error: 'Forbidden', code: 'FORBIDDEN' });
      const publicJob = { id: job.id, name: job.name, state: job.state, progress: job.progress, result: job.result, failed: job.failed, finishedAt: job.finishedAt };
      return res.json({ success: true, data: publicJob, message: 'Job status fetched' });
    } catch (error) { return next(error); }
  });
  return router;
}
