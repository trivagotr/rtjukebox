import { Router } from 'express';

export interface ApiRouters {
  identity: Router;
  admin: Router;
}

export function createApiRouter(routers: ApiRouters): Router {
  const router = Router();
  router.use('/identity', routers.identity);
  router.use('/admin', routers.admin);
  return router;
}
