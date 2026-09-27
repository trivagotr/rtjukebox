import { Router } from 'express';
import type { CatalogAdminRepository } from './ports/catalog-admin.repository.js';
import { createCatalogAdminController } from './catalog-admin.controller.js';

import type { SpotifyCatalogProvider } from '../integrations/spotify/ports/spotify-catalog.port.js';

export function createCatalogAdminRouter(repository: CatalogAdminRepository, spotify: SpotifyCatalogProvider) {
  const router = Router();
  const controller = createCatalogAdminController(repository, spotify);
  router.get('/songs', controller.listSongs);
  router.patch('/songs/:id/classification', controller.classify);
  router.delete('/songs/:id', controller.remove);
  router.get('/playlist-preview', controller.playlistPreview);
  return router;
}
