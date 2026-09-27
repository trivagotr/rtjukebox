import type { PrismaClient } from '../../../generated/prisma/client.js';
import { PrismaDeviceRepository } from './infra/prisma-device.repository.js';
import { createDevicesRouter } from './devices.router.js';
import { DevicesService } from './devices.service.js';
import { createDevicesAdminRouter } from './devices.admin-router.js';
import type { JukeboxEvents } from '../jukebox/ports/jukebox-events.port.js';

export function createDevicesModule(client: PrismaClient, events?: JukeboxEvents) {
  const repository = new PrismaDeviceRepository(client);
  const service = new DevicesService(repository, events);
  const adminRouter = createDevicesAdminRouter(service);
  const jukeboxRouter = createDevicesRouter(service);
  return { jukeboxRouter, adminRouter, service };
}
