# Codex Server Runbook

This folder contains the backend API, Docker setup, database schema migration, and the production container that serves the fallback jukebox website. The public QR URL can be `/jukebox?device=DEVICE_CODE`; built assets remain under `/controller`.

## What To Run On The Server

Run these commands from the repository root unless a command says `cd backend`.

```bash
git clone https://github.com/trivagotr/rtjukebox.git
cd rtjukebox
# Use the branch or commit that contains the fallback jukebox commits.
# If this branch has been pushed:
git fetch origin codex/fallback-jukebox-website
git checkout codex/fallback-jukebox-website
```

Create the backend environment file:

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` before starting:

- `DB_PASSWORD`: use a strong password.
- `DATABASE_URL`: must match `DB_USER`, `DB_PASSWORD`, and `DB_NAME`.
- `JWT_SECRET` and `JWT_REFRESH_SECRET`: use two different long random values.
- `CORS_ORIGINS`: include the public domain that people will use to open the QR website.
- `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, and `SPOTIFY_REDIRECT_URI`: fill these only when Spotify kiosk playback is needed.

## Docker Start

The Compose build context is the repo root because the backend container needs:

- `backend/dist` for the API.
- `jukebox-web-controller/dist` for `/controller`.
- `kiosk-web` for `/kiosk`.

Start everything:

```bash
cd backend
docker compose up -d --build
```

Check health:

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{"status":"ok"}
```

Open the fallback QR website:

```text
http://SERVER_HOST:3000/jukebox?device=DEVICE_CODE
```

Use that URL as the QR target on the jukebox screen. `DEVICE_CODE` must match an active row in the backend `devices` table. `/controller?device=DEVICE_CODE` also works for debugging.

Important route detail: `/jukebox` is only an exact page alias. Do not configure a wildcard reverse proxy or rewrite for `/jukebox/*`, because the old no-auth jukebox API paths still use that namespace.

The visitor flow is:

1. Scan the QR code on the jukebox.
2. Enter a name.
3. Search for a song.
4. Add the song to the queue.
5. The queue shows the entered name as the requester.

## Native Node Start

Use this only when Docker is not wanted.

```bash
cd jukebox-web-controller
npm ci
npm run build

cd ../backend
npm ci
npm run db:migrate
npm run build
npm start
```

For native start, `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `CORS_ORIGINS` must already be exported or present in `backend/.env`.

## Database Notes

Docker first boot mounts `backend/src/db/schema.sql` into PostgreSQL init. For an existing database or native run, apply migrations manually:

```bash
cd backend
npm run db:migrate
```

## Useful Commands

```bash
# Logs
docker compose logs -f app

# Restart backend only
docker compose restart app

# Rebuild after pulling new code
docker compose up -d --build app

# Stop all backend services
docker compose down
```

## Verification Commands

Before using the server publicly:

```bash
cd backend
npm test
npm run build

cd ../jukebox-web-controller
npm test
npm run build
```

Then smoke the deployed service:

```bash
curl http://SERVER_HOST:3000/health
```

Open:

```text
http://SERVER_HOST:3000/jukebox?device=DEVICE_CODE
```

If the controller page loads but song search fails, check `CORS_ORIGINS`, `DATABASE_URL`, and the backend logs.
