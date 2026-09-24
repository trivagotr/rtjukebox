export interface IdentityUserRecord {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string | null;
  role: string;
  isGuest: boolean;
}

export interface NewIdentityUser {
  email: string;
  displayName: string;
  passwordHash: string | null;
  role?: string;
  isGuest?: boolean;
}

export interface NewRefreshToken {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface UserReader {
  findByEmail(email: string): Promise<IdentityUserRecord | null>;
  findById(id: string): Promise<IdentityUserRecord | null>;
}

export interface UserWriter {
  create(input: NewIdentityUser): Promise<IdentityUserRecord>;
  createRefreshToken(input: NewRefreshToken): Promise<void>;
  findRefreshTokenByHash(tokenHash: string): Promise<{ user: IdentityUserRecord; tokenId: string; expiresAt: Date } | null>;
  rotateRefreshToken(oldTokenHash: string, nextToken: NewRefreshToken): Promise<IdentityUserRecord | null>;
  deleteRefreshToken(tokenHash: string): Promise<void>;
}

export interface UserRepository extends UserReader, UserWriter {}
