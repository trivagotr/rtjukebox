import type { RequestHandler } from 'express';
import { NotImplementedError } from '../../core/errors/app-error.js';

export const templateController: RequestHandler = (_req, _res, next) => {
  next(new NotImplementedError('Template controller is not implemented yet'));
};
