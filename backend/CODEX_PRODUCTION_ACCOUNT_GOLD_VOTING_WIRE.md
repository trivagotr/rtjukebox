# RadioTEDU Production Account, Gold, and Voting Wire

You are Codex on the existing RadioTEDU production web server. Deploy the
current backend revision from the `codex/study-amphitheatre-handoff` branch
without disrupting WordPress, radiotedu.com root pages, `/jukebox`, SSL, DNS,
or any existing stream process.

## Goal

Make the mobile app's live account and points contract complete:

- `POST /jukebox/api/v1/auth/register` and `/auth/login` issue normal sessions.
- `GET /jukebox/api/v1/auth/me` returns the authenticated user with a numeric
  `gold_balance`, sourced from `user_points.spendable_points`.
- `GET /jukebox/api/v1/gamification/home` returns the authenticated points
  record, including `spendable_points`.
- `GET /api/v1/next-song-voting/rounds/active` remains available to the mobile
  voting client. Preserve the existing endpoint; do not alter vote integrity.

## Safety Rules

- Never run destructive commands (`git reset --hard`, database drops, broad
  deletes, WordPress reinstalls, or web-root replacement).
- Do not modify WordPress core, themes, plugins, uploads, its database, DNS,
  TLS certificates, Icecast, Spark, Rock, OBS, or unrelated services.
- Reuse the current backend service, reverse proxy, database, and environment
  files. Do not expose new public ports or log tokens/passwords.
- If the existing checkout has unrelated local changes, create a sibling
  release/worktree instead of overwriting it.

## Deploy

1. Record the current backend commit, service name, environment-file path, and
   existing `/api/v1` plus `/jukebox/api/v1` proxy rules.
2. Safely fetch and fast-forward the backend release to the current
   `codex/study-amphitheatre-handoff` revision.
3. Install production dependencies using the repository lockfile, run
   `npm run build`, then run the existing database migration command.
4. Confirm `user_points` exists and the backend's current-user query joins it:
   `COALESCE(up.spendable_points, 0) AS gold_balance`.
5. Restart only the existing backend service through its current process
   manager.

## Verify With a Controlled Account

Use a server-owned test account or an operator-provided account. Do not place
credentials in git, shell history, or logs.

1. Register or log in and obtain a short-lived bearer token.
2. Call `GET /jukebox/api/v1/auth/me` with that token. Assert:
   - HTTP 200
   - `data.user.id` is present
   - `data.user.gold_balance` is a number, including `0` for new users
   - `birth_year` and `preferred_language` round-trip when supplied
3. Call `GET /jukebox/api/v1/gamification/home` with the same token. Assert
   `data.points.spendable_points` is numeric and agrees with `gold_balance`.
4. Confirm unauthenticated versions of both endpoints return JSON 401.
5. Confirm `GET /api/v1/next-song-voting/rounds/active` returns JSON 200.
6. Confirm the normal WordPress homepage and `/wp-login.php` still respond
   normally after the backend reload.

## Report

Report deployed commit, migration result, backend service restarted, and only
status codes/field-presence checks. Never report tokens, passwords, or database
connection strings.
