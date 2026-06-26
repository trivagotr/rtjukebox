# Codex Server Runbook

This folder contains the backend API, Docker setup, database schema migration, and the production container that serves both temporary jukebox surfaces. The physical kiosk display is `/kiosk/?code=DEVICE_CODE`; the QR on that screen sends phones to `/jukebox?device=DEVICE_CODE`. Phone page assets remain under `/controller`.

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

Do not put the RadioTEDU Spotify account email or password in `.env`, Docker Compose, docs, Git, or logs. The account is only used once in Spotify's own login page to grant the kiosk playback scopes. The backend stores Spotify OAuth tokens in the database after the callback.

## Docker Start

The Compose build context is the repo root because the backend container needs:

- `backend/dist` for the API.
- `jukebox-web-controller/dist` for `/controller` and the exact `/jukebox` phone-page alias.
- `kiosk-web` for the physical `/kiosk` display.

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

Open the physical kiosk display:

```text
http://SERVER_HOST:3000/kiosk/?code=DEVICE_CODE
```

That kiosk screen should show now-playing, queue, and a QR code only. It must not ask visitors for their names.

The QR shown on the kiosk should point phones to:

```text
http://SERVER_HOST:3000/jukebox?device=DEVICE_CODE
```

`DEVICE_CODE` must match an active row in the backend `devices` table. `/controller?device=DEVICE_CODE` also works for debugging the phone page.

Important route detail: `/jukebox` is only an exact page alias. Do not configure a wildcard reverse proxy or rewrite for `/jukebox/*`, because the old no-auth jukebox API paths still use that namespace.

The event flow is:

1. The physical jukebox opens `/kiosk/?code=DEVICE_CODE`.
2. The kiosk shows QR, now-playing, and queue.
3. A visitor scans the QR code.
4. The visitor phone opens `/jukebox?device=DEVICE_CODE`.
5. The phone page asks for the visitor name.
6. The visitor searches for a song and adds it.
7. The kiosk and phone queue show the entered name as the requester.

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
http://SERVER_HOST:3000/kiosk/?code=DEVICE_CODE
```

Then scan or open the QR target:

```text
http://SERVER_HOST:3000/jukebox?device=DEVICE_CODE
```

## Private RadioTEDU Spotify Setup

Visitors scanning the QR must never need a Spotify account. Only the kiosk/backend needs one private Spotify Premium authorization.

1. Confirm the Spotify app redirect URI in Spotify Developer Dashboard exactly matches:

   ```text
   http://SERVER_HOST:3000/api/v1/spotify/device-auth/callback
   ```

   If the server is behind `https://radiotedu.com`, use the public HTTPS URL instead, including any `PUBLIC_BASE_PATH`.

2. Start the real backend with `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, and `SPOTIFY_REDIRECT_URI` set. `SPOTIFY_REDIRECT_URI` should point at the device callback above for kiosk playback.

3. Open the physical kiosk page:

   ```text
   http://SERVER_HOST:3000/kiosk/?code=DEVICE_CODE
   ```

4. If the kiosk shows a Spotify connect/setup prompt, click it and log in with the private RadioTEDU Spotify Premium account in Spotify's login page. Do not save or paste that password into this repository.

5. After the callback returns to the kiosk, verify the backend has a stored usable device authorization:

   ```bash
   curl -X POST http://SERVER_HOST:3000/api/v1/jukebox/kiosk/spotify-device-auth/status \
     -H 'Content-Type: application/json' \
     -d '{"device_id":"DEVICE_CODE"}'
   ```

   Expected result: `connected` is `true`, `hasRefreshToken` is `true`, and `spotifyProduct` is `premium`.

6. Verify the kiosk token endpoint succeeds:

   ```bash
   curl -X POST http://SERVER_HOST:3000/api/v1/jukebox/kiosk/spotify-token \
     -H 'Content-Type: application/json' \
     -d '{"device_id":"DEVICE_CODE"}'
   ```

   Expected result: HTTP 200 with an access token payload. Do not copy that token into logs or docs.

If Spotify asks for login again later, check whether `spotify_device_auth` still has a row for the device, whether the account is still Premium, and whether the Spotify app credentials changed. Changing the Spotify app client secret invalidates stored auth and requires reconnecting once.

If the kiosk loads but the QR points at the wrong place, check `kiosk-web/config.js`. If the phone page loads but song search fails, check `CORS_ORIGINS`, `DATABASE_URL`, and the backend logs.
