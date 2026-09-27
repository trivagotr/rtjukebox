import type { Environment } from '../../core/config/env.js';
import type { IdentityService } from '../identity/identity.service.js';
import { createLegacyProfileRouter, createUsersRouter } from './users.router.js';
import { UsersService } from './users.service.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import { PrismaUserProfileRepository } from './infra/prisma-user-profile.repository.js';
import { UsersProfileService } from './users-profile.service.js';
import { PrismaPublicUsersRepository } from './infra/prisma-public-users.repository.js';
import type { StorageService } from '../../core/ports/storage.port.js';
import { createUserAvatarRouters } from './user-avatar.router.js';
import { cryptoIdGenerator } from '../../core/infra/crypto-id-generator.js';

export function createUsersModule(client: PrismaClient, identity: IdentityService, environment: Environment, storage: StorageService) {
  const publicUsers = new PrismaPublicUsersRepository(client);
  const service = new UsersService(identity, publicUsers);
  const profileRepository = new PrismaUserProfileRepository(client);
  const profileService = new UsersProfileService(profileRepository, identity, storage, cryptoIdGenerator);
  const avatarRouters = createUserAvatarRouters(profileService, environment);
  return {
    router: createUsersRouter(service, profileService, environment),
    legacyProfileRouter: createLegacyProfileRouter(profileService, environment),
    avatarRouter: avatarRouters.router,
    legacyAvatarRouter: avatarRouters.legacyRouter,
    service,
    profileService,
  };
}
