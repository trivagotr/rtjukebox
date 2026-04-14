import { Router, Request, Response } from 'express';
import { db } from '../db';
import { sendError, sendSuccess } from '../utils/response';

const router = Router();

function getFirstString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }

  return undefined;
}

function parseClampedInteger(value: unknown, fallback: number, min: number, max: number) {
  const raw = getFirstString(value);
  if (raw === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function stripHtml(value: unknown): string {
  return String(value ?? '').replace(/<[^>]*>?/gm, '').trim();
}

export function normalizePodcastListQuery(input: {
  page?: unknown;
  per_page?: unknown;
}) {
  const page = parseClampedInteger(input.page, 1, 1, Number.MAX_SAFE_INTEGER);
  const perPage = parseClampedInteger(input.per_page, 10, 1, 50);

  return {
    page,
    perPage,
  };
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const { page, perPage } = normalizePodcastListQuery(req.query);
    const offset = (page - 1) * perPage;

    const totalResult = await db.query(
      `SELECT COUNT(*)::int AS total
       FROM podcast_episodes pe
       INNER JOIN podcast_feeds pf ON pf.id = pe.feed_id
       WHERE pf.is_active = true`,
    );

    const episodesResult = await db.query(
      `SELECT
         pe.id,
         pe.title,
         pe.description,
         pe.audio_url,
         pe.episode_url,
         pe.image_url,
         pe.published_at,
         pf.title AS feed_title
       FROM podcast_episodes pe
       INNER JOIN podcast_feeds pf ON pf.id = pe.feed_id
       WHERE pf.is_active = true
       ORDER BY pe.published_at DESC NULLS LAST, pe.created_at DESC
       LIMIT $1 OFFSET $2`,
      [perPage, offset],
    );

    const total = Number(totalResult.rows[0]?.total ?? 0);
    const items = episodesResult.rows.map((row: any) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      excerpt: stripHtml(row.description),
      audio_url: row.audio_url,
      episode_url: row.episode_url,
      external_url: row.external_url ?? row.episode_url ?? row.audio_url ?? null,
      featured_image: row.image_url ?? null,
      image_url: row.image_url ?? null,
      published_at: row.published_at,
      feed_title: row.feed_title,
    }));

    return sendSuccess(res, {
      items,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / perPage),
    });
  } catch (error) {
    console.error('Podcast list error:', error);
    return sendError(res, 'Failed to fetch podcasts', 500);
  }
});

export default router;
