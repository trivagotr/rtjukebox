import type { RequestHandler } from 'express';
import { ValidationError } from '../../core/errors/app-error.js';
import { catalogQuerySchema } from './catalog.schema.js';
import type { CatalogService } from './catalog.service.js';

export function createCatalogController(service: CatalogService) {
  const listSongs: RequestHandler = async (req, res, next) => {
    const parsed = catalogQuerySchema.safeParse(req.query);
    if (!parsed.success) return next(new ValidationError('Invalid catalog search parameters'));
    try {
      return res.json({ success: true, data: await service.listSongs(parsed.data) });
    } catch (error) { return next(error); }
  };
  return { listSongs };
}
