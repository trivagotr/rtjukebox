import { Router } from 'express';
import type { RadioService } from './radio.service.js';
import { createRadioController } from './radio.controller.js';

export function createRadioRouter(service: RadioService) {
  const router = Router();
  const controller = createRadioController(service);
  router.get('/status', controller.status);
  router.get('/schedule', controller.schedule);
  router.get('/history/:channelId', controller.history);
  return router;
}
