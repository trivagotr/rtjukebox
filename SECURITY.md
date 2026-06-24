# Security Review

Last reviewed: 2026-06-24

## Automated Gates

- `npm audit --json` passed with zero vulnerabilities in `backend`, `jukebox-web-controller`, `kiosk-web`, and `mobile`.
- `npx --yes audit-ci --moderate` passed in all four packages, with zero low, moderate, high, or critical findings.
- Source-level security checks passed for HTTP hardening, auth gates, secret handling, and vulnerable RSS dependency removal.

## Implemented Mitigations

| Area | Mitigation | Evidence |
|------|------------|----------|
| HTTP headers | Express uses Helmet. | `backend/src/server.ts` |
| Request abuse | Backend applies `express-rate-limit`. | `backend/src/server.ts` |
| CORS | Production requires explicit `CORS_ORIGINS`; backend and Socket.IO share the same resolver. | `backend/src/config/cors.ts`, `backend/src/server.ts`, `backend/src/socket.ts` |
| Secrets | Non-test backend startup fails when `JWT_SECRET` or `JWT_REFRESH_SECRET` is missing. | `backend/src/server.ts` |
| Auth response leakage | Auth session responses map users through sanitized DTOs and do not expose `password_hash`. | `backend/src/routes/auth.ts`, `backend/src/routes/authRegister.test.ts` |
| Password storage | Registered passwords and refresh tokens are hashed with bcrypt. | `backend/src/routes/auth.ts` |
| Jukebox mutations | Queue and vote routes require auth plus an active device session. | `backend/src/routes/jukebox.ts` |
| Gamification mutations | QR reward, game score, market, event, and listening routes are behind `authMiddleware`. | `backend/src/routes/gamification.ts` |
| Podcast feed administration | Feed create/sync/delete routes require auth and admin RBAC. | `backend/src/routes/podcastFeeds.ts` |
| RSS parsing | Vulnerable `react-native-rss-parser` is removed; backend and mobile use `fast-xml-parser`. | `backend/package.json`, `mobile/package.json` |
| Podcast defaults | Backend seeds known Radio TEDU RSS feeds before automatic startup sync. | `backend/src/services/defaultPodcastFeeds.ts`, `backend/src/server.ts` |

## Current Limits

- Manual device QA, release signing, and production deployment smoke tests remain outside this local review.
- QR rewards support code entry and app deep links such as `radiotedu://events/qr/<code>`; native in-app camera scanning is not implemented.
