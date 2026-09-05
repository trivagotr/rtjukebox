import { beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const { mockConnect, mockGlobalQuery } = vi.hoisted(() => ({
  mockConnect: vi.fn(),
  mockGlobalQuery: vi.fn(),
}));

vi.mock('../db', () => ({
  db: {
    query: mockGlobalQuery,
    pool: { connect: mockConnect },
  },
}));

import {
  createRefreshToken,
  deriveLegacyRefreshSessionFamilyId,
  getRefreshTokenHashInput,
  JWT_REFRESH_SECRET,
  revokeRefreshTokenSession,
  rotateRefreshTokenSession,
} from './auth';

type RefreshRow = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  session_family_id: string | null;
};

type TestUser = {
  id: string;
  email: string;
  role: string;
  display_name: string;
  gold_balance: number;
};

class TransactionalRefreshStore {
  rows: RefreshRow[];
  readonly trace: string[] = [];
  readonly user: TestUser | null;
  private lockTail: Promise<void> = Promise.resolve();
  private nextId = 1;

  constructor(rows: RefreshRow[], user: TestUser | null) {
    this.rows = rows;
    this.user = user;
  }

  createClient(label: string, failInsert = false) {
    let releaseLock: (() => void) | null = null;
    const deletedRows: RefreshRow[] = [];
    const insertedIds: string[] = [];

    const acquireLock = async () => {
      let unlock!: () => void;
      const held = new Promise<void>((resolve) => {
        unlock = resolve;
      });
      const previous = this.lockTail;
      this.lockTail = previous.then(() => held);
      await previous;
      releaseLock = unlock;
    };

    const finish = () => {
      releaseLock?.();
      releaseLock = null;
    };

    return {
      query: vi.fn(async (sql: string, params: any[] = []) => {
        const normalized = sql.replace(/\s+/g, ' ').trim();
        this.trace.push(`${label}:${normalized}`);

        if (normalized === 'BEGIN') return { rows: [] };

        if (normalized === 'SELECT id FROM users WHERE id = $1 FOR UPDATE') {
          await acquireLock();
          return { rows: [{ id: String(params[0]) }] };
        }

        if (normalized.includes('FROM refresh_tokens') && normalized.includes('FOR UPDATE')) {
          const userId = String(params[0]);
          const sessionFamilyId = params[1] ? String(params[1]) : null;
          return {
            rows: this.rows
              .filter((row) => (
                row.user_id === userId
                && row.expires_at.getTime() > Date.now()
                && (!sessionFamilyId || row.session_family_id === sessionFamilyId)
              ))
              .map(({ id, token_hash }) => ({ id, token_hash })),
          };
        }

        if (normalized.includes('FROM users u')) {
          return { rows: this.user ? [this.user] : [] };
        }

        if (normalized.startsWith('DELETE FROM refresh_tokens')) {
          if (normalized.includes('session_family_id')) {
            const [userId, sessionFamilyId] = params.map(String);
            const removed = this.rows.filter(
              (row) => row.user_id === userId && row.session_family_id === sessionFamilyId,
            );
            deletedRows.push(...removed);
            this.rows = this.rows.filter((row) => !removed.includes(row));
            return { rows: removed.map(({ id }) => ({ id })) };
          }
          const [tokenId, userId] = params.map(String);
          const index = this.rows.findIndex(
            (row) => row.id === tokenId && row.user_id === userId,
          );
          if (index === -1) return { rows: [] };
          deletedRows.push(...this.rows.splice(index, 1));
          return { rows: [{ id: tokenId }] };
        }

        if (normalized.startsWith('INSERT INTO refresh_tokens')) {
          if (failInsert) throw new Error('simulated insert failure');
          const id = `replacement-${this.nextId++}`;
          insertedIds.push(id);
          this.rows.push({
            id,
            user_id: String(params[0]),
            token_hash: String(params[1]),
            expires_at: params[2] as Date,
            session_family_id: String(params[3]),
          });
          return { rows: [] };
        }

        if (normalized === 'COMMIT') {
          finish();
          return { rows: [] };
        }

        if (normalized === 'ROLLBACK') {
          this.rows = this.rows.filter((row) => !insertedIds.includes(row.id));
          for (const row of deletedRows) {
            if (!this.rows.some((candidate) => candidate.id === row.id)) this.rows.push(row);
          }
          finish();
          return { rows: [] };
        }

        throw new Error(`Unexpected SQL in refresh test: ${normalized}`);
      }),
      release: vi.fn(() => {
        this.trace.push(`${label}:RELEASE`);
        finish();
      }),
    };
  }
}

