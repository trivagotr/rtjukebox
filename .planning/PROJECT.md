# RT Jukebox

## What This Is

RT Jukebox is a multi-surface jukebox and radio application made of an Express/Postgres backend, a React web controller, a kiosk web app, and a React Native mobile app with mobile and automotive Android variants. This milestone pulled the existing repository, remediated security and integration gaps, and verified the backend-mobile-jukebox path end to end.

## Core Value

Users can register or continue as guests, connect to the jukebox backend, discover songs, access games/gamification, and use the mobile/kiosk surfaces against a working backend without known dependency vulnerabilities.

## Requirements

### Validated

- [x] Repository is cloned and dependencies install for backend, web controller, kiosk web, and mobile.
- [x] Configured package audits report zero vulnerabilities across all Node workspaces.
- [x] Backend authentication accepts registered users and guests against a real Postgres database.
- [x] Backend database schema contains runtime columns used by auth and jukebox routes.
- [x] Backend-mobile-jukebox song search contract returns `data.items` and the mobile app consumes that shape.
- [x] Android mobile and automotive debug APKs build successfully.

### Active

- [x] Complete the verified hardening and integration milestone represented by this planning state.

### Out of Scope

- Production deployment - local verification only.
- Store signing and release distribution - debug APKs were verified.
- Manual QA on physical Android/automotive devices - build and runtime contracts were verified locally.

## Context

- Backend package: `backend`, Express/TypeScript, Postgres, Redis, Socket.IO, Firebase Admin, Spotify integration.
- Web controller package: `jukebox-web-controller`, React/Vite.
- Kiosk package: `kiosk-web`, browser-based kiosk player helpers.
- Mobile package: `mobile`, React Native with Android mobile and automotive variants.
- Verification evidence is tracked in `docs/verification-2026-06-24.md`.

## Constraints

- **Security**: Dependency audits must stay at zero known vulnerabilities before shipping.
- **Backend/database**: Runtime routes must be backed by schema columns in `backend/src/db/schema.sql`.
- **Communication contract**: Mobile calls to backend jukebox endpoints must use structured Axios params and consume the backend response shape.
- **Android**: Mobile readiness requires both `assembleMobileDebug` and `assembleAutomotiveDebug` to build.
- **GSD**: This planning state was initialized after implementation, so the first roadmap phase records verified completed work rather than future implementation work.

## Current State

v1.0 Verified Hardening and Integration is complete, audited, archived, and ready to tag. Active v1.0 requirements were archived to `.planning/milestones/v1.0-REQUIREMENTS.md`; phase artifacts were archived under `.planning/milestones/v1.0-phases/`.

## Next Milestone Goals

- Define production deployment smoke tests and environment checks.
- Define Android signing, distribution, and install verification.
- Define physical mobile and automotive device QA coverage.
- Keep security audits, backend database migrations, and backend-mobile contract tests as release gates.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Replace vulnerable RSS parser dependency with `fast-xml-parser` | Remove vulnerable transitive XML dependency while preserving podcast feed parsing | Good |
| Centralize CORS allowlist and require `CORS_ORIGINS` in production | Avoid permissive production origin handling | Good |
| Sanitize auth responses through mapping helpers | Prevent `password_hash` from leaking in register/login/guest responses | Good |
| Add idempotent user schema columns for auth and jukebox runtime fields | Existing databases need repair as well as fresh schema correctness | Good |
| Use Axios params for mobile jukebox search | Avoid raw query interpolation and preserve backend-mobile contract | Good |

---
*Last updated: 2026-06-24 after verified hardening and integration milestone.*
