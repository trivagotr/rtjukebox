import { Router } from 'express';
import { createRadioProfilesController } from './radio-profiles.controller.js';
import type { RadioProfilesService } from './radio-profiles.service.js';

export function createRadioProfilesRouter(service: RadioProfilesService) {
  const router = Router();
  const controller = createRadioProfilesController(service);
  router.get('/', controller.list);
  router.post('/', controller.create);
  router.get('/:id', controller.get);
  router.put('/:id', controller.update);
  router.delete('/:id', controller.remove);
  router.post('/:id/assets', controller.attachAsset);
  router.delete('/:id/assets/:songId/:slotType', controller.detachAsset);
  router.put('/devices/:deviceId/profile', controller.assignDevice);
  router.put('/devices/:deviceId/override', controller.overrideDevice);
  return router;
}
