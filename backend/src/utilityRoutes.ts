import { Express, Request, Response } from 'express';
import { timingSafeEqual } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { db } from './db';
import { isRateLimitRedisReady } from './middleware/rateLimits';

function hasValidHealthToken(req: Request) {
  const expected = process.env.HEALTHCHECK_TOKEN?.trim();
  const authorization = req.get('authorization') || '';
  const supplied = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!expected || !supplied) return false;

  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export function registerUtilityRoutes(app: Express) {
  const sendNoContent = (_req: Request, res: Response) => {
    res.status(204).end();
  };

  app.get('/favicon.ico', sendNoContent);
  app.get('/.well-known/appspecific/com.chrome.devtools.json', sendNoContent);

  const live = (_req: Request, res: Response) => res.json({ status: 'ok' });
  app.get('/health', live);
  app.get('/health/live', live);
  app.get('/health/ready', async (req, res) => {
    if (!hasValidHealthToken(req)) return res.sendStatus(404);

    try {
      await db.query('SELECT 1');
      await fs.access(path.join(__dirname, '../uploads'), fs.constants.W_OK);
      if (!isRateLimitRedisReady()) return res.sendStatus(503);
      return res.json({ status: 'ok' });
    } catch {
      return res.sendStatus(503);
    }
  });
}
