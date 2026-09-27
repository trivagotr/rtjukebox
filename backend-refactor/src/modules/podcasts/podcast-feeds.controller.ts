import type { RequestHandler } from 'express';
import { AppError, ValidationError } from '../../core/errors/app-error.js';
import { createFeedSchema, emptyRequestSchema, feedIdSchema, syncFeedSchema } from './podcast-feeds.schema.js';
import type { PodcastFeedsService } from './podcast-feeds.service.js';
import type { JobQueue } from '../../core/ports/job-queue.port.js';
import { randomUUID } from 'node:crypto';

export function createPodcastFeedsController(service: PodcastFeedsService, jobs: JobQueue) {
  const list: RequestHandler = async (req, res, next) => {
    if (!req.user || Object.keys(req.query).length) return next(new ValidationError('Invalid podcast-feed list request'));
    try { return res.json({ success: true, data: { feeds: await service.list() }, message: 'Podcast feeds fetched' }); } catch (e) { return next(e); }
  };
  const create: RequestHandler = async (req, res, next) => {
    const body = createFeedSchema.safeParse(req.body);
    if (!req.user || !body.success || Object.keys(req.query).length) return next(new ValidationError('Invalid podcast feed payload'));
    try {
      const feed = await service.create({ title: body.data.title, feedUrl: body.data.feed_url, userId: req.user.userId });
      let syncJobId: string | null = null;
      try { syncJobId = (await jobs.enqueue('podcast-feed-sync', { requestedBy: req.user.userId, feedId: feed.id }, { jobId: `podcast-feed-${randomUUID()}` })).jobId; } catch { /* Feed persists; the caller can retry synchronization. */ }
      return res.status(201).json({ success: true, data: { feed, sync_job_id: syncJobId }, message: 'Podcast feed created' });
    } catch (e) { return next(e); }
  };
  const sync: RequestHandler = async (req, res, next) => {
    const body = syncFeedSchema.safeParse(req.body ?? {});
    if (!req.user || !body.success || Object.keys(req.query).length) return next(new ValidationError('Invalid podcast sync request'));
    try {
      const feedId = body.data.feed_id;
      if (feedId) await service.assertExists(feedId);
      const job = await jobs.enqueue('podcast-feed-sync', { requestedBy: req.user.userId, ...(feedId ? { feedId } : {}) }, { jobId: `podcast-feed-${randomUUID()}` });
      return res.status(202).json({ success: true, data: { job_id: job.jobId, state: 'queued' }, message: 'Podcast feed sync queued' });
    } catch (e) {
      if (e instanceof AppError && e.statusCode === 404) return res.status(404).json({ success: false, error: 'Podcast feed not found' });
      return next(e);
    }
  };
  const remove: RequestHandler = async (req, res, next) => {
    const params = feedIdSchema.safeParse(req.params);
    if (!req.user || !params.success || !emptyRequestSchema.safeParse(req.body ?? {}).success || Object.keys(req.query).length) return next(new ValidationError('Invalid podcast feed ID'));
    try { await service.delete(params.data.id); return res.json({ success: true, data: { feed: { id: params.data.id } }, message: 'Podcast feed deleted' }); }
    catch (e) { if (e instanceof AppError && e.statusCode === 404) return res.status(404).json({ success: false, error: 'Podcast feed not found' }); return next(e); }
  };
  return { list, create, sync, remove };
}
