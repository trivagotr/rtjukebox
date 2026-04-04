# Spotify Music Source Integration Design

## Context

RadioTEDU Jukebox currently relies on locally uploaded MP3 files served from `/uploads/songs/`. This approach requires manual song management, has no content filtering, and the catalog stagnates without constant admin intervention.

The system needs a self-updating, clean-content music source that supports both Turkish and international music, streams audio (not video clips), and doesn't require downloading/uploading files. Spotify Web API + Web Playback SDK was chosen as the solution.

## Architecture Overview

```
Mobile App                    Backend                         Kiosk (Web Controller)
    |                            |                                    |
    |-- search "şarkı adı" ---->|                                    |
    |                            |-- Spotify Search API ------------->|
    |                            |<-- results (filtered) ------------|
    |<-- clean results ----------|                                    |
    |                            |                                    |
    |-- add to queue ----------->|                                    |
    |                            |-- save to DB + broadcast -------->|
    |                            |                                    |
    |                            |== queue turn arrives =============|
    |                            |-- PUT /v1/me/player/play -------->|
    |                            |                   (Spotify Web Playback SDK)
    |                            |                                    |-- plays audio
    |                            |<-- player_state_changed ----------|
    |                            |-- next queue item --------------->|
```

## Spotify Authentication

### Client Credentials Flow (Search)
- Used for search, metadata retrieval — no user login needed
- Token cached in Redis with TTL matching Spotify's expiry (1 hour)
- Env: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`

### Authorization Code Flow with PKCE (Playback)
- Required for Web Playback SDK — needs a Premium account
- One-time admin OAuth flow: admin logs into Spotify via `/api/v1/spotify/auth`
- Refresh token stored encrypted in DB (`spotify_auth` table)
- Access token cached in Redis, auto-refreshed before expiry
- Env: `SPOTIFY_REDIRECT_URI`

### Token Storage

```sql
CREATE TABLE spotify_auth (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),           -- admin who authorized
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMP NOT NULL,
  scopes TEXT NOT NULL,                         -- 'streaming user-modify-playback-state ...'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## Song Search & Catalog

### Search Flow
1. Mobile app calls `GET /api/v1/jukebox/songs?search=query`
2. Backend calls Spotify Search API: `GET /v1/search?q={query}&type=track&market=TR&limit=20`
3. Results pass through `ContentFilterService` pipeline
4. Clean results returned to mobile with Spotify metadata
5. Search results cached in Redis (key: `search:{hash}`, TTL: 1 hour)

### Songs Table (Replaces Current)

```sql
DROP TABLE IF EXISTS songs CASCADE;

CREATE TABLE songs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spotify_uri VARCHAR(100) UNIQUE NOT NULL,     -- spotify:track:4iV5W9uYEdYUVa79Axb7Rh
  spotify_id VARCHAR(50) NOT NULL,              -- 4iV5W9uYEdYUVa79Axb7Rh
  title VARCHAR(200) NOT NULL,
  artist VARCHAR(200) NOT NULL,
  artist_id VARCHAR(50),                        -- Spotify artist ID for blacklisting
  album VARCHAR(200),
  cover_url VARCHAR(500),                       -- Spotify CDN album art
  duration_ms INTEGER NOT NULL,
  is_explicit BOOLEAN DEFAULT FALSE,
  is_blocked BOOLEAN DEFAULT FALSE,             -- admin blacklist
  play_count INTEGER DEFAULT 0,
  last_played_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_songs_spotify_uri ON songs(spotify_uri);
CREATE INDEX idx_songs_spotify_id ON songs(spotify_id);
CREATE INDEX idx_songs_blocked ON songs(is_blocked) WHERE is_blocked = TRUE;
```

### Track Registration
When a user adds a Spotify track to the queue:
1. Check if `spotify_uri` exists in `songs` table
2. If not → create record from Spotify metadata
3. Return the `songs.id` for queue_items FK

This creates a "lazy catalog" — only tracks that users actually request get persisted.

## Content Filtering

### Pipeline Architecture

```typescript
interface ContentFilter {
  name: string;
  isAllowed(track: SpotifyTrack): Promise<boolean>;
  getReason(track: SpotifyTrack): string;
}

class ContentFilterService {
  private filters: ContentFilter[] = [];

  async filterTracks(tracks: SpotifyTrack[]): Promise<SpotifyTrack[]> {
    const results: SpotifyTrack[] = [];
    for (const track of tracks) {
      let allowed = true;
      for (const filter of this.filters) {
        if (!await filter.isAllowed(track)) { allowed = false; break; }
      }
      if (allowed) results.push(track);
    }
    return results;
  }
}
```

### Active Filters

**1. SpotifyExplicitFilter**
- Rejects tracks where `explicit === true`
- Simple, reliable for English content
- Known limitation: Turkish tracks often lack explicit tagging

**2. BlacklistFilter**
- Checks `songs.is_blocked` for individual tracks
- Checks `blocked_artists` table for entire artists

```sql
CREATE TABLE blocked_artists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_name VARCHAR(200) NOT NULL,
  spotify_artist_id VARCHAR(50),
  blocked_by UUID REFERENCES users(id),
  reason VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_blocked_artists_spotify_id
  ON blocked_artists(spotify_artist_id) WHERE spotify_artist_id IS NOT NULL;
```

### Future Filter (Interface Ready)

**3. AIContentFilter (placeholder)**
- Interface defined but not implemented
- Future: fetch lyrics from Genius/Musixmatch API → analyze with LLM
- The `ContentFilter` interface allows drop-in addition without changing pipeline

## Admin Endpoints

