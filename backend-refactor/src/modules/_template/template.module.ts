import type { PrismaClient } from '../../../generated/prisma/client.js';
import { PrismaTemplateRepository } from './infra/prisma-template.repository.js';
import { createTemplateRouter } from './template.router.js';
import { TemplateService } from './template.service.js';

export function createTemplateModule(client: PrismaClient) {
  const repository = new PrismaTemplateRepository(client);
  const service = new TemplateService(repository, repository);

  return {
    router: createTemplateRouter(),
    service,
  };
}
