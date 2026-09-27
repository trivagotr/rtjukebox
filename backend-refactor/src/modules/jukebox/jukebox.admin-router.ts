import { Router } from 'express';
import type { JukeboxService } from './jukebox.service.js';
import { createJukeboxController } from './jukebox.controller.js';

export function createJukeboxAdminRouter(service: JukeboxService) {
  const router = Router();
  router.post('/skip', createJukeboxController(service).adminSkip);
  return router;
}
