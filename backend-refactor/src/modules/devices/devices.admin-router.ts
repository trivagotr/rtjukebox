import { Router } from 'express';
import type { DevicesService } from './devices.service.js';
import { createDevicesController } from './devices.controller.js';

export function createDevicesAdminRouter(service: DevicesService) {
  const router = Router();
  const controller = createDevicesController(service);
  router.get('/devices', controller.listAdmin);
  router.post('/devices', controller.createAdmin);
  router.patch('/devices/:id', controller.updateAdmin);
  router.post('/devices/:id/logout-all', controller.logoutAll);
  router.put('/devices/:id/spotify-playback-target', controller.updatePlaybackTarget);
  router.patch('/devices/:id/playback-target', controller.updateGenericPlaybackTarget);
  router.post('/devices/:id/provision', controller.provisionKiosk);
  return router;
}
