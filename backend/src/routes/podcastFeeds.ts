import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { rbacMiddleware, ROLES } from '../middleware/rbac';
import { sendError, sendSuccess } from '../utils/response';
import { syncPodcastFeed } from '../services/podcastFeeds';
import { adminRateLimit } from '../middleware/rateLimits';
import { adminAuditLog } from '../middleware/adminAudit';
import { BackgroundJobsUnavailableError, enqueueBackgroundJob } from '../services/backgroundJobs';

const router = Router();
const createFeedSchema = z.object({
  title: z.string().trim().min(1).max(160),
  feed_url: z.string().trim().url().max(2048),
}).strict();
const syncFeedsSchema = z.object({ feed_id: z.string().uuid().optional() }).strict();

type PodcastFeedRow = {
  id: string;
  title: string | null;
  feed_url: string;
  is_active: boolean;
  last_synced_at: string | null;
  last_sync_error: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type PodcastFeedSyncSuccessResult = {
  feed_id: string;
  status: 'synced';
  processed: number;
  upserted: number;
  skipped: number;
};

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function isValidationError(error: unknown): error is Error {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message === 'title is required'
    || error.message === 'feed_url must start with http or https';
}

function isFeedUrlConflictError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { code?: unknown; constraint?: unknown };
  return candidate.code === '23505' && candidate.constraint === 'podcast_feeds_feed_url_key';
}

export function normalizePodcastFeedPayload(input: {
  title?: unknown;
  feed_url?: unknown;
}) {
  const title = normalizeText(input.title);
  if (!title) {
    throw new Error('title is required');
  }

  const feedUrl = normalizeText(input.feed_url);
  if (!/^https?:\/\//i.test(feedUrl)) {
    throw new Error('feed_url must start with http or https');
  }

  return {
    title,
    feedUrl,
  };
}

async function listPodcastFeeds(dbClient = db) {
  const result = await dbClient.query(
    `SELECT *
     FROM podcast_feeds
     ORDER BY created_at DESC NULLS LAST, updated_at DESC NULLS LAST, id DESC`,
  );

  return result.rows as PodcastFeedRow[];
}

