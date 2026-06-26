# Prompt For Codex On The Web Server

Use this prompt when opening Codex on the server for the RT Jukebox backend deployment.

```text
You are Codex working on the RT Jukebox server checkout.

Goal:
Run the temporary fallback jukebox flow for the upcoming event. The physical jukebox/kiosk screen opens `/kiosk/?code=DEVICE_CODE` and shows only now-playing, queue, and a QR code. Visitors scan that QR on their phones, open `/jukebox?device=DEVICE_CODE`, enter their name, search for a song, add it to the queue, and their entered name appears on the queue item / requester line. This is a fast fallback, not the final TEDU-student product. The final student-focused jukebox work comes after June 28.

Important local context:
- The physical kiosk display lives in `kiosk-web` and is served at `/kiosk`.
- The scanned phone request page lives in `jukebox-web-controller`.
- The backend serves the built phone page assets from `/controller`.
- The backend also serves the exact page alias `/jukebox` for QR-friendly phone URLs.
- Do not rewrite or capture `/jukebox/*`; old no-auth jukebox API paths still live there.
- The backend API routes are under `/api/v1/jukebox` and `/api/v1/auth`.
- The physical kiosk URL should be:
  `http(s)://SERVER_HOST/kiosk/?code=DEVICE_CODE`
  or, if exposing backend directly on port 3000:
  `http://SERVER_HOST:3000/kiosk/?code=DEVICE_CODE`
- The QR shown by the kiosk should point phones to:
  `http(s)://SERVER_HOST/jukebox?device=DEVICE_CODE`
  or, if exposing backend directly on port 3000:
  `http://SERVER_HOST:3000/jukebox?device=DEVICE_CODE`
- `/controller?device=DEVICE_CODE` also works and is useful for debugging.
- `DEVICE_CODE` must match an active row in the backend `devices` table.

Commits expected in this checkout:
- `383a1083 feat: add fallback jukebox website flow`
- `70c107ea feat: collect QR guest names for jukebox queue`
- `2f4be414 feat: add public jukebox page alias`

If those commits are missing:
1. Check the current branch with `git branch --show-current`.
2. Check recent commits with `git log --oneline -5`.
3. Fetch or ask for the branch/patch that contains those commits before changing deployment files.

Backend-folder deployment files added/updated for server use:
- `backend/CODEX_SERVER_RUNBOOK.md`: exact server runbook.
- `backend/.env.example`: production env template with DB, Redis, JWT, CORS, public base path, Spotify, and podcast variables.
- `backend/docker-compose.yml`: builds from repo root so the backend image can include the fallback website assets.
- `backend/Dockerfile`: builds backend and `jukebox-web-controller`, then includes controller dist assets in the runtime image.
- `backend/Dockerfile.dockerignore`: keeps the root Docker build context small.

First steps:
1. Read `backend/CODEX_SERVER_RUNBOOK.md`.
2. Create `backend/.env` from `backend/.env.example`.
3. Fill real secrets:
   - `DB_PASSWORD`
   - `DATABASE_URL`
   - `JWT_SECRET`
   - `JWT_REFRESH_SECRET`
   - `CORS_ORIGINS`
   - Spotify variables only if Spotify playback is needed.
4. Start with Docker:
   `cd backend && docker compose up -d --build`

Required verification before claiming it works:
1. `curl http://localhost:3000/health` returns `{"status":"ok"}`.
2. `/kiosk/?code=DEVICE_CODE` shows the kiosk display with QR, now-playing, and queue; it must not ask for a name.
3. The QR link shown on the kiosk points to `/jukebox?device=DEVICE_CODE`.
4. `/jukebox?device=DEVICE_CODE` returns the phone React app shell and asks for the visitor name.
5. A phone visitor can enter a name, search songs, and add a song.
6. `GET /api/v1/jukebox/queue/:deviceId` shows that song and `added_by_name` equals the typed visitor name.
7. The kiosk queue row displays that requester name.

If Docker is unavailable:
Use native mode from the repo root:
1. `cd jukebox-web-controller && npm ci && npm run build`
2. `cd ../backend && npm ci && npm run db:migrate && npm run build && npm start`

Be careful:
- Do not turn this into a real product login flow.
- Do not require student accounts.
- Do not put the name/search/request form on the physical kiosk screen.
- Do not remove guest name entry.
- Do not bypass backend guest auth or queue logic.
- Do not claim success without the verification above.
- Preserve unrelated local changes if the server checkout is dirty.
```
