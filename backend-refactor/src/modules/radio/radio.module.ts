import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { Environment } from '../../core/config/env.js';
import { PrismaRadioRepository } from './infra/prisma-radio.repository.js';
import { createRadioRouter } from './radio.router.js';
import { RadioService } from './radio.service.js';
import { PrismaRadioProfilesRepository } from './infra/prisma-radio-profiles.repository.js';
import { RadioProfilesService } from './radio-profiles.service.js';
import { createRadioProfilesRouter } from './radio-profiles.router.js';

export function createRadioModule(client: PrismaClient, environment: Environment) {
  const repository = new PrismaRadioRepository(client);
  const service = new RadioService(repository, environment.RADIO_STREAM_URL ?? 'https://stream.radiotedu.com/live');
  const radioProfilesService = new RadioProfilesService(new PrismaRadioProfilesRepository(client));
  return { router: createRadioRouter(service), service, radioProfilesRouter: createRadioProfilesRouter(radioProfilesService), radioProfilesService };
}
