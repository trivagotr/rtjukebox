import type {
  IdentityUserRecord,
  NewIdentityUser,
  UserReader,
  UserWriter,
} from './ports/user.repository.js';

export class IdentityService {
  constructor(
    private readonly users: UserReader & UserWriter,
  ) {}

  findByEmail(email: string): Promise<IdentityUserRecord | null> {
    return this.users.findByEmail(email);
  }

  findById(id: string): Promise<IdentityUserRecord | null> {
    return this.users.findById(id);
  }

  createUser(input: NewIdentityUser): Promise<IdentityUserRecord> {
    return this.users.create(input);
  }
}
