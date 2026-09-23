# Security Review

Last reviewed: 2026-09-23

## Automated Gates

- `.github/workflows/ci.yml` runs lint, tests, builds, and npm audit for the backend, web controller, kiosk, and mobile packages; it also runs the PostgreSQL/Redis integration suite and Playwright critical-flow E2E suite.
- Gitleaks and Semgrep run in CI. `.github/workflows/codeql.yml` adds JavaScript/TypeScript CodeQL analysis, and `.github/dependabot.yml` schedules weekly npm and GitHub Actions dependency updates.
- `.github/workflows/nightly.yml` runs Trivy Dockerfile/image scans, OSV-Scanner, and OWASP ZAP against the built jukebox controller.
- Latest `npm audit --json` results: zero findings in `backend`, `jukebox-web-controller`, `kiosk-web`, and `e2e`; `mobile` has 7 moderate and 7 high findings. npm reports that resolving these requires major upgrades to React Native/Metro and React Navigation. The CI audit gate will fail for mobile until that migration is completed.
- Supertest API integration tests in `backend/src/routes/apiIntegration.test.ts` cover HTTP status codes, auth gating, RBAC, input validation, and Helmet security headers. Testcontainers coverage in `backend/src/routes/containerIntegration.test.ts` uses PostgreSQL and Redis.
- `npm run test:coverage` uses `@vitest/coverage-v8` and enforces a 70% line threshold for the CORS, JWT auth, and RBAC modules included by `backend/vitest.config.ts`; this is a focused baseline, not a repository-wide coverage claim.
- MSW-backed component/integration tests cover the web controller, kiosk Spotify device authorization, and mobile guest authentication. Playwright covers the guest/member jukebox queue and kiosk flow.

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
- Docker is unavailable in the local environment, so the Testcontainers PostgreSQL/Redis test and full database-backed Playwright E2E run are configured for CI but were not executed locally.
- Mobile dependency advisories remain open pending a React Native and React Navigation major-version migration; see the current audit gate above.
