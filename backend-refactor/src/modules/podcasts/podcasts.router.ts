import { Router } from 'express';
import type { PodcastsService } from './podcasts.service.js';
import { createPodcastsController } from './podcasts.controller.js';

export function createPodcastsRouter(service: PodcastsService) {
  const router = Router();
  router.get('/', createPodcastsController(service).list);
  return router;
}
