import type { PrismaClient } from '../../../generated/prisma/client.js';
import { PrismaUserRepository } from './infra/prisma-user.repository.js';
import { createIdentityRouter } from './identity.router.js';
import { IdentityService } from './identity.service.js';

export function createIdentityModule(client: PrismaClient) {
  const repository = new PrismaUserRepository(client);
  const service = new IdentityService(repository);

  return {
    router: createIdentityRouter(),
    service,
  };
}
