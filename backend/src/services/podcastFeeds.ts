import axios from 'axios';
import crypto from 'crypto';
import { XMLParser } from 'fast-xml-parser';
import { db } from '../db';

type QueryResult = { rows: any[] };

export type PodcastDbClient = {
  query: (sql: string, params?: unknown[]) => Promise<QueryResult>;
  pool?: {
    connect: () => Promise<{
      query: (sql: string, params?: unknown[]) => Promise<QueryResult>;
      release: () => void;
    }>;
  };
};

export interface PodcastFeed {
  id: string;
  feedUrl: string;
  title?: string | null;
}

export interface SyncPodcastFeedResult {
  processed: number;
  upserted: number;
  skipped: number;
}

export interface ListPodcastEpisodesOptions {
  page: number;
  perPage: number;
}

type RawRssItem = Record<string, unknown>;

type PodcastEpisodeRow = {
  id: string;
  guid: string | null;
  episode_url: string | null;
  audio_url: string | null;
};

type NormalizedPodcastEpisode = {
  guid: string | null;
  episodeUrl: string | null;
  audioUrl: string | null;
  title: string;
  description: string | null;
  imageUrl: string | null;
  publishedAt: Date | null;
  author: string | null;
  durationSeconds: number | null;
};

type EpisodeIdentityColumn = 'guid' | 'audio_url' | 'episode_url';

const EPISODE_IDENTITY_COLUMNS: EpisodeIdentityColumn[] = ['guid', 'audio_url', 'episode_url'];
const RSS_REQUEST_TIMEOUT_MS = 15_000;

const RSS_PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: true,
});

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function firstString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const stringValue = firstString(entry);
      if (stringValue) {
        return stringValue;
      }
    }
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record['#text'] === 'string') {
      return firstString(record['#text']);
    }
    if (typeof record.text === 'string') {
      return firstString(record.text);
    }
  }

  return null;
}

function firstObject(value: unknown): Record<string, unknown> | null {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const objectValue = firstObject(entry);
      if (objectValue) {
        return objectValue;
      }
    }

    return null;
  }

  if (typeof value === 'object') {
    return value as Record<string, unknown>;
  }

  return null;
}

