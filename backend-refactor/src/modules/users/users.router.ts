import { Router } from 'express';
import { createRequireAuth } from '../../core/auth/auth.middleware.js';
import type { Environment } from '../../core/config/env.js';
import type { UsersService } from './users.service.js';
import { createUsersController } from './users.controller.js';
import type { UsersProfileService } from './users-profile.service.js';
import { createUsersProfileController } from './users.controller.js';

export function createUsersRouter(service: UsersService, profileService: UsersProfileService, environment: Environment) {
  const router = Router();
  const userController = createUsersController(service, profileService);
  router.get('/leaderboard', userController.leaderboard);
  router.use(createRequireAuth(environment.JWT_SECRET, environment.JWT_ISSUER, environment.JWT_AUDIENCE, environment.JWT_ALLOW_LEGACY_TOKENS));
  router.get('/me', userController.me);
  const profile = createUsersProfileController(profileService);
  router.patch('/me', profile.update);
  router.get('/me/profile', profile.get);
  router.patch('/me/profile', profile.update);
  router.patch('/me/favorites', profile.update);
  return router;
}

export function createLegacyProfileRouter(service: UsersProfileService, environment: Environment) {
  const router = Router();
  router.use(createRequireAuth(environment.JWT_SECRET, environment.JWT_ISSUER, environment.JWT_AUDIENCE, environment.JWT_ALLOW_LEGACY_TOKENS));
  const profile = createUsersProfileController(service);
  router.get('/me', profile.get);
  router.patch('/me', profile.update);
  router.patch('/favorites', profile.update);
  return router;
}
