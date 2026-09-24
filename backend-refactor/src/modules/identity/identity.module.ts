import type { PrismaClient } from '../../../generated/prisma/client.js';
import { PrismaUserRepository } from './infra/prisma-user.repository.js';
import { createIdentityRouter } from './identity.router.js';
import { IdentityService } from './identity.service.js';
import type { Environment } from '../../core/config/env.js';

export function createIdentityModule(client: PrismaClient, environment: Environment) {
  const repository = new PrismaUserRepository(client);
  const service = new IdentityService(repository, environment.JWT_SECRET, environment.JWT_REFRESH_SECRET);

  return {
    router: createIdentityRouter(service),
    service,
  };
}