function parseDate(value: unknown): Date | null {
  const text = firstString(value);
  if (!text) {
    return null;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDurationSeconds(value: unknown): number | null {
  const text = firstString(value);
  if (!text) {
    return null;
  }

  if (text.includes(':')) {
    const parts = text.split(':').map((part) => Number.parseInt(part, 10));
    if (parts.some((part) => Number.isNaN(part))) {
      return null;
    }

    return parts.reduce((total, part) => total * 60 + part, 0);
  }

  const parsed = Number.parseInt(text, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractImageUrl(value: unknown): string | null {
  const imageValue = firstObject(value);
  if (!imageValue) {
    return firstString(value);
  }

  return (
    firstString(imageValue.href) ??
    firstString(imageValue.url) ??
    firstString(imageValue['#text']) ??
    firstString(imageValue.text)
  );
}

function derivePodcastFeedLockKey(feedId: string): string {
  const hash = crypto.createHash('sha256').update(`podcast-feed:${feedId}`).digest();
  return hash.readBigInt64BE(0).toString();
}

function getEnclosureAudioUrl(item: RawRssItem): string | null {
  const enclosure = item.enclosure;
  const enclosureValue = Array.isArray(enclosure) ? enclosure[0] : enclosure;

  if (!enclosureValue || typeof enclosureValue !== 'object') {
    return null;
  }

  const url = (enclosureValue as Record<string, unknown>).url;
  return firstString(url);
}

function normalizePodcastEpisode(item: RawRssItem): NormalizedPodcastEpisode {
  const guid = firstString(item.guid);
  const episodeUrl = firstString(item.link);
  const audioUrl = getEnclosureAudioUrl(item);
  const title = firstString(item.title) ?? episodeUrl ?? guid ?? 'Untitled episode';
  const publishedAt = parseDate(item.pubDate);

  return {
    guid,
    episodeUrl,
    audioUrl,
    title,
    description: firstString(item.description),
    imageUrl: extractImageUrl(item['itunes:image']) ?? extractImageUrl(item.image),
    publishedAt,
    author: firstString(item.author) ?? firstString(item['itunes:author']),
    durationSeconds: parseDurationSeconds(item['itunes:duration']),
  };
}

function getIdentityValue(episode: NormalizedPodcastEpisode, column: EpisodeIdentityColumn): string | null {
  if (column === 'guid') {
    return episode.guid;
  }

  if (column === 'audio_url') {
    return episode.audioUrl;
  }

  return episode.episodeUrl;
}

function getIdentityPriority(episode: NormalizedPodcastEpisode): EpisodeIdentityColumn[] {
  return EPISODE_IDENTITY_COLUMNS.filter((column) => Boolean(getIdentityValue(episode, column)));
}

function pickCanonicalEpisodeRow(
  rows: PodcastEpisodeRow[],
  episode: NormalizedPodcastEpisode,
): PodcastEpisodeRow | null {
  for (const column of getIdentityPriority(episode)) {
    const identityValue = getIdentityValue(episode, column);
    if (!identityValue) {
      continue;
    }

    const match = rows.find((row) => row[column] === identityValue);
    if (match) {
      return match;
    }
  }

  return null;
}

async function resolvePodcastEpisodeTarget(
  dbClient: PodcastDbClient,
  feedId: string,
  episode: NormalizedPodcastEpisode,
): Promise<{ canonicalRow: PodcastEpisodeRow | null; duplicateIds: string[] }> {
  const result = await dbClient.query(
    `SELECT id, guid, audio_url, episode_url
     FROM podcast_episodes
     WHERE feed_id = $1
       AND (
         ($2::text IS NOT NULL AND guid = $2)
         OR ($3::text IS NOT NULL AND audio_url = $3)
         OR ($4::text IS NOT NULL AND episode_url = $4)
       )
     ORDER BY created_at DESC`,
    [feedId, episode.guid, episode.audioUrl, episode.episodeUrl],
  );

  const rows = result.rows as PodcastEpisodeRow[];
  const canonicalRow = pickCanonicalEpisodeRow(rows, episode);
  const duplicateIds = rows
    .filter((row) => row.id !== canonicalRow?.id)
    .map((row) => row.id);

  return { canonicalRow, duplicateIds };
}

async function upsertPodcastEpisodeInTransaction(
  dbClient: PodcastDbClient,
  feedId: string,
  episode: NormalizedPodcastEpisode,
): Promise<void> {
  const identityValues = getIdentityPriority(episode);
  if (identityValues.length === 0) {
    return;
  }

  const params = [
    feedId,
    episode.guid,
    episode.episodeUrl,
    episode.audioUrl,
    episode.title,
    episode.description,
    episode.imageUrl,
    episode.publishedAt,
    episode.author,
    episode.durationSeconds,
  ];

  const { canonicalRow, duplicateIds } = await resolvePodcastEpisodeTarget(dbClient, feedId, episode);

  if (duplicateIds.length > 0) {
    await dbClient.query(
      `DELETE FROM podcast_episodes
       WHERE id = ANY($1::uuid[])`,
      [duplicateIds],
    );
  }

  if (canonicalRow) {
    await dbClient.query(
      `UPDATE podcast_episodes
       SET feed_id = $2,
           guid = $3,
           episode_url = $4,
           audio_url = $5,
           title = $6,
           description = $7,
           image_url = $8,
           published_at = $9,
           author = $10,
           duration_seconds = $11,
           updated_at = NOW()
       WHERE id = $1`,
      [canonicalRow.id, ...params],
    );
    return;
  }

  await dbClient.query(
    `INSERT INTO podcast_episodes (
      feed_id,
      guid,
      episode_url,
      audio_url,
      title,
      description,
      image_url,
      published_at,
      author,
      duration_seconds,
      created_at,
      updated_at
    ) VALUES (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8,
      $9,
      $10,
      NOW(),
      NOW()
    )`,
    params,
  );
}

async function withPodcastFeedLock<T>(
  dbClient: PodcastDbClient,
  feedId: string,
  run: (txClient: Pick<PodcastDbClient, 'query'>) => Promise<T>,
): Promise<T> {
  const pool = dbClient.pool;
  if (!pool?.connect) {
    return run(dbClient);
  }

  const client = await pool.connect();
  const lockKey = derivePodcastFeedLockKey(feedId);
  try {
    await client.query('SELECT pg_advisory_lock($1::bigint)', [lockKey]);
    try {
      return await run(client);
    } finally {
      await client.query('SELECT pg_advisory_unlock($1::bigint)', [lockKey]);
    }
  } catch (error) {
    throw error;
  } finally {
    client.release();
  }
}

function extractRssItems(xml: string): RawRssItem[] {
  const parsed = RSS_PARSER.parse(xml) as {
    rss?: {
      channel?: {
        item?: RawRssItem | RawRssItem[];
      };
    };
  };

  return asArray(parsed.rss?.channel?.item);
}

export async function syncPodcastFeed(
  dbClient: PodcastDbClient = db,
  feed: PodcastFeed,
): Promise<SyncPodcastFeedResult> {
  return withPodcastFeedLock(dbClient, feed.id, async (client) => {
    let processed = 0;
    let upserted = 0;
    let skipped = 0;
    let transactionActive = false;

    try {
      const response = await axios.get(feed.feedUrl, {
        responseType: 'text',
        timeout: RSS_REQUEST_TIMEOUT_MS,
      });

      await client.query('BEGIN');
      transactionActive = true;

      const items = extractRssItems(String(response.data ?? ''));
      for (const item of items) {
        processed += 1;
        const episode = normalizePodcastEpisode(item);

        if (!episode.audioUrl) {
          skipped += 1;
          continue;
        }

        await upsertPodcastEpisodeInTransaction(client, feed.id, episode);
        upserted += 1;
      }

      await client.query(
        `UPDATE podcast_feeds
         SET last_synced_at = NOW(),
             last_sync_error = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [feed.id],
      );

      await client.query('COMMIT');
      transactionActive = false;

      return { processed, upserted, skipped };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Podcast feed sync failed';

      if (transactionActive) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Preserve the original error if rollback fails.
        }
        transactionActive = false;
      }

      await client.query('BEGIN');
      try {
        await client.query(
          `UPDATE podcast_feeds
           SET last_sync_error = $2,
               updated_at = NOW()
           WHERE id = $1`,
          [feed.id, message],
        );
        await client.query('COMMIT');
      } catch (statusError) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Preserve the original sync error below.
        }
        throw statusError;
      }

      throw error;
    }
  });
}

export async function listPodcastEpisodes(
  dbClient: PodcastDbClient = db,
  options: Partial<ListPodcastEpisodesOptions> = {},
): Promise<any[]> {
  const page = Number.isFinite(options.page) ? Math.max(1, Math.trunc(options.page ?? 1)) : 1;
  const perPage = Number.isFinite(options.perPage) ? Math.max(1, Math.trunc(options.perPage ?? 25)) : 25;
  const offset = (page - 1) * perPage;

  const result = await dbClient.query(
    `SELECT
      pe.*,
      pf.title AS feed_title,
      pf.feed_url
     FROM podcast_episodes pe
     INNER JOIN podcast_feeds pf ON pf.id = pe.feed_id
     WHERE pf.is_active = true
     ORDER BY pe.published_at DESC NULLS LAST, pe.created_at DESC
     LIMIT $1 OFFSET $2`,
    [perPage, offset],
  );

  return result.rows;
}
