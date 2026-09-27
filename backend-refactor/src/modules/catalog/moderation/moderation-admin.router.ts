import { Router } from 'express';
import type { ModerationAdminService } from './moderation-admin.service.js';
import { createModerationAdminController } from './moderation-admin.controller.js';

export function createModerationAdminRouter(service: ModerationAdminService) {
  const router = Router();
  const c = createModerationAdminController(service);
  router.post('/songs/:id/block', c.blockSong);
  router.delete('/songs/:id/block', c.unblockSong);
  router.post('/artists/block', c.blockArtist);
  router.delete('/artists/:id/block', c.unblockArtist);
  router.get('/blocked', c.blocked);
  router.get('/moderation/settings', c.getSettings);
  router.put('/moderation/settings', c.updateSettings);
  router.get('/moderation/keywords', c.keywords);
  router.post('/moderation/keywords', c.addKeyword);
  router.delete('/moderation/keywords/:id', c.removeKeyword);
  router.post('/moderation/test', c.test);
  return router;
}