async function createStoredToken(userId = 'user-refresh') {
  const token = createRefreshToken(userId, 'student@tedu.edu.tr', 'user');
  const sessionFamilyId = String((jwt.decode(token) as jwt.JwtPayload).sid);
  const tokenHash = `sha256:${await bcrypt.hash(getRefreshTokenHashInput(token), 4)}`;
  return {
    token,
    row: {
      id: 'refresh-original',
      user_id: userId,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + 60_000),
      session_family_id: sessionFamilyId,
    } satisfies RefreshRow,
  };
}

const user: TestUser = {
  id: 'user-refresh',
  email: 'student@tedu.edu.tr',
  role: 'user',
  display_name: 'Student',
  gold_balance: 175,
};

describe('atomic refresh-token rotation', () => {
  beforeEach(() => {
    mockConnect.mockReset();
    mockGlobalQuery.mockReset();
  });

  it('allows exactly one of two concurrent rotations of the same token', async () => {
    const { token, row } = await createStoredToken();
    const store = new TransactionalRefreshStore([row], user);
    let clientNumber = 0;
    mockConnect.mockImplementation(async () => store.createClient(`client-${++clientNumber}`));

    const results = await Promise.all([
      rotateRefreshTokenSession(token, user.id),
      rotateRefreshTokenSession(token, user.id),
    ]);

    expect(results.map(({ status }) => status).sort()).toEqual(['invalid', 'rotated']);
    expect(store.trace.filter((entry) => entry.includes('INSERT INTO refresh_tokens'))).toHaveLength(1);
    expect(store.trace.filter((entry) => entry.endsWith(':COMMIT'))).toHaveLength(1);
    expect(store.trace.filter((entry) => entry.endsWith(':ROLLBACK'))).toHaveLength(1);
    expect(store.trace.filter((entry) => entry.includes('FOR UPDATE'))).toHaveLength(4);
    expect(mockGlobalQuery).not.toHaveBeenCalled();
  });

  it('rolls back and restores the consumed token when replacement storage fails', async () => {
    const { token, row } = await createStoredToken();
    const store = new TransactionalRefreshStore([row], user);
    const client = store.createClient('client-failure', true);
    mockConnect.mockResolvedValue(client);

    await expect(rotateRefreshTokenSession(token, user.id)).rejects.toThrow(
      'simulated insert failure',
    );

    expect(store.rows).toEqual([row]);
    expect(store.trace).toEqual([
      'client-failure:BEGIN',
      expect.stringContaining('client-failure:SELECT id FROM users'),
      expect.stringContaining('client-failure:SELECT id, token_hash'),
      expect.stringContaining('client-failure:SELECT u.*'),
      expect.stringContaining('client-failure:DELETE FROM refresh_tokens'),
      expect.stringContaining('client-failure:INSERT INTO refresh_tokens'),
      'client-failure:ROLLBACK',
      'client-failure:RELEASE',
    ]);
  });

  it('rolls back without consuming a valid token when the account is unavailable', async () => {
    const { token, row } = await createStoredToken();
    const store = new TransactionalRefreshStore([row], null);
    mockConnect.mockResolvedValue(store.createClient('client-banned'));

    const result = await rotateRefreshTokenSession(token, user.id);

    expect(result).toEqual({ status: 'user-unavailable' });
    expect(store.rows).toEqual([row]);
    expect(store.trace.some((entry) => entry.includes('DELETE FROM refresh_tokens'))).toBe(false);
    expect(store.trace).toContain('client-banned:ROLLBACK');
    expect(store.trace.at(-1)).toBe('client-banned:RELEASE');
  });

  it('keeps rotating legacy refresh hashes for tokens issued without a jti', async () => {
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_REFRESH_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' },
    );
    const legacyHash = await bcrypt.hash(token, 4);
    const store = new TransactionalRefreshStore(
      [{
        id: 'refresh-legacy',
        user_id: user.id,
        token_hash: legacyHash,
        expires_at: new Date(Date.now() + 60_000),
        session_family_id: null,
      }],
      user,
    );
    mockConnect.mockResolvedValue(store.createClient('client-legacy'));

    const result = await rotateRefreshTokenSession(token, user.id);

    expect(result.status).toBe('rotated');
    expect(store.trace).toContain('client-legacy:COMMIT');
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].token_hash).toMatch(/^sha256:\$2/);
    expect(store.rows[0].session_family_id).toBe(
      deriveLegacyRefreshSessionFamilyId(token),
    );
  });

  it('preserves one session family across access and refresh rotation', async () => {
    const { token, row } = await createStoredToken();
    const originalSid = row.session_family_id;
    const store = new TransactionalRefreshStore([row], user);
    mockConnect.mockResolvedValue(store.createClient('client-family'));

    const result = await rotateRefreshTokenSession(token, user.id);

    expect(result.status).toBe('rotated');
    if (result.status !== 'rotated') throw new Error('Expected rotation');
    expect((jwt.decode(result.tokens.access_token) as jwt.JwtPayload).sid).toBe(originalSid);
    expect((jwt.decode(result.tokens.refresh_token) as jwt.JwtPayload).sid).toBe(originalSid);
    expect(store.rows[0].session_family_id).toBe(originalSid);
  });

  it('leaves no live family when refresh and logout race', async () => {
    const { token, row } = await createStoredToken();
    const store = new TransactionalRefreshStore([row], user);
    let clientNumber = 0;
    mockConnect.mockImplementation(async () => store.createClient(`race-${++clientNumber}`));

    const [rotation, revocation] = await Promise.all([
      rotateRefreshTokenSession(token, user.id),
      revokeRefreshTokenSession(token),
    ]);

    expect(['rotated', 'invalid']).toContain(rotation.status);
    expect(revocation.sessionFamilyId).toBe(row.session_family_id);
    expect(store.rows.filter((candidate) => (
      candidate.user_id === user.id
      && candidate.session_family_id === row.session_family_id
    ))).toHaveLength(0);
  });

  it('also closes the deterministic successor when legacy refresh and logout race', async () => {
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_REFRESH_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' },
    );
    const successorSid = deriveLegacyRefreshSessionFamilyId(token);
    const store = new TransactionalRefreshStore(
      [{
        id: 'refresh-legacy-race',
        user_id: user.id,
        token_hash: await bcrypt.hash(token, 4),
        expires_at: new Date(Date.now() + 60_000),
        session_family_id: null,
      }],
      user,
    );
    let clientNumber = 0;
    mockConnect.mockImplementation(async () => store.createClient(`legacy-race-${++clientNumber}`));

    const [rotation, revocation] = await Promise.all([
      rotateRefreshTokenSession(token, user.id),
      revokeRefreshTokenSession(token),
    ]);

    expect(['rotated', 'invalid']).toContain(rotation.status);
    expect(revocation.sessionFamilyId).toBe(successorSid);
    expect(store.rows.filter((candidate) => (
      candidate.user_id === user.id
      && (candidate.session_family_id === null || candidate.session_family_id === successorSid)
    ))).toHaveLength(0);
  });
});
