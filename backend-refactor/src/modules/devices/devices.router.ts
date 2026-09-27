import { Router } from 'express';
import type { DevicesService } from './devices.service.js';
import { createDevicesController } from './devices.controller.js';

export function createDevicesRouter(service: DevicesService) {
  const router = Router();
  const controller = createDevicesController(service);
  router.get('/devices', controller.list);
  router.post('/kiosk/register', controller.registerKiosk);
  return router;
}
