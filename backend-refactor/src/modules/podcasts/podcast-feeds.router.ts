import { Router } from 'express';
import type { JobQueue } from '../../core/ports/job-queue.port.js';
import { createPodcastFeedsController } from './podcast-feeds.controller.js';
import type { PodcastFeedsService } from './podcast-feeds.service.js';

export function createPodcastFeedsRouter(service: PodcastFeedsService, jobs: JobQueue) {
  const router = Router();
  const controller = createPodcastFeedsController(service, jobs);
  router.get('/', controller.list);
  router.post('/', controller.create);
  router.post('/sync', controller.sync);
  router.delete('/:id', controller.remove);
  return router;
}
