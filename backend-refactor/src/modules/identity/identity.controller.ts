import type { RequestHandler } from 'express';
import { NotImplementedError } from '../../core/errors/app-error.js';

const notImplemented: RequestHandler = (_req, _res, next) => {
  next(new NotImplementedError('Identity endpoint is not implemented yet'));
};

export const identityController = {
  register: notImplemented,
  login: notImplemented,
};
