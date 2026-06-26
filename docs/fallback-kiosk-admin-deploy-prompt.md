# Temporary Fallback Kiosk Admin Deploy Prompt

Paste this prompt into Codex running as Administrator on the RadioTEDU server.

```text
You are on the RadioTEDU server with Administrator rights.

Goal:
Safely deploy the temporary fallback jukebox from:

C:\Users\tuna.ozsari\rtjukebox-fallback-june28

to the live runtime:

C:\inetpub\rtjukebox

Absolute safety rules:
- NEVER delete, reset, wipe, truncate, drop, recreate, or overwrite unrelated parts of radiotedu.com, IIS config, database data, uploads, WordPress files, stream config, or any other website elements.
- Do NOT run destructive commands such as git reset --hard, git checkout -- ., Remove-Item -Recurse, robocopy /MIR, DROP, TRUNCATE, DELETE without a narrow WHERE, or blanket cleanup commands.
- Do NOT touch radiotedu.com root website files, WordPress files, stream service/config, or IIS site config unless explicitly required and confirmed first.
- Do NOT modify anything outside C:\inetpub\rtjukebox except creating backups under C:\Users\tuna.ozsari\rtjukebox-backups.
- Do NOT store Spotify account email/password anywhere. Not in .env, Git, Docker, docs, logs, commands, or screenshots.
- Do NOT put a jukebox device password in env or DB for this temporary setup. The fallback kiosk must use a no-password device for now. We can add a password later.
- Do NOT set KIOSK_DEFAULT_DEVICE_PASSWORD. It must be blank or absent.
- Do NOT add or print secrets in the terminal output.
- If any health check fails, stop and roll back from the backup.

Required live behavior:
- The kiosk monitor opens only:
  https://radiotedu.com/kiosk
- The kiosk URL must not require ?code=...
- The kiosk must not ask for visitor name.
- The kiosk must not show search, add-song controls, admin controls, or setup form.
- The kiosk screen should show only QR, now-playing, and queue/requester names.
- The QR target must be:
  https://radiotedu.com/jukebox?device=DEVICE_CODE
- The phone page handles visitor name, search, add-to-queue, and voting.
- Queue rows must show added_by_name/requester.

Before changing anything:
1. Confirm live health:
   - http://localhost:3000/health
   - https://radiotedu.com/jukebox/health
2. Confirm port 3000 is the existing jukebox backend process.
3. Create a timestamped backup folder:
   C:\Users\tuna.ozsari\rtjukebox-backups\pre-kiosk-admin-deploy-YYYYMMDD-HHMMSS
4. Backup at minimum:
   - C:\inetpub\rtjukebox\backend\.env
   - C:\inetpub\rtjukebox\backend\dist
   - C:\inetpub\rtjukebox\kiosk-web
   - C:\inetpub\rtjukebox\jukebox-web-controller\dist
   - C:\inetpub\rtjukebox\backend\package.json
   - C:\inetpub\rtjukebox\backend\package-lock.json
   - current PM2 status/dump/log paths if available
5. If pg_dump is available, create a database backup. If pg_dump is not available, do not improvise destructive DB commands. Record that DB dump tooling is unavailable.
6. Inspect active jukebox devices. Choose a temporary active device whose password is NULL or empty. Prefer the intended fallback kiosk device. Do NOT set a device password. If no no-password device exists, stop and ask the owner before modifying DB.

Build and verify source before live copy:
1. Work only in:
   C:\Users\tuna.ozsari\rtjukebox-fallback-june28
2. Run:
   - git status --short --branch
   - npm test in backend
   - npm run build in backend
   - npm test in kiosk-web
   - npm test in jukebox-web-controller
   - npm run build in jukebox-web-controller
3. If any test/build fails, stop. Do not deploy.

Update live .env safely:
1. Edit only:
   C:\inetpub\rtjukebox\backend\.env
2. Preserve existing DATABASE_URL, REDIS_URL, JWT secrets, Spotify app credentials, uploads paths, and live base path values.
3. Ensure KIOSK_DEFAULT_DEVICE_CODE is set to the chosen no-password device code.
4. Ensure KIOSK_DEFAULT_DEVICE_PASSWORD is removed or blank.
5. Ensure Spotify redirect URI matches the deployed callback:
   https://radiotedu.com/jukebox/api/v1/spotify/device-auth/callback
6. Do not add Spotify account password.
7. Do not print the .env contents.

Deploy files:
1. Copy only these from source to live:
   - backend\dist -> C:\inetpub\rtjukebox\backend\dist
   - kiosk-web -> C:\inetpub\rtjukebox\kiosk-web
   - jukebox-web-controller\dist -> C:\inetpub\rtjukebox\jukebox-web-controller\dist
   - backend package files only if needed
2. Use safe copy commands that overwrite files but do not delete destination folders.
3. Do NOT use robocopy /MIR.
4. Do NOT delete uploads, logs, .env, database files, WordPress files, or unrelated folders.

Restart:
1. Restart only the jukebox backend process.
2. Prefer PM2 restart of the existing jukebox-api process.
3. If PM2 is unavailable, identify the exact node process running:
   C:\inetpub\rtjukebox\backend\dist\server.js
   Restart only that backend process.
4. Do not restart IIS, WordPress, stream services, PostgreSQL, or Redis unless absolutely required and confirmed first.

Post-deploy verification:
1. http://localhost:3000/health returns {"status":"ok"}
2. https://radiotedu.com/jukebox/health returns {"status":"ok"}
3. https://radiotedu.com/kiosk returns HTTP 200.
4. The kiosk page has QR, now-playing, and queue.
5. The kiosk page has no visitor-name form, no search box, no add-song UI, and no setup form.
6. POST /api/v1/jukebox/kiosk/register with {} returns success, selected device, and kiosk_token.
7. QR target is /jukebox?device=DEVICE_CODE.
8. Phone page asks visitor name.
9. Song search works on the phone page.
10. Adding a song from the phone creates a queue item.
11. Queue item contains added_by_name.
12. Kiosk queue displays requester name.
13. Spotify status returns connected true, hasRefreshToken true, and spotifyProduct premium.
14. /api/v1/jukebox/kiosk/spotify-token returns HTTP 200.
15. Confirm stream host still responds.
16. Confirm the main radiotedu.com website was not modified.

Rollback rule:
- If any live health check fails or kiosk behavior is wrong, immediately restore the backed-up files and restart only the jukebox backend.
- Do not touch database during rollback unless you made a documented DB change.
- Never delete database data.
- Report:
  - backup path
  - chosen device code
  - exact files copied
  - exact process restarted
  - verification results
  - rollback result if rollback was needed
```

