# Pending Backend Changes

This file tracks all the changes, additions, and updates that need to be applied to the backend. Since backend development is now handled on a separate device, please apply these changes collectively when the environment is ready.

## Change Log

### [Date: 2026-01-31]
- **Initialized this tracking file.**
- **Podcast & RSS Feed System Architecture:** Added requirements for a dynamic RSS management system.

## Proposed Backend Implementations

### 1. Database Schema (New Tables)
Create a migration for the following tables:
- `podcast_feeds`: Stores the RSS feed URLs (Added by admins).
  - Columns: `id`, `url`, `name`, `is_active`, `last_synced_at`.
- `podcasts`: Stores individual episodes parsed from RSS.
  - Columns: `id`, `feed_id`, `title`, `description`, `audio_url`, `cover_url`, `publish_date`, `source_url`, `guid` (for deduplication).

### 2. Required Endpoints
- **Admin Endpoints:**
  - `POST /api/v1/podcast/feeds`: Add a new RSS URL.
  - `DELETE /api/v1/podcast/feeds/:id`: Remove a feed.
  - `POST /api/v1/podcast/sync`: Manually trigger a re-sync of all feeds.
- **Client Endpoints:**
  - `GET /api/v1/podcasts`: Fetch merged podcasts, sorted by `publish_date DESC` (supports pagination).

### 3. Background Sync Logic
- Implement a worker/cron job that runs every X hours.
- Use an RSS parser library (e.g., `rss-parser` for Node.js).
- For each feed in `podcast_feeds`:
  - Fetch RSS.
  - Upsert episodes into `podcasts` table based on `guid`.
  - Update `last_synced_at`.

### 4. Song History (Radio Channels)
- **Database Schema:**
  - `song_history`: Dynamic table to store played songs.
    - Columns: `id`, `channel_id` (radiotedu-main, etc.), `title`, `artist`, `cover_url`, `played_at`.
- **Logic:**
  - Create a "Now Playing" watcher that periodically checks radio metadata.
  - Store unique song entries in `song_history`.
  - Automatically cleanup entries older than 24 hours (to keep DB light, though client only sees last 15 mins).
- **Endpoint:**
  - `GET /api/v1/radio/history/:channel_id`: Returns songs played in the last 15 minutes for the specified channel.

