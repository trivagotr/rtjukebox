import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { loadEnvironment } from './core/config/env.js';
import { createAdminRouter } from './modules/admin/admin.router.js';
import { createIdentityModule } from './modules/identity/identity.module.js';
import { createApiRouter } from './routes/index.js';

export function createCompositionRoot() {
  const environment = loadEnvironment();
  const adapter = new PrismaPg({ connectionString: environment.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const identityModule = createIdentityModule(prisma);
  const adminRouter = createAdminRouter();
  const apiRouter = createApiRouter({
    identity: identityModule.router,
    admin: adminRouter,
  });

  return {
    apiRouter,
    environment,
    prisma,
  };
}
