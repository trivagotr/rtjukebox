import type { RequestHandler } from 'express';
import { ValidationError } from '../../core/errors/app-error.js';
import { normalizePodcastListQuery, podcastListQuerySchema } from './podcasts.schema.js';
import type { PodcastsService } from './podcasts.service.js';

export function createPodcastsController(service: PodcastsService) {
  const list: RequestHandler = async (req, res, next) => {
    const parsed = podcastListQuerySchema.safeParse(req.query);
    if (!parsed.success) return next(new ValidationError('Invalid podcast pagination query'));
    const { page, perPage } = normalizePodcastListQuery(parsed.data);
    try {
      const result = await service.listEpisodes(page, perPage);
      return res.json({ success: true, data: result });
    } catch (error) { return next(error); }
  };
  return { list };
}
