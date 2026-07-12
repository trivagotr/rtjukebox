# Çim Alan Study Deployment Smoke Test

Use this after applying the Study backend work on `radiotedu.com` and after installing a mobile build that points at that backend.

## Required Setup

- Backend is deployed with the schema containing:
  - `study_sessions`
  - `study_session_events`
  - `avatar_items`
  - `avatar_inventory`
  - `avatar_equipment`
- Backend serves `/api/v1/study/*`.
- Test account is a registered user, not a guest.
- Mobile app is logged in once through the normal RadioTEDU auth flow.
- Android Auto / Automotive build is available for a car emulator or head unit check.

## Backend API Smoke

Use a real bearer token from the logged-in app session.

1. Confirm Study is authenticated:
   ```bash
   curl -i https://radiotedu.com/api/v1/study/avatar/catalog
   ```
   Expected: `401` without a bearer token.

2. Fetch avatar catalog:
   ```bash
   curl -s https://radiotedu.com/api/v1/study/avatar/catalog \
     -H "Authorization: Bearer $ACCESS_TOKEN"
   ```
   Expected: `success: true`, default clothes, `spark-hoodie`, and `rock-pin`.

3. Start a Çim alan session:
   ```bash
   curl -s https://radiotedu.com/api/v1/study/sessions/start \
     -H "Authorization: Bearer $ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"location":"chim-alan","clientSessionId":"smoke-chim-001"}'
   ```
   Expected: `session.location = chim-alan`, `session.status = active`, and a non-empty `nonce`.

4. Send a valid heartbeat:
   ```bash
   curl -s https://radiotedu.com/api/v1/study/sessions/$SESSION_ID/heartbeat \
     -H "Authorization: Bearer $ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"nonce":"'$NONCE'","focused":true,"foreground":true,"position":{"x":13,"y":18},"interaction":"seated"}'
   ```
   Expected: `success: true`, a new `nonce`, and `accepted_seconds` capped by the server.

5. Replay the old heartbeat nonce:
   ```bash
   curl -i https://radiotedu.com/api/v1/study/sessions/$SESSION_ID/heartbeat \
     -H "Authorization: Bearer $ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"nonce":"'$OLD_NONCE'","focused":true,"foreground":true,"position":{"x":13,"y":18},"interaction":"seated"}'
   ```
   Expected: `409`, no extra accepted seconds.

6. Finish the session with the current nonce:
   ```bash
   curl -s https://radiotedu.com/api/v1/study/sessions/$SESSION_ID/finish \
     -H "Authorization: Bearer $ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"nonce":"'$CURRENT_NONCE'"}'
   ```
   Expected: `success: true`, `session.status = finished`, and `awarded_points` determined by server-validated eligible time.

7. Replay the finish request:
   ```bash
   curl -s https://radiotedu.com/api/v1/study/sessions/$SESSION_ID/finish \
     -H "Authorization: Bearer $ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"nonce":"'$CURRENT_NONCE'"}'
   ```
   Expected: no duplicate point award.

8. Try a guest token or another user's session id:
   Expected: guest is `403`; cross-user session is rejected.

## Avatar Smoke

1. Fetch profile:
   ```bash
   curl -s https://radiotedu.com/api/v1/study/avatar/me \
     -H "Authorization: Bearer $ACCESS_TOKEN"
   ```
   Expected: owned default item ids and equipped slots.

2. Try equipping a paid item before buying it:
   ```bash
   curl -i https://radiotedu.com/api/v1/study/avatar/equip \
     -H "Authorization: Bearer $ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"slot":"top","itemId":"spark-hoodie"}'
   ```
   Expected: `403` unless the user already owns it.

3. Purchase a paid item:
   ```bash
   curl -s https://radiotedu.com/api/v1/study/avatar/purchase \
     -H "Authorization: Bearer $ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"itemId":"spark-hoodie"}'
   ```
   Expected: inventory is created once and spendable points decrease once.

4. Repeat the purchase:
   Expected: no duplicate inventory row and no repeated spend.

5. Equip the purchased item:
   ```bash
   curl -s https://radiotedu.com/api/v1/study/avatar/equip \
     -H "Authorization: Bearer $ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"slot":"top","itemId":"spark-hoodie"}'
   ```
   Expected: `equipped.top = spark-hoodie`.

## Mobile App Smoke

1. Log in once through the normal app login.
2. Open the bottom `Study` menu.
3. Confirm there is no second Study login screen.
4. Open `Çim alan`.
5. Confirm the native amphitheatre preview shows rows, stairs, seat dots, Spark, `rtAI - AI Host`, and Rock.
6. Tap `Closet`.
7. Confirm the closet shows slots: Hair, Top, Bottom, Shoes, Accessory.
8. Confirm paid clothes use backend purchase/equip calls and global spendable points.

## Android Auto Smoke

1. Launch the Automotive build on a car emulator or real head unit.
2. Confirm browse/actions expose only driver-safe media surfaces: radio, podcasts, rankings, and listen-only jukebox.
3. Confirm Study, Çim alan, avatar clothes, Spark, and Rock do not appear in:
   - browse categories
   - voice actions
   - playback queues
   - templates
4. Run mobile tests that include `androidReadiness.test.ts` and confirm the `study-phone-only` check passes.

## Success Criteria

- Points increase only through server-validated finish.
- Replayed heartbeat/finish requests do not award duplicate points.
- Guest and cross-user attempts are rejected.
- Clothing purchase cannot create negative spendable points.
- Paid clothes cannot be equipped before ownership.
- Mobile app reaches Study from the logged-in app session without another login.
- Android Auto remains media-only.
