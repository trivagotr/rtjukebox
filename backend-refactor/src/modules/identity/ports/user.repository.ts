export interface IdentityUserRecord {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string | null;
  role: string;
  isGuest: boolean;
  avatarUrl: string | null;
  rankScore: number;
  totalSongsAdded: number;
  totalUpvotesReceived: number;
  lastSuperVoteAt: Date | null;
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

export interface RefreshTokenRecord {
  id: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface UserReader {
  findByEmail(email: string): Promise<IdentityUserRecord | null>;
  findByLoginIdentifier(identifier: string): Promise<IdentityUserRecord | null>;
  findById(id: string): Promise<IdentityUserRecord | null>;
}

export interface UserWriter {
  create(input: NewIdentityUser): Promise<IdentityUserRecord>;
  createRefreshToken(input: NewRefreshToken): Promise<void>;
  updatePasswordHash(userId: string, passwordHash: string): Promise<void>;
  findActiveRefreshTokens(userId: string, now: Date): Promise<RefreshTokenRecord[]>;
  rotateRefreshToken(tokenId: string, userId: string, nextToken: NewRefreshToken): Promise<boolean>;
  deleteRefreshToken(tokenId: string, userId: string): Promise<void>;
  deleteAllRefreshTokens(userId: string): Promise<void>;
  isLoginLocked(identifierHash: string, now: Date): Promise<boolean>;
  recordLoginFailure(identifierHash: string, now: Date): Promise<boolean>;
  clearLoginFailures(identifierHash: string): Promise<void>;
}

export interface UserRepository extends UserReader, UserWriter {}
