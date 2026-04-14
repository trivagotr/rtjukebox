import { Router, Request, Response } from 'express';
import { db } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { rbacMiddleware, ROLES } from '../middleware/rbac';
import { sendError, sendSuccess } from '../utils/response';
import { syncPodcastFeed } from '../services/podcastFeeds';

const router = Router();

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

type PodcastFeedSyncFailureResult = {
  feed_id: string;
  status: 'failed';
  error: string;
};

function getFirstString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }

  return undefined;
}

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

function buildSyncFailureResult(feed: PodcastFeedRow, error: unknown): PodcastFeedSyncFailureResult {
  return {
    feed_id: feed.id,
    status: 'failed',
    error: error instanceof Error ? error.message : 'Podcast feed sync failed',
  };
}

router.use(authMiddleware);
router.use(rbacMiddleware([ROLES.ADMIN]));

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
    const payload = normalizePodcastFeedPayload(req.body ?? {});
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

    try {
      const syncResult = await syncPodcastFeed(db, {
        id: feed.id,
        feedUrl: feed.feed_url,
        title: feed.title,
      });

      return sendSuccess(res, { feed, sync: syncResult }, 'Podcast feed created', undefined, 201);
    } catch (error) {
      console.error('Initial podcast feed sync failed:', error);
      return sendSuccess(
        res,
        {
          feed,
          sync: {
            status: 'failed',
          },
        },
        'Podcast feed created; initial sync failed',
        {
          sync_status: 'failed',
        },
        201,
      );
    }
  } catch (error) {
    if (isValidationError(error)) {
      return sendError(res, error.message, 400);
    }

    console.error('Create podcast feed validation or unexpected error:', error);
    return sendError(res, 'Failed to create podcast feed', 500);
  }
});

router.post('/sync', async (req: Request, res: Response) => {
  try {
    const feedId = getFirstString(req.body?.feed_id);
    const feeds = await getPodcastFeedsForSync(db, feedId);

    if (feedId && feeds.length === 0) {
      return sendError(res, 'Podcast feed not found', 404);
    }

    const results: Array<PodcastFeedSyncSuccessResult | PodcastFeedSyncFailureResult> = [];
    let failed = 0;
    for (const feed of feeds) {
      try {
        const result = await syncPodcastFeed(db, {
          id: feed.id,
          feedUrl: feed.feed_url,
          title: feed.title,
        });
        results.push(buildSyncResult(feed, result));
      } catch (error) {
        failed += 1;
        results.push(buildSyncFailureResult(feed, error));
      }
    }

    if (failed > 0) {
      return sendSuccess(
        res,
        { results },
        'Podcast feeds synced with some failures',
        {
          succeeded: results.length - failed,
          failed,
          total: results.length,
        },
      );
    }

    return sendSuccess(res, { results }, 'Podcast feeds synced');
  } catch (error) {
    console.error('Sync podcast feeds error:', error);
    return sendError(res, 'Failed to sync podcast feeds', 500);
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
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
