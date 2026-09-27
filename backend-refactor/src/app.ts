import express, { type Router } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { timingSafeEqual } from 'node:crypto';
import { requestId } from './core/http/request-id.middleware.js';
import { requestLogger } from './core/logging/logger.js';
import type { Environment } from './core/config/env.js';
import { AppError, NotFoundError } from './core/errors/app-error.js';
import { errorHandler } from './core/http/error-handler.js';

export function createApp(apiRouter: Router, environment: Environment, readinessCheck: () => Promise<void>) {
  const app = express();

  app.use(requestId);
  app.use(requestLogger);
  app.use(helmet());
  app.use(cors({
    origin: environment.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-transport', 'x-guest-fingerprint', 'x-kiosk-credential'],
  }));
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

  app.get('/health/live', (_req, res) => res.status(200).json({ status: 'ok' }));
  app.get('/health/ready', async (req, res) => {
    const configured = environment.HEALTHCHECK_TOKEN;
    const supplied = /^Bearer (.+)$/.exec(req.get('authorization') ?? '')?.[1] ?? '';
    if (!configured || !supplied) return res.sendStatus(404);
    const expectedBytes = Buffer.from(configured);
    const suppliedBytes = Buffer.from(supplied);
    if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) {
      return res.sendStatus(404);
    }
    try {
      await readinessCheck();
      return res.status(200).json({ status: 'ready' });
    } catch {
      return res.status(503).json({ status: 'not_ready' });
    }
  });

  app.use('/uploads', express.static(environment.UPLOAD_DIRECTORY, {
    dotfiles: 'deny',
    index: false,
    fallthrough: true,
    maxAge: '1d',
    immutable: true,
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    },
  }));

  app.use('/api/v1', apiRouter);
  app.use((_req, _res, next) => next(new NotFoundError('Route not found')));
  app.use(errorHandler);

  return app;
}
