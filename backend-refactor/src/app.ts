import express, { type Router } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { requestId } from './core/http/request-id.middleware.js';
import { requestLogger } from './core/logging/logger.js';
import type { Environment } from './core/config/env.js';
import { AppError, NotFoundError } from './core/errors/app-error.js';
import { errorHandler } from './core/http/error-handler.js';

export function createApp(apiRouter: Router, environment: Environment) {
  const app = express();

  app.use(requestId);
  app.use(requestLogger);
  app.use(helmet());
  app.use(cors({ origin: environment.CORS_ORIGINS }));
  app.use(express.json({ limit: '1mb' }));
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_req, _res, next) => {
        next(new AppError('Too many requests', 429, 'RATE_LIMITED'));
      },
    }),
  );

  app.use('/api/v1', apiRouter);
  app.use((_req, _res, next) => next(new NotFoundError('Route not found')));
  app.use(errorHandler);

  return app;
}
