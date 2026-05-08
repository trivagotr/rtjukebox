# Admin-Managed RSS Podcast Registry Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a central RSS podcast registry where admins add feeds once and mobile plus Android Auto clients consume the same normalized episode catalog.

**Architecture:** `podcast_feeds` and `podcast_episodes` become the backend source of truth. RSS XML is parsed and normalized into playable episode rows on the server; admin-only feed CRUD/sync endpoints manage that data, and the mobile client stops using local AsyncStorage feed state and reads only from backend APIs.

**Tech Stack:** TypeScript, Express, PostgreSQL, Vitest, React Native, Jest, Axios, fast-xml-parser

---

### Task 1: Add persistent podcast feed and episode tables

**Files:**
- Modify: `backend/src/db/schema.sql`
- Modify: `backend/src/db/migrate.test.ts`

**Step 1: Write the failing test**

Add this case to `backend/src/db/migrate.test.ts`:

```ts
it('includes podcast feed registry tables in the schema', () => {
  const schemaSql = loadSchemaSql();

  expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS podcast_feeds');
  expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS podcast_episodes');
  expect(schemaSql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_podcast_episodes_feed_guid_unique');
  expect(schemaSql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_podcast_episodes_feed_audio_url_unique');
  expect(schemaSql).toContain('CREATE INDEX IF NOT EXISTS idx_podcast_episodes_published_at');
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/db/migrate.test.ts`
Expected: FAIL because the podcast table/index strings do not exist in `schema.sql`.

**Step 3: Write minimal implementation**

Add these tables and indexes to `backend/src/db/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS podcast_feeds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255),
    feed_url TEXT NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_synced_at TIMESTAMP,
    last_sync_error TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS podcast_episodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feed_id UUID NOT NULL REFERENCES podcast_feeds(id) ON DELETE CASCADE,
    guid TEXT,
    episode_url TEXT,
    audio_url TEXT,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    image_url TEXT,
    published_at TIMESTAMP,
    author VARCHAR(255),
    duration_seconds INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_podcast_episodes_feed_guid_unique
    ON podcast_episodes(feed_id, guid) WHERE guid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_podcast_episodes_feed_audio_url_unique
    ON podcast_episodes(feed_id, audio_url) WHERE audio_url IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_podcast_episodes_feed_episode_url_unique
    ON podcast_episodes(feed_id, episode_url) WHERE episode_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_podcast_episodes_published_at
    ON podcast_episodes(published_at DESC);
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/db/migrate.test.ts`
Expected: PASS with the new podcast schema assertions included.

**Step 5: Commit**

```bash
git add backend/src/db/schema.sql backend/src/db/migrate.test.ts
git commit -m "feat: add podcast rss registry tables"
```

