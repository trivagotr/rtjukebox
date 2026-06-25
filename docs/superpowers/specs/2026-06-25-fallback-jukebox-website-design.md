# Fallback Jukebox Website Design

## Goal

Make the unreleased jukebox usable tomorrow through a no-account fallback website where visitors can choose songs and submit them to the existing backend queue.

## Scope

The fallback is not the real product launch surface. It should be a lightweight public web flow inside the existing `jukebox-web-controller` app, mounted by the backend at `/controller`, and wired to the current `/api/v1/jukebox` and `/api/v1/auth/guest` endpoints.

## User Flow

1. Visitor opens `/controller?device=<CODE>` or enters a device code.
2. The website automatically creates or restores an anonymous guest session.
3. The visitor searches the song catalog.
4. Search results are selectable.
5. Selecting a song posts it to the selected device queue.
6. Queue and now-playing state refresh from the existing backend/socket flow.

## Architecture

The backend remains the source of truth. The website should not bypass existing auth, device, guest-limit, queue, or scoring logic. Instead, it creates an anonymous guest via `/api/v1/auth/guest`, stores the returned guest token locally, and sends queue requests through `/api/v1/jukebox/queue` with the existing `x-guest-fingerprint` header.

The fallback UI lives in the current React/Vite controller to reuse runtime config, sockets, queue rendering, and helper tests. The app can retain admin/member controls for authenticated users, but the first visitor experience must be the no-account chooser rather than a login form.

## Backend Contract

- `GET /api/v1/jukebox/songs?search=<term>` returns selectable catalog items.
- `POST /api/v1/auth/guest` creates a guest token without requiring an account.
- `POST /api/v1/jukebox/queue` accepts guest tokens, requires `x-guest-fingerprint`, enforces the existing daily guest song limit, and returns a success response when a selectable song is queued.
- `GET /api/v1/jukebox/queue/:deviceId` returns queue state for the selected device.

## UI Requirements

- No required account form before choosing songs.
- The fallback state should clearly focus on device selection, search, results, and queue.
- Song cards must be tappable/clickable and show title, artist, and artwork when available.
- Guest status should explain the one-song fallback limit without pushing signup as the main flow.
- Empty, loading, and error states should be explicit and recoverable.

## Verification

- Add test coverage for automatic guest-session reuse/creation and guest queue request headers.
- Keep existing queue payload tests for Spotify and local catalog songs passing.
- Run backend focused tests around guest limits/queue behavior.
- Run web-controller tests, lint, and build.
- Smoke the local backend plus web controller enough to prove songs are searchable and queue requests are wired to the backend.
