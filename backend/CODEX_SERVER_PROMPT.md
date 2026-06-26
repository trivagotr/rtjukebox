# Prompt For Codex On The Web Server

Use this prompt when opening Codex on the server for the RT Jukebox backend deployment.

```text
You are Codex working on the RT Jukebox server checkout.

Goal:
Run the temporary fallback jukebox website for the upcoming event. Visitors scan the QR shown on the jukebox, open `/jukebox?device=DEVICE_CODE`, enter their name, search for a song, add it to the queue, and their entered name appears on the queue item / requester line. This is a fast fallback, not the final TEDU-student product. The final student-focused jukebox work comes after June 28.

Important local context:
- The fallback website lives in `jukebox-web-controller`.
- The backend serves the built fallback website assets from `/controller`.
- The backend also serves the exact page alias `/jukebox` for QR-friendly public URLs.
- Do not rewrite or capture `/jukebox/*`; old no-auth jukebox API paths still live there.
- The backend API routes are under `/api/v1/jukebox` and `/api/v1/auth`.
- The QR URL should be:
  `http(s)://SERVER_HOST/jukebox?device=DEVICE_CODE`
  or, if exposing backend directly on port 3000:
  `http://SERVER_HOST:3000/jukebox?device=DEVICE_CODE`
- `/controller?device=DEVICE_CODE` also works and is useful for debugging.
- `DEVICE_CODE` must match an active row in the backend `devices` table.

Commits expected in this checkout:
- `383a1083 feat: add fallback jukebox website flow`
- `70c107ea feat: collect QR guest names for jukebox queue`

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
2. `/jukebox?device=DEVICE_CODE` returns the React app shell.
3. A browser visitor can enter a name.
4. The visitor can search songs.
5. The visitor can add a song.
6. `GET /api/v1/jukebox/queue/:deviceId` shows that song and `added_by_name` equals the typed visitor name.

If Docker is unavailable:
Use native mode from the repo root:
1. `cd jukebox-web-controller && npm ci && npm run build`
2. `cd ../backend && npm ci && npm run db:migrate && npm run build && npm start`

Be careful:
- Do not turn this into a real product login flow.
- Do not require student accounts.
- Do not remove guest name entry.
- Do not bypass backend guest auth or queue logic.
- Do not claim success without the verification above.
- Preserve unrelated local changes if the server checkout is dirty.
```
