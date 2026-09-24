import type { PrismaClient } from '../../../../generated/prisma/client.js';
import { NotImplementedError } from '../../../core/errors/app-error.js';
import type {
  TemplateReader,
  TemplateRecord,
  TemplateWriter,
} from '../ports/template.repository.js';

export class PrismaTemplateRepository implements TemplateReader, TemplateWriter {
  constructor(_client: PrismaClient) {}

  async findById(_id: string): Promise<TemplateRecord | null> {
    throw new NotImplementedError('Template repository is not implemented yet');
  }

  async create(_input: Omit<TemplateRecord, 'id'>): Promise<TemplateRecord> {
    throw new NotImplementedError('Template repository is not implemented yet');
  }
}
