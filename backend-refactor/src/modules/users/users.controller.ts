import type { RequestHandler } from 'express';
import { UnauthorizedError } from '../../core/errors/app-error.js';
import { toIdentityUserDto } from '../identity/identity.dto.js';
import type { UsersService } from './users.service.js';
import type { UsersProfileService } from './users-profile.service.js';
import { leaderboardQuerySchema, meQuerySchema, profilePayloadSchema } from './users.schema.js';
import { ValidationError } from '../../core/errors/app-error.js';

export function createUsersController(service: UsersService, profileService?: UsersProfileService) {
  const me: RequestHandler = async (req, res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    const query = meQuerySchema.safeParse(req.query);
    if (!query.success) return next(new ValidationError('Invalid user include query'));
    try {
      const user = await service.getCurrentUser(req.user.userId);
      const profile = query.data.include === 'profile' && profileService
        ? await profileService.getMyProfile(req.user.userId)
        : null;
      return res.json({ success: true, data: { user: toIdentityUserDto(user), ...(profile ? { profile: profile.profile, badges: profile.badges } : {}) } });
    } catch (error) { return next(error); }
  };
  const leaderboard: RequestHandler = async (req, res, next) => {
    const parsed = leaderboardQuerySchema.safeParse(req.query);
    if (!parsed.success) return next(new ValidationError('Only the total leaderboard is available'));
    try {
      return res.json({ success: true, data: await service.getLeaderboard(), message: 'Leaderboard fetched' });
    } catch (error) { return next(error); }
  };
  return { me, leaderboard };
}

export function createUsersProfileController(service: UsersProfileService) {
  const get: RequestHandler = async (req, res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    if (Object.keys(req.query).length) return next(new ValidationError('Unexpected profile query parameters'));
    try {
      return res.json({ success: true, data: await service.getMyProfile(req.user.userId), message: 'Profile fetched' });
    } catch (error) { return next(error); }
  };
  const update: RequestHandler = async (req, res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    if (Object.keys(req.query).length) return next(new ValidationError('Unexpected profile query parameters'));
    const parsed = profilePayloadSchema.safeParse(req.body ?? {});
    if (!parsed.success) return next(new ValidationError('Invalid profile payload'));
    try {
      const profile = await service.updateMyProfile(req.user.userId, parsed.data);
      return res.json({ success: true, data: { profile }, message: 'Profile updated' });
    } catch (error) { return next(error); }
  };
  const uploadAvatar: RequestHandler = async (req, res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    if (!req.file || Object.keys(req.body ?? {}).length || Object.keys(req.query).length) return next(new ValidationError('One avatar image file is required'));
    try { return res.json({ success: true, data: await service.uploadAvatar(req.user.userId, req.file.buffer), message: 'Avatar uploaded' }); }
    catch (error) { return next(error); }
  };
  return { get, update, uploadAvatar };
}
