# RadioTEDU - API Specification

Base URL: `https://api.radiotedu.com/v1`

## Authentication

### POST /auth/register
```json
// Request
{
  "email": "user@tedu.edu.tr",
  "password": "securePass123",
  "display_name": "Ahmet"
}
// Response 201
{
  "user": { "id": "uuid", "email": "...", "display_name": "Ahmet" },
  "access_token": "eyJ...",
  "refresh_token": "eyJ..."
}
```

### POST /auth/login
```json
// Request
{ "email": "user@tedu.edu.tr", "password": "..." }
// Response 200 - Same as register
```

### POST /auth/refresh
```json
// Request
{ "refresh_token": "eyJ..." }
// Response 200
{ "access_token": "eyJ...", "refresh_token": "eyJ..." }
```

---

## Podcasts (WordPress Proxy)

### GET /podcasts
Query: `?page=1&per_page=20`
```json
// Response 200
{
  "items": [
    {
      "id": 123,
      "title": "Podcast Bölüm 5",
      "excerpt": "...",
      "featured_image": "https://...",
      "audio_url": "https://anchor.fm/.../audio.mp3",
      "external_url": "https://open.spotify.com/episode/...",
      "has_audio": true,
      "published_at": "2026-01-15T10:00:00Z"
    }
  ],
  "total": 50,
  "page": 1
}
```

---

## Live Radio

### GET /radio/status
```json
// Response 200
{
  "is_live": true,
  "stream_url": "https://stream.radiotedu.com/live",
  "current_show": "Sabah Programı",
  "listeners_count": 42
}
```

---

## Jukebox

### POST /jukebox/connect
QR kod okutunca çağrılır
```json
// Request
{ "device_code": "CAFE-001" }
// Response 200
{
  "device": { "id": "uuid", "name": "Yemekhane-1" },
  "session_id": "uuid",
  "current_queue": [...]
}
```

### GET /jukebox/songs
Query: `?search=rock&page=1`
```json
// Response 200
{
  "items": [
    { "id": "uuid", "title": "...", "artist": "...", "duration": 210, "cover_url": "..." }
  ]
}
```

### POST /jukebox/queue
```json
// Request
{ "device_id": "uuid", "song_id": "uuid" }
// Response 201
{ "queue_item_id": "uuid", "position": 5 }
```

### POST /jukebox/vote
```json
// Request
{ "queue_item_id": "uuid", "vote": 1 } // 1=up, -1=down
// Response 200
{ "new_score": 15, "position": 3 }
```

### GET /jukebox/queue/:deviceId
```json
// Response 200
{
  "now_playing": { "song": {...}, "added_by": {...}, "votes": 10 },
  "queue": [
    { "id": "uuid", "song": {...}, "added_by": {...}, "votes": 5, "position": 1 }
  ]
}
```

---

## Push Notifications

### PUT /users/me/push-token
```json
// Request
{ "fcm_token": "...", "platform": "ios" }
```

### PUT /users/me/push-preferences
```json
// Request
{ "podcast": true, "radio": false, "jukebox": true }
```

---

## WebSocket Events (Socket.IO)

### Client → Server
- `join_device` - `{ device_id: "uuid" }`
- `leave_device`

### Server → Client
- `queue_updated` - Full queue state
- `now_playing` - Currently playing song
- `vote_changed` - `{ queue_item_id, votes, position }`
- `song_skipped` - `{ queue_item_id, reason }`
