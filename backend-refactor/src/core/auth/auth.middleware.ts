import type { RequestHandler } from 'express';
import { NotImplementedError } from '../errors/app-error.js';
import type { Role } from './auth.types.js';

export const requireAuth: RequestHandler = (_req, _res, next) => {
  next(new NotImplementedError('Authentication guard is not wired yet'));
};

export const requireRole = (..._roles: Role[]): RequestHandler => (_req, _res, next) => {
  next(new NotImplementedError('Role guard is not wired yet'));
};
