# RadioTEDU Server Codex Prompt: Safe Production Jukebox/Kiosk Deploy

Paste this entire prompt into Codex running on the RadioTEDU server or in the server deployment workspace.

```text
You are Codex operating on the RadioTEDU production server/deployment workspace.

Goal:
Make the RT Jukebox experience work tomorrow on the real RadioTEDU production domain with minimal risk:
- A kiosk browser opened at https://radiotedu.com/kiosk/ should work in fullscreen.
- The kiosk should not require ?code=.
- The kiosk should not ask for a jukebox device password.
- The kiosk should not ask the kiosk operator for "Spotify Bagla" after setup is complete.
- Visitors should scan the QR code, open https://radiotedu.com/jukebox/ with the kiosk device selected automatically from the QR URL, enter their own name, search/select music, and add songs to the queue.
- The kiosk should see the queue and play Spotify songs through the connected Spotify Premium account.
- Do not use akgularda.github.io or any GitHub Pages fallback for the final event flow. Everything user-facing must run from radiotedu.com.

Safety rules:
- Back up before changing anything.
- Do not delete, overwrite, or "clean up" unrelated production files.
- Do not nuke radiotedu.com, WordPress, uploads, stream files, IIS config, database files, certs, logs, or unrelated app directories.
- Do not run destructive commands such as rm -rf, git reset --hard, database drop/truncate, or recursive overwrite unless the exact target path has been backed up and verified to be only the RT Jukebox deployment path.
- If a target path already exists, back it up first with a timestamp and inspect it before replacing anything.
- Keep all secrets out of git, public web files, docs, logs, browser JS, and GitHub Pages.
- Do not store the Spotify account email/password in .env, GitHub secrets, source code, docs, logs, database notes, or browser-visible files.
- Spotify account credentials may only be typed into Spotify's own OAuth login page if an interactive login is absolutely required. The durable server-side state must be OAuth refresh tokens stored by the backend, not the Spotify password.

Known current GitHub state:
- Source repo/branch: https://github.com/trivagotr/rtjukebox, branch codex/fallback-jukebox-website
- Latest relevant source commit: 19f41bd8 docs: record spotify app secret handoff status, or newer.
- The static GitHub Pages fallback is no longer the target for this handoff. Ignore it unless explicitly asked later.
- The current branch intentionally removed password transport from the kiosk bundle.
- The Jukebox phone UI includes a small RadioTEDU logo/brand mark.

Fresh external check from June 27, 2026:
- https://radiotedu.com/jukebox/health returns HTTP 200 with {"status":"ok"}, so a backend is reachable under /jukebox.
- https://radiotedu.com/kiosk/runtime-config.js currently returns 404, so the server is not serving the new runtime-config file yet.
- https://radiotedu.com/kiosk/config.js and https://radiotedu.com/kiosk/app.js currently still contain old forbidden setup/password patterns, so the production kiosk static files are stale and must be replaced from this branch.
- https://radiotedu.com/jukebox/ currently serves a Jukebox page, but its asset filenames do not match the latest current build, so the production phone static files are stale too.
- GET https://radiotedu.com/jukebox/api/v1/jukebox/kiosk/spotify-token reaches the backend and returns "Missing device_id" without a device id. This endpoint is GET, not POST.
- POST https://radiotedu.com/jukebox/api/v1/jukebox/kiosk/spotify-device-auth/status with a dummy device id reaches the backend but does not prove Spotify is connected. Verify with the real device id after deployment/OAuth.

Important architecture:
- The working event setup needs:
  1. Backend API running on the RadioTEDU server.
  2. Database reachable by that backend.
  3. Static kiosk/phone web files served at radiotedu.com paths.
  4. Spotify OAuth app credentials configured on the backend.
  5. A completed kiosk Spotify device authorization stored in the backend database.

Spotify Developer app status from the preparation branch:
- App name: RadioTEDU Jukebox
- Client ID: 3e614227cdc440d68b4578cefda1256b
- Redirect URI already configured in Spotify Developer Dashboard:
  https://radiotedu.com/jukebox/api/v1/spotify/device-auth/callback
- SPOTIFY_CLIENT_SECRET was supplied by the owner in the private handoff. Do not print it, commit it, paste it into public docs, or place it in browser-visible static files. Put it only in the backend's secure server environment/config.
- GitHub secrets are write-only. If the production server deploy is not driven by GitHub Actions, do not try to read them from GitHub; set the same values in the server environment through the secure server secret/config path.

Expected production URLs:
- Kiosk: https://radiotedu.com/kiosk/
- Phone/guest jukebox: https://radiotedu.com/jukebox/
- Backend API base: https://radiotedu.com/jukebox or the existing production API base if this deployment uses a different reverse-proxy path.
- QR target from the kiosk must be:
  https://radiotedu.com/jukebox?device=DEVICE_CODE
  where DEVICE_CODE is filled automatically by the kiosk from the backend-selected kiosk device. Visitors should not have to type a code manually.
- Spotify device callback should match the backend route, likely:
  https://radiotedu.com/jukebox/api/v1/spotify/device-auth/callback
  Confirm the exact path from the backend routes before configuring Spotify.

Step 1: Identify and back up
1. Print the current working directory, git status, current branch, and remotes.
2. Locate the current radiotedu.com web root and any existing RT Jukebox/backend deployment path.
3. Locate backend .env/config files if they already exist.
4. Create timestamped backups before changing anything:
   - static kiosk/jukebox target directories
   - backend deployment directory
   - backend .env/config files
   - database backup/dump if a Jukebox database already exists
5. Store backups outside the web root if possible, or in a clearly named non-served backup directory.
6. Verify backups exist before continuing.

Step 2: Fetch the exact source branch
1. In a safe source checkout, run:
   git fetch origin codex/fallback-jukebox-website
   git checkout codex/fallback-jukebox-website
   git pull --ff-only origin codex/fallback-jukebox-website
2. Verify the branch contains commit 19f41bd8 or newer.
3. Do not merge unrelated local work into this deploy.

Step 3: Configure backend environment safely
1. Configure only the RT Jukebox backend environment.
2. Required backend env values should include the existing production database/JWT/CORS settings plus Spotify app settings:
   - DATABASE_URL or DB_HOST/DB_USER/DB_PASSWORD/DB_NAME as used by this backend
   - JWT_SECRET
   - JWT_REFRESH_SECRET
   - CORS_ORIGINS including https://radiotedu.com
   - PUBLIC_BASE_PATH or equivalent if the backend is mounted under /jukebox
   - SPOTIFY_CLIENT_ID=3e614227cdc440d68b4578cefda1256b
   - SPOTIFY_CLIENT_SECRET set to the owner-provided Spotify app secret in secure backend env only
   - SPOTIFY_REDIRECT_URI=https://radiotedu.com/jukebox/api/v1/spotify/device-auth/callback, unless route inspection proves a different public callback
3. Do not put the Spotify account email/password in env. Only Spotify app client id/secret belong in backend env.
4. Confirm Spotify Developer Dashboard has the exact redirect URI configured.
5. Confirm these values are not present in kiosk-web, jukebox-web-controller/public, built browser assets, docs, logs, or any public web file.

Step 4: Build and deploy static files
1. Run the repo's tests/builds needed for kiosk and phone web.
2. Build the phone/jukebox frontend with the correct public base path for https://radiotedu.com/jukebox/.
3. Prepare/copy kiosk files for https://radiotedu.com/kiosk/.
4. Ensure kiosk/runtime-config.js exists at https://radiotedu.com/kiosk/runtime-config.js and contains only non-secret public config, for example:
   window.RADIOTEDU_KIOSK_CONFIG = {
     API_BASE_URL: "https://radiotedu.com/jukebox",
     PUBLIC_SITE_BASE_URL: "https://radiotedu.com",
     QR_LINK_BASE_URL: "https://radiotedu.com/jukebox"
   };
5. Preserve existing unrelated radiotedu.com files. Only update the RT Jukebox target paths.
6. Verify the deployed kiosk static files do not contain:
   - device_pwd
   - DEVICE_PWD
   - setupDevicePassword
   - ?code= as a required setup hint
   - old device password setup UI text
7. Verify the deployed kiosk QR link resolves to https://radiotedu.com/jukebox?device=DEVICE_CODE, not /radio/jukebox and not a GitHub Pages URL.

Step 5: Start or restart backend
1. Use the existing service manager for this server: IIS reverse proxy, PM2, Docker Compose, Windows service, or the current production method.
2. Do not disturb unrelated radiotedu.com services.
3. Start/restart only the RT Jukebox backend.
4. Confirm logs show the backend listening and database connected.
5. Confirm public API health/status if such an endpoint exists.

Step 6: Complete Spotify connection once
1. Open https://radiotedu.com/kiosk/ in a browser on the kiosk/server machine.
2. If the kiosk shows "Spotify Bagla" or a Spotify setup prompt, start the connect flow.
3. Log in only through Spotify's own OAuth page with the private Spotify Premium account.
4. Approve the required playback scopes.
5. After callback, verify the backend stored kiosk Spotify authorization.
6. The durable success condition is not "the password was saved"; it is:
   - POST /api/v1/jukebox/kiosk/spotify-device-auth/status returns connected: true
   - hasRefreshToken: true
   - spotifyProduct: premium
   - GET /api/v1/jukebox/kiosk/spotify-token?device_id=DEVICE_ID returns HTTP 200
7. If the connect prompt appears again after refresh, inspect backend/database state instead of storing passwords.

Step 7: End-to-end event test
1. Open https://radiotedu.com/kiosk/ with no query string.
2. Confirm the kiosk does not ask for ?code=.
3. Confirm the kiosk does not ask for a visitor name.
4. Confirm the kiosk does not ask for a jukebox/device password.
5. Confirm the kiosk does not show "Spotify Bagla" after OAuth is complete.
6. Confirm the QR code points to https://radiotedu.com/jukebox?device=DEVICE_CODE with the effective device identifier.
7. Scan the QR code from a phone.
8. Confirm the phone page auto-selects the device from the QR URL and does not require manually entering a code.
9. On the phone page, enter a test visitor name.
10. Search for a Spotify track.
11. Add the track to the queue.
12. Confirm the kiosk queue updates and displays the requester name.
13. Confirm playback starts or can be started on the kiosk Spotify player.
14. Confirm next-song/autoplay behavior if available.
15. Test a browser refresh of both kiosk and phone pages.

Step 8: Final report
Report only after fresh verification. Include:
- Backup paths created.
- Git branch/commit deployed.
- Exact files/directories changed.
- Backend service name and status.
- Public URLs tested.
- Spotify status verification: connected true, hasRefreshToken true, premium, token endpoint 200.
- Any unresolved risks.

If anything is ambiguous or risky, stop and ask before changing production files.
```
