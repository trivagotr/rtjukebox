# RadioTEDU Server Codex Prompt: Safe Fallback Jukebox Backend + Kiosk Deploy

Paste this entire prompt into Codex running on the RadioTEDU server or in the server deployment workspace.

```text
You are Codex operating on the RadioTEDU production server/deployment workspace.

Goal:
Make the temporary RT Jukebox experience work for tomorrow with minimal risk:
- A kiosk browser opened at https://radiotedu.com/kiosk/ should work in fullscreen.
- The kiosk should not require ?code=.
- The kiosk should not ask for a jukebox device password.
- The kiosk should not ask the kiosk operator for "Spotify Bagla" after setup is complete.
- Visitors should scan the QR code, open the phone web page, enter their name, search/select music, and add songs to the queue.
- The kiosk should see the queue and play Spotify songs through the connected Spotify Premium account.

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
- Latest relevant source commit: 436369a7 feat: add RadioTEDU logo to jukebox
- Temporary GitHub Pages fallback is live at:
  - https://akgularda.github.io/kiosk/
  - https://akgularda.github.io/jukebox/
- The GitHub Pages site is static only. It does not replace the backend.
- The Pages deployment intentionally removed password transport from the kiosk bundle.
- The Jukebox phone UI includes a small RadioTEDU logo/brand mark.

Fresh external check from June 27, 2026:
- https://radiotedu.com/jukebox/health returns HTTP 200 with {"status":"ok"}, so a backend is reachable under /jukebox.
- https://radiotedu.com/kiosk/runtime-config.js currently returns 404, so the server is not serving the new runtime-config file yet.
- https://radiotedu.com/kiosk/config.js and https://radiotedu.com/kiosk/app.js currently still contain old forbidden setup/password patterns, so the production kiosk static files are stale and must be replaced from this branch.
- https://radiotedu.com/jukebox/ currently serves a Jukebox page, but its asset filenames do not match the latest current build, so the production phone static files are stale too.
- GET https://radiotedu.com/jukebox/api/v1/jukebox/kiosk/spotify-token reaches the backend and returns "Missing device_id" without a device id. This endpoint is GET, not POST.
- POST https://radiotedu.com/jukebox/api/v1/jukebox/kiosk/spotify-device-auth/status with a dummy device id reaches the backend but does not prove Spotify is connected. Verify with the real device id after deployment/OAuth.

Important architecture:
- GitHub Pages can serve only static files. It cannot run the Jukebox backend.
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
- The following GitHub Actions secrets are already set on trivagotr/rtjukebox:
  SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REDIRECT_URI
- GitHub secrets are write-only. Do not commit or print SPOTIFY_CLIENT_SECRET. If the production server deploy is not driven by GitHub Actions, set the same values in the server environment through the secure server secret/config path.

Expected production URLs:
- Kiosk: https://radiotedu.com/kiosk/
- Phone/guest jukebox: https://radiotedu.com/jukebox/
- Backend API base: https://radiotedu.com/jukebox or the existing production API base if this deployment uses a different reverse-proxy path.
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
2. Verify the branch contains commit e3aef15c or newer.
3. Do not merge unrelated local work into this deploy.

Step 3: Configure backend environment safely
1. Configure only the RT Jukebox backend environment.
2. Required backend env values should include the existing production database/JWT/CORS settings plus Spotify app settings:
   - DATABASE_URL or DB_HOST/DB_USER/DB_PASSWORD/DB_NAME as used by this backend
   - JWT_SECRET
   - JWT_REFRESH_SECRET
   - CORS_ORIGINS including https://radiotedu.com and https://akgularda.github.io if the GitHub fallback will also call this backend
   - PUBLIC_BASE_PATH or equivalent if the backend is mounted under /jukebox
   - SPOTIFY_CLIENT_ID
   - SPOTIFY_CLIENT_SECRET
   - SPOTIFY_REDIRECT_URI=https://radiotedu.com/jukebox/api/v1/spotify/device-auth/callback, unless route inspection proves a different public callback
3. Do not put the Spotify account email/password in env. Only Spotify app client id/secret belong in env.
4. Confirm Spotify Developer Dashboard has the exact redirect URI configured.

Step 4: Build and deploy static files
1. Run the repo's tests/builds needed for kiosk and phone web.
2. Build the phone/jukebox frontend with the correct public base path for https://radiotedu.com/jukebox/.
3. Prepare/copy kiosk files for https://radiotedu.com/kiosk/.
4. Ensure kiosk/runtime-config.js points to the production backend API base.
5. Preserve existing unrelated radiotedu.com files. Only update the RT Jukebox target paths.
6. Verify the deployed kiosk static files do not contain:
   - device_pwd
   - DEVICE_PWD
   - setupDevicePassword
   - ?code= as a required setup hint
   - old device password setup UI text

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
6. Confirm the QR code points to https://radiotedu.com/jukebox/ with the effective device identifier.
7. Scan the QR code from a phone.
8. On the phone page, enter a test visitor name.
9. Search for a Spotify track.
10. Add the track to the queue.
11. Confirm the kiosk queue updates.
12. Confirm playback starts or can be started on the kiosk Spotify player.
13. Confirm next-song/autoplay behavior if available.
14. Test a browser refresh of both kiosk and phone pages.

Step 8: Optional GitHub fallback wiring
If the event needs the fallback GitHub Pages URLs to use the same production backend:
1. Update only akgularda.github.io/kiosk/runtime-config.js, or the source artifact config, so:
   window.RADIOTEDU_KIOSK_CONFIG = {
     API_BASE_URL: "https://radiotedu.com/jukebox",
     PUBLIC_SITE_BASE_URL: "https://akgularda.github.io",
     QR_LINK_BASE_URL: "https://akgularda.github.io/jukebox"
   };
2. Do not put secrets in GitHub Pages.
3. Verify https://akgularda.github.io/kiosk/ can reach the backend if CORS allows it.

Step 9: Final report
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
