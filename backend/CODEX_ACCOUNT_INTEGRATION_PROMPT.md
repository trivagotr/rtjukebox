# RadioTEDU Account + Focus Backend Prompt

You are working on the production/server copy of the RadioTEDU backend. Do not overwrite WordPress, `radiotedu.com`, the existing Jukebox controller, or any existing `/jukebox/*` API/static behavior. Keep all changes narrowly scoped and reversible.

## Objective

Prepare one secure RadioTEDU account system that can be shared by:

- the mobile app
- `radiotedu.com/focus`
- the Jukebox login/controller
- the Study/Library web room
- future `/spark` and `/rock` surfaces

## Existing Local Contract

The app now expects:

- `GET /api/v1/auth/me` with bearer JWT to include `is_guest`.
- `GET /api/v1/auth/session` with bearer JWT to return:
  - `user`
  - `account.scope = "radiotedu"`
  - `account.surfaces` including `mobile`, `focus`, `jukebox`, `study-library`
  - `points.gold_balance`
  - `points.lifetime_gold_earned`
  - endpoint hints for `/focus/`, `/api/v1/auth`, `/api/v1/study`, `/api/v1/jukebox`
- `GET /focus/` should serve the Focus/Library web app only. It must not capture or rewrite `/jukebox`, `/jukebox/*`, WordPress routes, or root site behavior.

The mobile app embeds Focus with a WebView and injects:

```js
window.RadioTEDUAppAuth = {
  type: "radiotedu-auth",
  source: "radiotedu-mobile",
  embedded: true,
  apiBase: "<mobile BASE_API>",
  accessToken: "<JWT access token>",
  user: { /* current RadioTEDU user */ }
};
```

The Focus web app also listens for the `radiotedu:auth` event and stores the token in `localStorage` keys:

- `radiotedu_access_token`
- `access_token`
- `radiotedu_api_base`
- `radiotedu_embedded_user`

## Required Backend Work

1. Verify the production server has strong `JWT_SECRET` and `JWT_REFRESH_SECRET` values. The server must fail to boot if missing outside tests.
2. Verify `users`, `refresh_tokens`, `user_points`, `points_ledger`, `study_sessions`, `avatar_items`, `avatar_inventory`, and `avatar_equipment` migrations exist and are applied.
3. Serve the Focus app at `https://radiotedu.com/focus/` without touching WordPress root pages or `/jukebox`.
4. Make `/api/v1/auth/session` the canonical "who am I and what can I use?" endpoint for mobile, Focus, Jukebox, and Study.
5. Keep all gold writes server-owned. Never trust client-reported elapsed time or reward amounts.
6. For Study rewards, use server timestamps, nonces, heartbeat limits, minimum valid duration, daily caps, idempotency/replay protection, and ledger rows.
7. For cosmetics, use backend-owned catalog/inventory/equipment. Clients may request purchase/equip, but pricing, ownership, and spendability must be checked server-side.
8. Prepare `/spark` and `/rock` as separate future surfaces without breaking existing radio streams. FLAC stream handling belongs to app/radio playback; AI generation does not belong inside the mobile app.

## Acceptance Checks

- Existing `radiotedu.com` and WordPress pages still work.
- Existing Jukebox QR/controller and `/jukebox/*` APIs still work.
- `GET /focus/` returns the Focus web page.
- `GET /api/v1/auth/session` requires a valid bearer token and returns the unified account payload.
- A user cannot mint gold by editing the browser, replaying requests, or changing client timers.
- Mobile app can log in once and open Focus without a second login prompt.

## Verification

Run the backend test/build commands in the server repo before claiming success. Report exact commands and failures if anything does not pass.