### Task 2: Build the backend RSS sync and listing service

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/package-lock.json`
- Create: `backend/src/services/podcastFeeds.ts`
- Test: `backend/src/services/podcastFeeds.test.ts`

**Step 1: Write the failing test**

Create `backend/src/services/podcastFeeds.test.ts` with service-level coverage:

```ts
import { describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { listPodcastEpisodes, syncPodcastFeed } from './podcastFeeds';

vi.mock('axios');

describe('podcast feed sync service', () => {
  it('normalizes playable RSS items and skips items without audio', async () => {
    const xml = `<?xml version="1.0"?>
      <rss><channel><title>RadioTEDU</title>
        <item>
          <guid>ep-1</guid>
          <title>Episode 1</title>
          <link>https://example.com/episode-1</link>
          <pubDate>Tue, 14 Apr 2026 10:00:00 GMT</pubDate>
          <enclosure url="https://cdn.example.com/episode-1.mp3" type="audio/mpeg" />
        </item>
        <item>
          <guid>ep-2</guid>
          <title>Episode 2</title>
        </item>
      </channel></rss>`;

    vi.mocked(axios.get).mockResolvedValue({ data: xml } as any);

    const dbClient = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const result = await syncPodcastFeed(dbClient as any, {
      id: 'feed-1',
      feed_url: 'https://example.com/feed.xml',
      title: 'RadioTEDU',
    });

    expect(result).toMatchObject({ processed: 2, upserted: 1, skipped: 1 });
    expect(dbClient.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO podcast_episodes'),
      expect.arrayContaining(['feed-1', 'ep-1', 'Episode 1', 'https://cdn.example.com/episode-1.mp3']),
    );
  });

  it('lists public episodes newest-first', async () => {
    const dbClient = {
      query: vi.fn().mockResolvedValue({
        rows: [
          { id: 'ep-2', title: 'Newest', published_at: '2026-04-14T11:00:00.000Z' },
          { id: 'ep-1', title: 'Older', published_at: '2026-04-14T10:00:00.000Z' },
        ],
      }),
    };

    const result = await listPodcastEpisodes(dbClient as any, { page: 1, perPage: 10 });
    expect(result.items.map((item) => item.id)).toEqual(['ep-2', 'ep-1']);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/services/podcastFeeds.test.ts`
Expected: FAIL because `podcastFeeds.ts` and the parser dependency do not exist yet.

**Step 3: Write minimal implementation**

Install the parser dependency first:

Run: `npm install fast-xml-parser`

Then create `backend/src/services/podcastFeeds.ts` around these primitives:

```ts
import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });

export async function syncPodcastFeed(dbClient: any, feed: { id: string; feed_url: string; title?: string | null }) {
  const response = await axios.get(feed.feed_url, { responseType: 'text', timeout: 15000 });
  const parsed = parser.parse(response.data);
  const items = toArray(parsed?.rss?.channel?.item ?? parsed?.feed?.entry ?? []);

  let upserted = 0;
  let skipped = 0;

  for (const item of items) {
    const normalized = normalizePodcastItem(item);
    if (!normalized.audioUrl) {
      skipped += 1;
      continue;
    }

    await upsertPodcastEpisode(dbClient, feed.id, normalized);
    upserted += 1;
  }

  await markPodcastFeedSync(dbClient, feed.id, null);
  return { processed: items.length, upserted, skipped };
}

export async function listPodcastEpisodes(dbClient: any, params: { page: number; perPage: number }) {
  const offset = (params.page - 1) * params.perPage;
  const { rows } = await dbClient.query(
    `SELECT e.id, e.title, e.description, e.audio_url, e.episode_url, e.image_url, e.published_at, f.title AS feed_title
       FROM podcast_episodes e
       JOIN podcast_feeds f ON f.id = e.feed_id
      WHERE f.is_active = TRUE
      ORDER BY e.published_at DESC NULLS LAST, e.created_at DESC
      LIMIT $1 OFFSET $2`,
    [params.perPage, offset],
  );

  return { items: rows };
}
```

Implementation rules:
- Deduplication identity order must be `guid -> audio_url -> episode_url`.
- Skip non-playable items with no `audio_url`.
- Feed sync must store `last_synced_at` on success and `last_sync_error` on failure.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/services/podcastFeeds.test.ts`
Expected: PASS with the new service behavior.

**Step 5: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/services/podcastFeeds.ts backend/src/services/podcastFeeds.test.ts
git commit -m "feat: add podcast rss sync service"
```

### Task 3: Expose admin feed management and public podcast API routes

**Files:**
- Create: `backend/src/routes/podcastFeeds.ts`
- Test: `backend/src/routes/podcastFeeds.test.ts`
- Modify: `backend/src/routes/podcasts.ts`
- Test: `backend/src/routes/podcasts.test.ts`
- Modify: `backend/src/server.ts`

**Step 1: Write the failing test**

Create route helper tests:

```ts
import { describe, expect, it } from 'vitest';
import { normalizePodcastFeedPayload } from './podcastFeeds';
import { normalizePodcastListQuery } from './podcasts';

describe('podcast route helpers', () => {
  it('normalizes feed creation payloads', () => {
    expect(
      normalizePodcastFeedPayload({
        title: '  TEDU Podcast  ',
        feed_url: ' https://example.com/feed.xml ',
      }),
    ).toEqual({
      title: 'TEDU Podcast',
      feedUrl: 'https://example.com/feed.xml',
    });
  });

  it('rejects invalid feed urls', () => {
    expect(() => normalizePodcastFeedPayload({ feed_url: 'ftp://example.com/feed.xml' })).toThrow(
      'feed_url must start with http or https',
    );
  });

  it('normalizes podcast pagination query values', () => {
    expect(normalizePodcastListQuery({ page: '0', per_page: '999' })).toEqual({
      page: 1,
      perPage: 50,
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/routes/podcastFeeds.test.ts src/routes/podcasts.test.ts`
Expected: FAIL because the exported helper functions and new router do not exist.

**Step 3: Write minimal implementation**

Create `backend/src/routes/podcastFeeds.ts` with admin-only endpoints:

```ts
router.use(authMiddleware, rbacMiddleware([ROLES.ADMIN]));

router.get('/', async (_req, res) => {
  const { rows } = await db.query('SELECT * FROM podcast_feeds ORDER BY created_at DESC');
  return sendSuccess(res, rows);
});

router.post('/', async (req: AuthRequest, res) => {
  const payload = normalizePodcastFeedPayload(req.body);
  const { rows } = await db.query(
    `INSERT INTO podcast_feeds (title, feed_url, created_by)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [payload.title, payload.feedUrl, req.user!.id],
  );

  await syncPodcastFeed(db, rows[0]);
  return sendSuccess(res, rows[0], 201);
});

router.delete('/:id', async (req, res) => {
  const { rows } = await db.query('DELETE FROM podcast_feeds WHERE id = $1 RETURNING id', [req.params.id]);
  return sendSuccess(res, rows[0]);
});

router.post('/sync', async (req, res) => {
  const result = await syncAllPodcastFeeds(db, req.body?.feed_id ?? null);
  return sendSuccess(res, result);
});
```

Modify `backend/src/routes/podcasts.ts` so `GET /api/v1/podcasts` reads from `podcast_episodes` instead of WordPress, and export `normalizePodcastListQuery`. Mount the new admin router in `backend/src/server.ts`:

```ts
import podcastFeedsRoutes from './routes/podcastFeeds';

mountWithOptionalPublicBase('/api/v1/podcast-feeds', podcastFeedsRoutes);
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/routes/podcastFeeds.test.ts src/routes/podcasts.test.ts`
Expected: PASS with normalized payload/query coverage.

**Step 5: Commit**

```bash
git add backend/src/routes/podcastFeeds.ts backend/src/routes/podcastFeeds.test.ts backend/src/routes/podcasts.ts backend/src/routes/podcasts.test.ts backend/src/server.ts
git commit -m "feat: add podcast feed admin api"
```

### Task 4: Move the mobile podcast client to backend-backed episode data

**Files:**
- Test: `mobile/__tests__/podcastService.test.ts`
- Modify: `mobile/src/services/podcastService.ts`
- Modify: `mobile/src/screens/PodcastScreen.tsx`

**Step 1: Write the failing test**

Create `mobile/__tests__/podcastService.test.ts`:

```ts
import { describe, expect, it, jest } from '@jest/globals';
import api from '../src/services/api';
import { fetchPodcasts, resolvePodcastLaunchUrl } from '../src/services/podcastService';

jest.mock('../src/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

describe('podcast service', () => {
  it('maps backend podcast records to mobile models', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      data: {
        data: {
          items: [
            {
              id: 'ep-1',
              title: 'Episode 1',
              description: 'Desc',
              audio_url: 'https://cdn.example.com/episode-1.mp3',
              external_url: 'https://example.com/episode-1',
              image_url: 'https://example.com/cover.jpg',
              published_at: '2026-04-14T10:00:00.000Z',
              feed_title: 'TEDU Podcast',
            },
          ],
          total: 1,
          total_pages: 1,
        },
      },
    });

    const result = await fetchPodcasts(1);
    expect(api.get).toHaveBeenCalledWith('/podcasts', { params: { page: 1, per_page: 10 } });
    expect(result.items[0].audioUrl).toBe('https://cdn.example.com/episode-1.mp3');
  });

  it('prefers direct audio playback urls', () => {
    expect(
      resolvePodcastLaunchUrl({
        id: 'ep-1',
        title: 'Episode 1',
        date: '14.04.2026',
        description: 'Desc',
        audioUrl: 'https://cdn.example.com/episode-1.mp3',
        externalUrl: 'https://example.com/episode-1',
      }),
    ).toBe('https://cdn.example.com/episode-1.mp3');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand __tests__/podcastService.test.ts`
Expected: FAIL because `fetchPodcasts` still scrapes HTML/local RSS and does not return the new response shape.

**Step 3: Write minimal implementation**

Refactor `mobile/src/services/podcastService.ts` to use the shared API client only:

```ts
import api from './api';

export interface Podcast {
  id: string;
  title: string;
  date: string;
  description: string;
  audioUrl?: string | null;
  externalUrl?: string | null;
  imageUrl?: string | null;
  feedTitle?: string | null;
}

export async function fetchPodcasts(page = 1) {
  const response = await api.get('/podcasts', { params: { page, per_page: 10 } });
  const payload = response.data.data;

  return {
    items: payload.items.map((item: any) => ({
      id: item.id,
      title: item.title,
      date: item.published_at ? new Date(item.published_at).toLocaleDateString('tr-TR') : '',
      description: item.description || '',
      audioUrl: item.audio_url ?? null,
      externalUrl: item.external_url ?? item.episode_url ?? null,
      imageUrl: item.image_url ?? null,
      feedTitle: item.feed_title ?? null,
    })),
    total: payload.total,
    totalPages: payload.total_pages,
  };
}

export function resolvePodcastLaunchUrl(podcast: Podcast) {
  return podcast.audioUrl || podcast.externalUrl || null;
}
```

Update `mobile/src/screens/PodcastScreen.tsx` to:
- consume `{ items, totalPages }` instead of a flat array,
- remove `fetchSpotifyUrl`,
- use `resolvePodcastLaunchUrl`,
- stop assuming WordPress page size semantics.

**Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand __tests__/podcastService.test.ts`
Expected: PASS with backend-only podcast loading.

**Step 5: Commit**

```bash
git add mobile/__tests__/podcastService.test.ts mobile/src/services/podcastService.ts mobile/src/screens/PodcastScreen.tsx
git commit -m "feat: move mobile podcasts to backend api"
```

### Task 5: Replace local RSS feed storage with admin-backed feed management

**Files:**
- Test: `mobile/__tests__/podcastFeedsAdmin.test.ts`
- Create: `mobile/src/services/podcastFeedsAdmin.ts`
- Modify: `mobile/src/screens/ProfileScreen.tsx`
- Delete: `mobile/src/utils/storage.ts`

**Step 1: Write the failing test**

Create `mobile/__tests__/podcastFeedsAdmin.test.ts`:

```ts
import { describe, expect, it, jest } from '@jest/globals';
import api from '../src/services/api';
import { createPodcastFeed, deletePodcastFeed, listPodcastFeeds, syncPodcastFeeds } from '../src/services/podcastFeedsAdmin';

jest.mock('../src/services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  },
}));

describe('podcast admin service', () => {
  it('loads feed rows from the backend', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: { data: [{ id: 'feed-1', feed_url: 'https://example.com/feed.xml' }] } });
    const result = await listPodcastFeeds();
    expect(api.get).toHaveBeenCalledWith('/podcast-feeds');
    expect(result[0].id).toBe('feed-1');
  });

  it('creates, syncs, and deletes feed rows through the backend', async () => {
    await createPodcastFeed({ title: 'TEDU Podcast', feedUrl: 'https://example.com/feed.xml' });
    await syncPodcastFeeds();
    await deletePodcastFeed('feed-1');

    expect(api.post).toHaveBeenCalledWith('/podcast-feeds', {
      title: 'TEDU Podcast',
      feed_url: 'https://example.com/feed.xml',
    });
    expect(api.post).toHaveBeenCalledWith('/podcast-feeds/sync', {});
    expect(api.delete).toHaveBeenCalledWith('/podcast-feeds/feed-1');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand __tests__/podcastFeedsAdmin.test.ts`
Expected: FAIL because the admin service file and backend-backed flow do not exist.

**Step 3: Write minimal implementation**

Create `mobile/src/services/podcastFeedsAdmin.ts`:

```ts
import api from './api';

export async function listPodcastFeeds() {
  const response = await api.get('/podcast-feeds');
  return response.data.data;
}

export async function createPodcastFeed(payload: { title?: string; feedUrl: string }) {
  const response = await api.post('/podcast-feeds', {
    title: payload.title?.trim() || null,
    feed_url: payload.feedUrl.trim(),
  });
  return response.data.data;
}

export async function syncPodcastFeeds(feedId?: string) {
  const response = await api.post('/podcast-feeds/sync', feedId ? { feed_id: feedId } : {});
  return response.data.data;
}

export async function deletePodcastFeed(feedId: string) {
  const response = await api.delete(`/podcast-feeds/${feedId}`);
  return response.data.data;
}
```

Update `mobile/src/screens/ProfileScreen.tsx` to:
- remove `addRssFeed`, `getStoredRssFeeds`, `removeRssFeed` imports,
- treat only `user?.role === 'admin'` as feed-management capable,
- load feed rows from the backend,
- show sync status and sync/delete actions,
- use stable `feed.id` keys instead of array indexes.

Delete `mobile/src/utils/storage.ts` after all references are removed.

**Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand __tests__/podcastFeedsAdmin.test.ts __tests__/podcastService.test.ts`
Expected: PASS with admin-only backend feed management.

**Step 5: Commit**

```bash
git add mobile/__tests__/podcastFeedsAdmin.test.ts mobile/src/services/podcastFeedsAdmin.ts mobile/src/screens/ProfileScreen.tsx
git rm mobile/src/utils/storage.ts
git commit -m "feat: add admin-managed podcast feed ui"
```

## Verification Checklist

Run backend verification:

```bash
cd backend
npm test -- src/db/migrate.test.ts src/services/podcastFeeds.test.ts src/routes/podcastFeeds.test.ts src/routes/podcasts.test.ts
npm run build
```

Run mobile verification:

```bash
cd mobile
npm test -- --runInBand __tests__/podcastService.test.ts __tests__/podcastFeedsAdmin.test.ts __tests__/config.test.ts
```

Manual smoke checklist:
1. Log into mobile with an admin account.
2. Add a new RSS URL from the profile admin area.
3. Confirm the feed row shows `last_synced_at`, and if sync fails, `last_sync_error`.
4. Confirm the podcast screen lists the new episodes and opens `audio_url` first.
5. Confirm Android Auto shows the same backend episode pool.
6. Confirm normal users and guests do not see the feed-management UI.
