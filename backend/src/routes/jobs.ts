import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { readRateLimit } from '../middleware/rateLimits';
import { getBackgroundJob, BackgroundJobsUnavailableError } from '../services/backgroundJobs';
import { sendError, sendSuccess } from '../utils/response';

const router = Router();
const jobIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9:_-]+$/);

router.use(authMiddleware);
router.get('/:jobId', readRateLimit, async (req: AuthRequest, res: Response) => {
    const parsedId = jobIdSchema.safeParse(req.params.jobId);
    if (!parsedId.success) return sendError(res, 'Invalid job ID', 400, 'INVALID_JOB_ID');

    try {
        const job = await getBackgroundJob(parsedId.data);
        if (!job) return sendError(res, 'Job not found', 404, 'JOB_NOT_FOUND');
        if (req.user?.role !== 'admin' && job.ownerId !== req.user?.id) {
            return sendError(res, 'Forbidden', 403, 'FORBIDDEN');
        }
        const { ownerId: _ownerId, ...publicJob } = job;
        return sendSuccess(res, publicJob, 'Job status fetched');
    } catch (error) {
        if (error instanceof BackgroundJobsUnavailableError) {
            return sendError(res, 'Background jobs are unavailable', 503, 'JOBS_UNAVAILABLE');
        }
        console.error('Job status lookup failed:', error instanceof Error ? error.name : 'Error');
        return sendError(res, 'Failed to fetch job status', 500);
    }
});

export default router;