### Blacklist Management
```
POST   /api/v1/jukebox/admin/songs/:id/block        -- block a specific song
DELETE /api/v1/jukebox/admin/songs/:id/block        -- unblock a song
POST   /api/v1/jukebox/admin/artists/block           -- block an artist
DELETE /api/v1/jukebox/admin/artists/:id/block       -- unblock an artist
GET    /api/v1/jukebox/admin/blocked                 -- list all blocked songs/artists
```

### Spotify Auth Management
```
GET    /api/v1/spotify/auth                          -- initiate OAuth flow
GET    /api/v1/spotify/callback                      -- OAuth callback
GET    /api/v1/spotify/status                        -- check auth status
POST   /api/v1/spotify/refresh                       -- force token refresh
```

### Removed Endpoints
- `POST /api/v1/jukebox/admin/upload-song` — removed
- `POST /api/v1/jukebox/admin/scan-folder` — removed
- `POST /api/v1/jukebox/admin/sync-metadata` — removed (iTunes)

## Web Playback SDK (Kiosk)

### Integration in web-controller
```
web-controller/
  src/
    spotify/
      SpotifyPlayer.tsx       -- SDK initialization, device registration
      SpotifyPlayerContext.tsx -- React context for player state
      useSpotifyPlayback.ts   -- hook for playback controls
```

### SDK Lifecycle
1. Kiosk page loads → SDK script loaded from `sdk.scdn.co/spotify-player.js`
2. SDK creates a virtual playback device → receives `device_id`
3. `device_id` sent to backend via Socket.IO → stored in `devices` table
4. Backend uses this `device_id` for all playback API calls
5. SDK emits `player_state_changed` → kiosk forwards to backend via Socket.IO
6. On track end → backend advances queue, plays next track

### Playback Control (Backend → Spotify API)
```typescript
// Play a track on kiosk device
PUT /v1/me/player/play?device_id={kiosk_device_id}
Body: { uris: ["spotify:track:xxxxx"] }

// Pause/resume
PUT /v1/me/player/pause?device_id={kiosk_device_id}
PUT /v1/me/player/play?device_id={kiosk_device_id}

// Volume control
PUT /v1/me/player/volume?volume_percent=70&device_id={kiosk_device_id}

// Skip (admin)
POST /v1/me/player/next?device_id={kiosk_device_id}
```

## Mobile App Changes

### JukeboxScreen
- Search results now come from Spotify (via backend proxy)
- Song cards show Spotify album art (higher quality, consistent)
- Queue add sends `spotify_uri` instead of local `song_id`
- Backend auto-creates song record if first time requested

### MiniPlayer
- No change needed — already uses track metadata from backend
- Cover images now from Spotify CDN (faster, better quality)

### Removed Components
- File upload UI (if any admin screens in mobile)
- Any references to local `file_url` paths

## Queue System Changes

### Queue Flow (Updated)
1. User searches → Spotify results (filtered) shown
2. User taps "Add" → `POST /api/v1/jukebox/queue` with `{ spotify_uri, device_id }`
3. Backend: upsert song record, create queue_item, calculate priority
4. Socket.IO broadcasts `queue_updated` to device room
5. When queue item reaches top → backend calls Spotify Play API
6. SDK reports track finished → backend marks `played`, advances queue

### Autoplay
- When queue is empty, backend picks random high-score non-blocked song
- Plays via same Spotify API mechanism

### Queue Items Table (Minor Update)
- `song_id` FK still references `songs` table (now Spotify-backed)
- No structural change to `queue_items`

## Error Handling

| Scenario | Action |
|----------|--------|
| Spotify API unreachable | Show "Muzik servisi su an kullanilamiyor" to users |
| Access token expired | Auto-refresh from refresh_token in Redis |
| Refresh token revoked | Alert admin via Socket.IO, show auth required status |
| Rate limited (429) | Exponential backoff, queue requests in Redis |
| Track unavailable in TR | Filter out from search results (market=TR handles this) |
| SDK disconnects | Auto-reconnect with backoff, re-register device_id |
| Premium expired | Playback fails → alert admin, search still works |

## Removed Components

| Component | File | Reason |
|-----------|------|--------|
| MetadataService | `backend/src/services/metadata.ts` | iTunes API no longer needed |
| AudioService | `backend/src/services/audio.ts` | FFmpeg processing not needed |
| Upload route | `backend/src/routes/jukebox.ts` | No local file uploads |
| Scan folder route | `backend/src/routes/jukebox.ts` | No local file scanning |
| Multer config | `backend/src/routes/jukebox.ts` | No file upload middleware |
| `/uploads/songs/` | filesystem | No local song storage |

## Environment Variables

```env
# Spotify API
SPOTIFY_CLIENT_ID=xxx
SPOTIFY_CLIENT_SECRET=xxx
SPOTIFY_REDIRECT_URI=https://radiotedu.com/api/v1/spotify/callback

# Existing (unchanged)
DATABASE_URL=...
REDIS_URL=...
JWT_SECRET=...
```

## Verification Plan

1. **Spotify Auth**: Hit `/api/v1/spotify/auth`, complete OAuth, verify tokens stored
2. **Search**: Call `GET /api/v1/jukebox/songs?search=tarkan` → verify Turkish results, no explicit tracks
3. **Blacklist**: Block a song/artist → verify filtered from search results
4. **Queue**: Add Spotify track to queue → verify song record created, queue_item added
5. **Playback**: Verify kiosk Web Playback SDK receives play command, audio plays
6. **Track End**: Verify next queue item plays automatically when current track ends
7. **Error**: Disconnect Spotify → verify graceful error messages to users
8. **Mobile**: Search, add to queue, vote — all work with Spotify-backed songs
