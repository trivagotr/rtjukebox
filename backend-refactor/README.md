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
- Keep each file focused on one responsibility and keep admin behavior separate from public behavior.
- Database schema changes use Prisma migrations. Do not use `prisma db push` or raw SQL.
- The HTTP API has one canonical prefix: `/api/v1`.

## Scaffold status and commands

This directory remains isolated from the current production backend in `../backend`; it is not mounted into that application. Identity implements register, login, guest session, refresh rotation and logout, and the core includes HS256 access-token verification plus the central admin guard. Other business modules remain placeholders. Do not direct production traffic here until the remaining modules, deployment configuration and a deliberate cutover are complete.

Run `npm run lint` and `DATABASE_URL=<valid PostgreSQL URL> npm run typecheck`. Prisma client generation validates the schema and does not connect to the database. The configured layer rules prohibit Prisma and Express imports from services and infrastructure imports from controllers.

The `_template/` module is deliberately unmounted reusable scaffolding. Identity owns a Prisma migration generated from its schema; that migration has not been applied to any database. Domain migration, deployment cutover, and compatibility with the current production schema and tokens remain future work.
