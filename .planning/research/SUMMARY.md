# Research Summary: RT Jukebox

## Stack

- Backend: Express, TypeScript, Postgres, Redis, Socket.IO, Firebase Admin, Spotify integration.
- Web controller: React, Vite, Axios, Socket.IO client.
- Kiosk: Browser-based kiosk player helpers and Spotify handoff logic.
- Mobile: React Native with Android mobile and automotive variants.

## Table Stakes

- Dependency audits must be clean across all package workspaces.
- Auth responses must not expose credential material.
- Database schema must match fields used by runtime routes.
- Mobile and backend must agree on request and response shapes for jukebox search.
- Android debug builds must produce mobile and automotive APK artifacts.

## Watch Out For

- Existing databases need idempotent `ALTER TABLE` coverage, not only fresh `CREATE TABLE` definitions.
- Production CORS must not fall back to permissive origins.
- RSS/XML parsing dependencies need audit attention because old parser stacks commonly pull vulnerable XML packages.
- Jukebox search response shape is `data.items`, not `data.songs`.

## Verification Source

See `docs/verification-2026-06-24.md`.
