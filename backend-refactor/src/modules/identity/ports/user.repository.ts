export interface IdentityUserRecord {
  id: string;
  email: string;
  passwordHash: string;
}

export interface NewIdentityUser {
  email: string;
  passwordHash: string;
}

export interface UserReader {
  findByEmail(email: string): Promise<IdentityUserRecord | null>;
  findById(id: string): Promise<IdentityUserRecord | null>;
}

export interface UserWriter {
  create(input: NewIdentityUser): Promise<IdentityUserRecord>;
}

export interface UserRepository extends UserReader, UserWriter {}
