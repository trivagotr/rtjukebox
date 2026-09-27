# RadioTEDU backend refactor

## Folder structure

```text
src/
  core/                 # Shared, domain-independent building blocks
  composition-root.ts   # Adapter and module dependency wiring
  modules/
    <module>/           # Feature modules and their layers
      *.router.ts       # Route mounting and middleware
      *.controller.ts   # HTTP input/output mapping
      *.service.ts      # Framework-independent business rules
      *.schema.ts       # Request validation schemas
      *.dto.ts          # Public response shapes and mapping
      ports/            # Repository and provider interfaces
      infra/            # Database and external-system adapters
  routes/               # Canonical API route composition
  app.ts                # Express application composition
  server.ts             # Process startup and shutdown
prisma/
  schema.prisma         # Prisma schema
  migrations/           # Versioned schema changes
```

## Layer rules

- Dependencies flow from router to controller to service to repository port to infrastructure adapter.
- Services do not import Express or Prisma. They use interfaces defined as ports.
- Controllers do not import infrastructure adapters.
- Infrastructure adapters implement ports; domain and service code do not depend on adapter details.
- System time and identifier generation enter through the shared `Clock` and `IdGenerator` ports. Spotify OAuth/playback HTTP uses a provider port; feed fetching, catalog access, audio probing, storage, and jobs also stay behind ports.
- Keep each file focused on one responsibility and keep admin behavior separate from public behavior.
- Database schema changes use Prisma migrations. Do not use `prisma db push` or raw SQL.
- The HTTP API has one canonical prefix: `/api/v1`.
- Compatibility aliases remain mounted only when they pass through the same authentication and authorization guards as their canonical routes.

## Implementation status and commands

The non-game backend implementation in this directory covers identity and refresh-token rotation; current-user, profile, avatar and leaderboard reads; device discovery, administration and expiring kiosk provisioning; queue reads/writes/votes, kiosk heartbeat/now-playing/autoplay, stopped-playback recovery, and radio-profile jingle/ad automation; authenticated Socket.IO device rooms; local/Spotify catalog, moderation and admin catalog operations; audio/avatar storage and processing; Spotify OAuth, per-device authorization, playback state and lyrics; podcast feeds with SSRF-safe fetching and queued synchronization; radio status/schedule/history and radio-profile administration. Feature modules are wired through the composition root. Admin routes share the central role guard, rate limit and audit middleware. Game/gamification is excluded by request.

This refactor remains isolated from the active backend in `../backend`; no production traffic, database migration, service restart or cutover has been performed. That is an operations boundary, not a missing feature implementation. Before deployment, compare the existing database schema with `prisma/schema.prisma`, establish and review a migration baseline for that database, configure Redis 5 or newer and all environment secrets, then run staging contract and Spotify account/device checks. The checked-in initial migration is generated from an empty database and must not be applied to an existing database as a baseline.

Run `npm run lint`, `npm test`, and `DATABASE_URL=<valid PostgreSQL URL> npm run typecheck`. Prisma client generation and validation do not connect to the database. The configured layer rules prohibit Prisma and Express imports from services and infrastructure imports from controllers.

Generate the OpenAPI document from the request Zod schemas with `npm run openapi:generate`; it writes `docs/openapi.json`. Audio processing requires `ffprobe` on `PATH` (or `FFPROBE_PATH`); Docker installs ffmpeg in the runtime image. Audio stream/container metadata is checked and files over four hours or 50 MB are rejected.

The `_template/` module is deliberately unmounted reusable scaffolding. Prisma migrations have not been applied to any database. The repositories target established legacy tables through Prisma adapters; database parity, safe baseline/cutover, deployment configuration, and live-token validation remain operational rollout tasks.
