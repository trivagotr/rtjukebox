import { Router, type RequestHandler } from 'express';
import multer, { MulterError } from 'multer';
import { AppError } from '../../core/errors/app-error.js';
import { createRequireAuth } from '../../core/auth/auth.middleware.js';
import type { Environment } from '../../core/config/env.js';
import type { UsersProfileService } from './users-profile.service.js';
import { createUsersProfileController } from './users.controller.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
});

function uploadMiddleware(): RequestHandler {
  const parse = upload.single('avatar');
  return (req, res, next) => parse(req, res, (error: unknown) => {
    if (error instanceof MulterError && error.code === 'LIMIT_FILE_SIZE') {
      next(new AppError('Avatar exceeds the 2 MB limit', 413, 'UPLOAD_TOO_LARGE'));
      return;
    }
    if (error instanceof MulterError) {
      next(new AppError('Invalid avatar upload', 400, 'INVALID_UPLOAD'));
      return;
    }
    next(error);
  });
}

export function createUserAvatarRouters(service: UsersProfileService, environment: Environment) {
  const auth = createRequireAuth(environment.JWT_SECRET, environment.JWT_ISSUER, environment.JWT_AUDIENCE, environment.JWT_ALLOW_LEGACY_TOKENS);
  const controller = createUsersProfileController(service);
  const router = Router();
  router.post('/me/avatar', auth, uploadMiddleware(), controller.uploadAvatar);
  const legacyRouter = Router();
  legacyRouter.post('/upload-avatar', auth, uploadMiddleware(), controller.uploadAvatar);
  return { router, legacyRouter };
}
