# Admin-Managed RSS Podcast Registry Design

## Goal

Replace the current mobile-side `HTML scrape + local RSS storage` podcast flow with a centralized, admin-managed RSS system.

WordPress remains untouched. The shared podcast source for the RadioTEDU mobile app and Android Auto becomes the backend-managed RSS feed registry.

## Current Project Context

Current behavior is split and inconsistent:

- [backend/src/routes/podcasts.ts](E:/rtmusicbox/.worktrees/admin-rss-podcast-registry/backend/src/routes/podcasts.ts) proxies WordPress post data from `wp-json`
- [mobile/src/services/podcastService.ts](E:/rtmusicbox/.worktrees/admin-rss-podcast-registry/mobile/src/services/podcastService.ts) mixes website scraping with device-local RSS parsing
- [mobile/src/utils/storage.ts](E:/rtmusicbox/.worktrees/admin-rss-podcast-registry/mobile/src/utils/storage.ts) stores RSS feed URLs per device in AsyncStorage
- [mobile/src/screens/ProfileScreen.tsx](E:/rtmusicbox/.worktrees/admin-rss-podcast-registry/mobile/src/screens/ProfileScreen.tsx) has an admin-only RSS management UI, but it currently writes only to local storage

That model is wrong for the product you described because:

- RSS feed configuration should be global, not per-device
- Android Auto should see the same podcast pool as the phone app
- the backend should own dedupe, sorting, and normalization
- mobile should not scrape HTML or trust each device to merge multiple feeds correctly

## Approaches

### Option 1: Mobile-only RSS aggregation

Each mobile client fetches and merges all RSS feeds directly.

Pros:

- fastest to ship
- no backend schema changes

Cons:

- every device duplicates RSS parsing work
- admin changes do not become a single shared source of truth
- Android Auto consistency becomes device-dependent
- dedupe and caching stay fragile

### Option 2: Backend live-merge on every request

Admins manage feed URLs in backend storage, but `GET /api/v1/podcasts` fetches every RSS feed live on every client request.

Pros:

- simpler than building a cached episode store
- clients stay thin

Cons:

- slow and unreliable when feed count grows
- one broken feed can slow down every request
- repeated parsing work scales poorly

### Option 3: Backend feed registry + normalized cached episodes

Admins manage feed URLs in backend storage. Backend parses feeds into a normalized `podcast_episodes` table and serves clients from that shared store.

Pros:

- one global source of truth
- cheap and consistent reads for phone and Android Auto
- clean dedupe strategy
- ready for manual sync, scheduled sync, and admin diagnostics

Cons:

- requires schema and sync logic
- more code than a direct proxy

## Recommendation

Use Option 3.

This is the only option that matches the product shape: unlimited RSS feeds, admin-only management, mobile and Android Auto consuming the same pool, and no WordPress dependency for app playback.

## System Design

### Source of Truth

Backend becomes the source of truth for:

- which RSS feeds are active
- when feeds were last synced
- which episodes exist after normalization and dedupe

Mobile and Android Auto consume only backend podcast endpoints.

### Data Model

Add two backend tables.

`podcast_feeds`

- `id`
- `url`
- `title`
- `is_active`
- `last_synced_at`
- `last_error`
- `created_at`
- `updated_at`

`podcast_episodes`

- `id`
- `feed_id`
- `guid`
- `title`
- `description`
- `audio_url`
- `external_url`
- `image_url`
- `published_at`
- `source_url`
- `created_at`
- `updated_at`

### Identity and Dedupe

Episode identity should be stable and deterministic.

Recommended dedupe order:

1. RSS item `guid`
2. enclosure/audio URL
3. episode/source link

If a feed item has none of these, the backend should reject it as non-stable rather than inventing random IDs.

### Sync Model

The backend should support:

- sync on feed create
- manual admin sync for all feeds
- optional future scheduled sync without changing client contracts

For this phase, a manual sync endpoint plus sync-on-create is enough. Scheduled background sync can be added later without changing the API.

### API Design

Admin endpoints:

- `GET /api/v1/podcast-feeds`
- `POST /api/v1/podcast-feeds`
- `DELETE /api/v1/podcast-feeds/:id`
- `POST /api/v1/podcast-feeds/sync`

Client endpoint:

- `GET /api/v1/podcasts?page=1&per_page=10`

Client payload should already be normalized for mobile playback:

- `id`
- `title`
- `description`
- `date`
- `audio_url`
- `external_url`
- `image_url`
- `source_url`
- `published_at`

The mobile app should not have to understand raw RSS structures.

## Mobile Behavior

### Podcast Screen

[mobile/src/screens/PodcastScreen.tsx](E:/rtmusicbox/.worktrees/admin-rss-podcast-registry/mobile/src/screens/PodcastScreen.tsx) should stop scraping the website and stop using local feed storage.

Instead:

- `fetchPodcasts` calls backend `GET /api/v1/podcasts`
- if `audio_url` exists, play inside the app
- if `audio_url` does not exist but `external_url` exists, open external URL
- pagination remains backend-driven

### Admin RSS Management

[mobile/src/screens/ProfileScreen.tsx](E:/rtmusicbox/.worktrees/admin-rss-podcast-registry/mobile/src/screens/ProfileScreen.tsx) already has the right admin entry point.

It should become a real backend UI:

- list active RSS feeds from backend
- add a new RSS URL through backend
- delete a feed through backend
- trigger manual sync through backend

The AsyncStorage-based feed list should be removed from the mobile product path.

## Android Auto Impact

No separate Android Auto podcast ingestion logic should be added.

Android Auto already consumes the same mobile playback domain. Once [mobile/src/services/podcastService.ts](E:/rtmusicbox/.worktrees/admin-rss-podcast-registry/mobile/src/services/podcastService.ts) reads from backend and the shared playback resolver sees normalized `audioUrl`, Android Auto automatically benefits from the same pool.

Vehicle rule remains unchanged:

- only directly playable episodes with `audio_url` are eligible for vehicle surfaces

## Error Handling

Backend feed-level errors should not take down all podcast reads.

Recommended behavior:

- failed feed sync stores `last_error`
- successful feeds still populate the global episode pool
- `GET /api/v1/podcasts` serves the last known good normalized episodes
- admin feed list shows sync failure status for troubleshooting

Mobile should show a normal empty/error state if no episodes are available, but it should never parse raw RSS errors itself.

## Testing Strategy

Backend:

- schema migration test includes new podcast feed and episode tables
- feed sync service test covers normalization and dedupe
- admin route tests cover add/list/delete/sync permissions
- podcast client route test covers pagination and normalized response shape

Mobile:

- podcast service test proves backend response maps into mobile `Podcast` objects
- profile admin test proves feed list comes from backend rather than AsyncStorage
- podcast screen test proves playback prefers `audio_url` and falls back to `external_url`

## Non-Goals

- changing the public WordPress site
- making WordPress consume this backend registry
- allowing regular users to add RSS feeds
- exposing non-playable podcast items to Android Auto

## Result

After this change:

- admins manage unlimited RSS feeds in one place
- mobile and Android Auto consume one shared normalized podcast pool
- per-device RSS config disappears
- WordPress scraping is no longer part of the mobile app contract
