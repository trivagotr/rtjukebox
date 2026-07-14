# Codex prompt: deploy RadioTEDU Study without touching Jukebox

Copy the prompt below into Codex on the RadioTEDU web server. Replace
`<STUDY_COMMIT_SHA>` with the pushed commit SHA supplied in the handoff.

---

You are working on the production server for `radiotedu.com`. Deploy the
RadioTEDU Study website and its authenticated API from this exact source:

- Repository: `https://github.com/trivagotr/rtjukebox.git`
- Branch: `codex/study-game-oss`
- Commit: `<STUDY_COMMIT_SHA>`
- Public Study URL: `https://radiotedu.com/study/`
- Existing API prefix: `https://radiotedu.com/jukebox/api/v1`
- Study API prefix: `https://radiotedu.com/jukebox/api/v1/study`

This is a production change. First inspect the server's current web root,
reverse-proxy configuration, Node service manager, live repository state,
environment-file locations, and database migration procedure. Do not assume
Nginx, PM2, systemd, or a particular directory until you verify it. Do not
print secrets or bearer tokens.

## Hard separation rule

Study/Habbo and Jukebox are separate products.

- Do not modify, replace, redirect, or remove `/juke-local`,
  `/juke-local/controller/`, or `/juke-local/kiosk/`.
- Do not deploy Study under `/juke-local`.
- Do not change the Music PC proxy or Jukebox controller backend.
- Preserve the current WordPress site and all unrelated routes.
- Mount only the new static Study client at `/study/` and update the existing
  main backend only for `/jukebox/api/v1/study` support.

## Safe deployment procedure

1. Record the current deployed revisions, service status, web configuration,
   and HTTP behavior for `/`, `/juke-local`, `/juke-local/controller/`,
   `/juke-local/kiosk/`, and `/jukebox/api/v1/health`. Save a timestamped copy
   of every configuration file you will change.
2. Fetch the repository and verify that `<STUDY_COMMIT_SHA>` exists on
   `origin/codex/study-game-oss`. Use a temporary release worktree or release
   directory at that exact commit; do not overwrite a dirty live checkout.
3. In `study-game`, run `npm ci`, `npm test`, and `npm run build`. Stop if any
   command fails. The deployable static files are in `study-game/dist`.
4. In `backend`, run `npm ci`, `npm test`, and `npm run build`. Stop if any
   command fails.
5. Back up the production PostgreSQL database using the server's established
   backup mechanism. Verify that the backup completed before changing schema.
6. Review `backend/src/db/schema.sql`. Apply it through the project's existing
   migration command (`npm run db:migrate`) using the production environment.
   The migration is additive/idempotent and includes Study chat/presence and
   avatar catalog updates. Never display the database URL.
7. Deploy the built backend using the server's established atomic release
   process, preserve its existing environment, and restart only the main
   RadioTEDU backend service. Confirm it returns healthy before proceeding.
8. Atomically publish the contents of `study-game/dist` at the exact `/study/`
   path. Keep `index.html` non-cacheable or short-lived; serve hashed assets
   with long-lived immutable caching. Preserve correct JavaScript, CSS, image,
   JSON, and source-map MIME types.
9. Add the smallest exact-path web-server rule needed for `/study/`. Do not add
   a catch-all that can capture `/juke-local`, `/jukebox`, or WordPress routes.
   `/study` may redirect to `/study/`; all `/study/` asset paths must resolve.
10. Apply a restrictive policy for Study: HTTPS only; no mixed content; no
    third-party cookies; `default-src 'self'`; scripts from self; images from
    self/data/blob; connections only to the RadioTEDU HTTPS/WSS origins; and
    no public framing. Add only the minimum style/font allowances required by
    the verified production build.

## Security behavior that must remain intact

- The hosted production game must not start from a normal public browser.
  Without `window.RadioTEDUStudyBridge`, every route and mode—including
  `?scene=engine-proof`—must show the locked “Open Study from the signed-in
  RadioTEDU app” screen.
- The signed-in mobile app injects an access token in memory before page boot.
  Tokens must never be placed in a URL, HTML file, log, analytics event,
  localStorage, sessionStorage, cookie, or deployed configuration.
- Do not create a server-side bypass, demo token, query-string token, public
  guest mode, or permissive CORS rule.
- Keep the API under the existing authenticated
  `/jukebox/api/v1/study` route. Unauthenticated API requests must be rejected.

## Required verification

After deployment, verify all of the following and report exact status codes,
service names, deployed commit, and rollback locations without exposing
secrets:

1. `/study/` and its hashed JS/CSS assets return successfully over HTTPS with
   the correct MIME types.
2. Opening `/study/`, `/study/?room=library`,
   `/study/?room=chim-alan`, and `/study/?scene=engine-proof` in an ordinary
   browser shows the locked app-only screen and does not start the game.
3. An unauthenticated call to each Study API family (summary, sessions,
   presence, chat, and avatar) is rejected with the expected auth status.
4. Using a real short-lived test account only through the app/WebView, verify
   Library and Çim Alan load, walking and sitting work, the timer starts while
   seated, presence/chat load, and leaving the screen finishes the session.
   Do not print or save the token used for this check.
5. Recheck `/juke-local`, `/juke-local/controller/`,
   `/juke-local/kiosk/`, the main website, and the existing backend health
   endpoint. Their behavior must match the pre-deploy baseline.
6. Check service logs for new errors while redacting authorization headers and
   credentials.

If any check fails, roll back the static `/study/` release, backend release,
web configuration, and database only as required by the server's established
rollback procedure. Do not attempt unrelated fixes. Finish with a concise
deployment report and the exact commit that is live.

---