async function createPodcastFeed(
  dbClient = db,
  payload: ReturnType<typeof normalizePodcastFeedPayload>,
  createdBy: string | null,
) {
  const result = await dbClient.query(
    `INSERT INTO podcast_feeds (title, feed_url, created_by)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [payload.title, payload.feedUrl, createdBy],
  );

  return result.rows[0] as PodcastFeedRow;
}

async function deletePodcastFeed(dbClient = db, feedId: string) {
  const result = await dbClient.query(
    `DELETE FROM podcast_feeds
     WHERE id = $1
     RETURNING id`,
    [feedId],
  );

  return result.rows[0] as { id: string } | undefined;
}

async function getPodcastFeedsForSync(dbClient = db, feedId?: string) {
  if (feedId) {
    const result = await dbClient.query(
      `SELECT *
       FROM podcast_feeds
       WHERE id = $1
       ORDER BY created_at DESC NULLS LAST`,
      [feedId],
    );

    return result.rows as PodcastFeedRow[];
  }

  return listPodcastFeeds(dbClient);
}

function buildSyncResult(
  feed: PodcastFeedRow,
  result: { processed: number; upserted: number; skipped: number },
): PodcastFeedSyncSuccessResult {
  return {
    feed_id: feed.id,
    status: 'synced',
    processed: result.processed,
    upserted: result.upserted,
    skipped: result.skipped,
  };
}

export async function runPodcastFeedSyncJob(feedId?: string, updateProgress?: (progress: number) => Promise<void>) {
  const feeds = await getPodcastFeedsForSync(db, feedId);
  const results: Array<PodcastFeedSyncSuccessResult | { feed_id: string; status: 'failed' }> = [];
  let failed = 0;
  for (let index = 0; index < feeds.length; index += 1) {
    const feed = feeds[index];
    try {
      const result = await syncPodcastFeed(db, {
        id: feed.id,
        feedUrl: feed.feed_url,
        title: feed.title,
      });
      results.push(buildSyncResult(feed, result));
    } catch (error) {
      failed += 1;
      console.error(JSON.stringify({ level: 'error', event: 'podcast_feed_job_failed', feedId: feed.id, errorName: error instanceof Error ? error.name : 'Error' }));
      results.push({ feed_id: feed.id, status: 'failed' });
    }
    if (updateProgress) await updateProgress(feeds.length ? Math.round(((index + 1) / feeds.length) * 100) : 100);
  }
  return { results, succeeded: results.length - failed, failed, total: results.length };
}

router.use(authMiddleware);
router.use(rbacMiddleware([ROLES.ADMIN]));
router.use(adminRateLimit);
router.use(adminAuditLog);

router.get('/', async (_req: Request, res: Response) => {
  try {
    const feeds = await listPodcastFeeds(db);
    return sendSuccess(res, { feeds }, 'Podcast feeds fetched');
  } catch (error) {
    console.error('List podcast feeds error:', error);
    return sendError(res, 'Failed to fetch podcast feeds', 500);
  }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const parsedBody = createFeedSchema.safeParse(req.body);
    if (!parsedBody.success) return sendError(res, 'Invalid podcast feed payload', 400, 'INVALID_PODCAST_FEED');
    const payload = normalizePodcastFeedPayload(parsedBody.data);
    let feed: PodcastFeedRow;

    try {
      feed = await createPodcastFeed(db, payload, req.user?.id ?? null);
    } catch (error) {
      if (isFeedUrlConflictError(error)) {
        return sendError(res, 'Podcast feed URL already exists', 409);
      }

      console.error('Create podcast feed database error:', error);
      return sendError(res, 'Failed to create podcast feed', 500);
    }

    let syncJobId: string | null = null;
    try {
      const job = await enqueueBackgroundJob('podcast-feed-sync', {
        requestedBy: req.user!.id,
        feedId: feed.id,
      });
      syncJobId = String(job.id);
    } catch (error) {
      console.error('Initial podcast feed sync could not be queued:', error instanceof Error ? error.name : 'Error');
    }
    return sendSuccess(res, { feed, sync_job_id: syncJobId }, 'Podcast feed created', undefined, 201);
  } catch (error) {
    if (isValidationError(error)) {
      return sendError(res, error.message, 400);
    }

    console.error('Create podcast feed validation or unexpected error:', error);
    return sendError(res, 'Failed to create podcast feed', 500);
  }
});

router.post('/sync', async (req: Request, res: Response) => {
  const parsedBody = syncFeedsSchema.safeParse(req.body ?? {});
  if (!parsedBody.success) return sendError(res, 'Invalid podcast sync request', 400, 'INVALID_PODCAST_SYNC_REQUEST');
  const feedId = parsedBody.data.feed_id;
  try {
    if (feedId) {
      const feeds = await getPodcastFeedsForSync(db, feedId);
      if (feeds.length === 0) {
      return sendError(res, 'Podcast feed not found', 404);
      }
    }
    const job = await enqueueBackgroundJob('podcast-feed-sync', {
      requestedBy: (req as AuthRequest).user!.id,
      feedId,
    });
    return sendSuccess(res, { job_id: String(job.id), state: 'queued' }, 'Podcast feed sync queued', undefined, 202);
  } catch (error) {
    if (error instanceof BackgroundJobsUnavailableError) return sendError(res, error.message, 503, 'JOBS_UNAVAILABLE');
    console.error('Sync podcast feeds error:', error);
    return sendError(res, 'Failed to sync podcast feeds', 500);
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  if (!z.string().uuid().safeParse(req.params.id).success) {
    return sendError(res, 'Invalid podcast feed ID', 400, 'INVALID_PODCAST_FEED_ID');
  }
  try {
    const feed = await deletePodcastFeed(db, req.params.id);
    if (!feed) {
      return sendError(res, 'Podcast feed not found', 404);
    }

    return sendSuccess(res, { feed }, 'Podcast feed deleted');
  } catch (error) {
    console.error('Delete podcast feed error:', error);
    return sendError(res, 'Failed to delete podcast feed', 500);
  }
});

export default router;
