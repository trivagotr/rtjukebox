import { Router } from 'express';
import type { CatalogService } from './catalog.service.js';
import { createCatalogController } from './catalog.controller.js';

export function createCatalogRouter(service: CatalogService) {
  const router = Router();
  router.get('/songs', createCatalogController(service).listSongs);
  return router;
}
