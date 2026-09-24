import type { PrismaClient } from '../../../../generated/prisma/client.js';
import { NotImplementedError } from '../../../core/errors/app-error.js';
import type {
  IdentityUserRecord,
  NewIdentityUser,
  UserRepository,
} from '../ports/user.repository.js';

export class PrismaUserRepository implements UserRepository {
  constructor(_client: PrismaClient) {}

  async findByEmail(_email: string): Promise<IdentityUserRecord | null> {
    throw new NotImplementedError('Identity repository is not implemented yet');
  }

  async findById(_id: string): Promise<IdentityUserRecord | null> {
    throw new NotImplementedError('Identity repository is not implemented yet');
  }

  async create(_input: NewIdentityUser): Promise<IdentityUserRecord> {
    throw new NotImplementedError('Identity repository is not implemented yet');
  }
}
