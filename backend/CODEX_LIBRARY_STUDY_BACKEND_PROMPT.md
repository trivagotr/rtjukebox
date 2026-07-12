# Codex Prompt: RadioTEDU Library Study Backend Integration

Use this prompt in the backend/web-server Codex thread for the current mobile Study room work.

## Context

RadioTEDU mobile now preserves the generated `library-habbo.png` room artwork and renders a local `Y` / `You` marker over it. The marker walks with deterministic A* movement on a semantic grid instead of using fragile seated full-body sprites. The Çim alan room already has semantic seats, shared occupancy, and room presence endpoints.

Do not redesign the library art. Do not revive the failed full-body seated sprite approach unless a future asset is visually proven by screenshot.

## Backend Work Needed

1. Add backend semantic state for the `library` Study room.
   - Extend `/api/v1/gamification/study-room?room_id=library`.
   - Return room metadata for the preserved Library room.
   - Include stable walkable/blocked/interaction-zone semantics or a compact version/hash that mobile can compare against.
   - Include future `seatId` entities only if they can be represented as robust markers/badges, not fake seated sprites.

2. Add presence support for Library walking.
   - Reuse `/api/v1/gamification/study-room/heartbeat`.
   - Accept `room_id: "library"`.
   - Accept `position: {x, y}` from the mobile semantic grid.
   - Accept `presence_mode` values such as `idle`, `walking`, `studying`, `break`.
   - Do not award study/gold seconds from pure movement heartbeats. Rewarding must remain tied to validated Study/Pomodoro/listening sessions.

3. Multi-user rendering contract.
   - Return participants with:
     - `user_id`
     - `display_name`
     - `position`
     - optional `seat_id`
     - `presence_mode`
     - `avatar_style`
     - `equipped_outfit`
     - `last_seen_at`
   - Ensure one user cannot occupy multiple seats in the same room.
   - Ensure one seat cannot be occupied by multiple users.
   - Expire stale participants so the room does not show ghosts.

4. Gold / points / Pomodoro integrity.
   - Keep Study/Pomodoro reward validation backend-owned.
   - Preserve nonce rotation, daily caps, idempotent finish behavior, and session history.
   - Add or verify radio-listening reward validation separately from Study room movement.
   - Do not trust client-sent elapsed time without server-side validation.

5. Shop and cosmetics.
   - `/study/avatar/me` should return inventory, equipped cosmetics, and points.
   - `/study/avatar/purchase` should spend points transactionally and return updated points.
   - Keep cosmetics available for profile/portrait/badge rendering; do not require room full-body sprite matching.

6. Spark and Rock metadata.
   - Keep `/spark` and `/rock` as Icecast playback targets.
   - They may be unavailable before broadcast launch; backend/config should make that state explicit.
   - Expose stable IDs, mount paths, stream URLs, quality variants, codec labels, FLAC availability, and live/unavailable state.

7. Future school locations from 360 tour screenshots.
   - Repo contains 360 reference screenshots such as:
     - `tedu-360-clean-page.png`
     - `tedu-360-direct-accepted.png`
     - `tedu-360-direct.png`
     - `tedu-360-iframe.png`
     - `tedu-360-page.png`
     - `tedu-360-panorama-crop.png`
     - `tedu-360-scenes/`
     - `tedu-360-scenes-clean/`
     - `tedu-360-rotated-refs/`
   - Backend should model future spaces as semantic room records independent of visual generation.
   - Mobile can later attach generated same-style bitmap art per room.

## Acceptance Criteria

- `library` room state returns without breaking existing `chim-alan`.
- Library movement heartbeats update participant positions but do not mint points.
- Study/Pomodoro rewards remain validated by backend sessions only.
- Stale room participants expire.
- Seat conflicts return `409` only when a real seat entity is involved.
- Avatar purchase cannot make spendable points negative.
- Spark/Rock metadata can represent unavailable streams gracefully.

## Suggested Tests

- `GET /gamification/study-room?room_id=library` returns a Library room definition.
- `POST /gamification/study-room/heartbeat` with `room_id=library` stores/returns participant position.
- A movement heartbeat with `studied_seconds_delta: 0` does not create points ledger entries.
- Two users can stand near each other in Library without seat conflict.
- If Library seats are added later, two users cannot claim the same `seat_id`.
- Stale participants are excluded after the configured TTL.
- Avatar profile and purchase responses include updated `points`.
- Spark/Rock metadata includes `/spark`, `/rock`, FLAC variants, and availability flags.
