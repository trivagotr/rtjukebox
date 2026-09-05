import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockDbQuery,
    mockClientQuery,
    mockPoolConnect,
    mockClientRelease,
    mockDbClient,
    mockSendSuccess,
    mockSendError,
    mockCreateAuthRateLimiter,
    mockStartLimiter,
    mockExchangeLimiter,
    mockCreateAuthSession,
    mockTryAwardFirstLogin,
    mockRouteHandlers,
    mockRouter,
} = vi.hoisted(() => {
    const handlers: Record<string, Record<string, (...args: any[]) => any>> = {
        get: {},
        post: {},
        delete: {},
    };
    const router: any = {};
    for (const method of ['get', 'post', 'delete'] as const) {
        router[method] = vi.fn((routePath: string, ...routeHandlers: Array<(...args: any[]) => any>) => {
            handlers[method][routePath] = routeHandlers[routeHandlers.length - 1];
            return router;
        });
    }
    const startLimiter = vi.fn();
    const exchangeLimiter = vi.fn();
    const clientQuery = vi.fn();
    const clientRelease = vi.fn();
    const dbClient = {query: clientQuery, release: clientRelease};
    return {
        mockDbQuery: vi.fn(),
        mockClientQuery: clientQuery,
        mockPoolConnect: vi.fn().mockResolvedValue(dbClient),
        mockClientRelease: clientRelease,
        mockDbClient: dbClient,
        mockSendSuccess: vi.fn(),
        mockSendError: vi.fn(),
        mockCreateAuthRateLimiter: vi.fn()
            .mockReturnValueOnce(startLimiter)
            .mockReturnValueOnce(exchangeLimiter),
        mockStartLimiter: startLimiter,
        mockExchangeLimiter: exchangeLimiter,
        mockCreateAuthSession: vi.fn(),
        mockTryAwardFirstLogin: vi.fn(),
        mockRouteHandlers: handlers,
        mockRouter: router,
    };
});

vi.mock('express', () => ({
    Router: vi.fn(() => mockRouter),
}));

vi.mock('../db', () => ({
    db: {
        query: mockDbQuery,
        pool: {connect: mockPoolConnect},
    },
}));

vi.mock('../middleware/auth', () => ({
    authMiddleware: vi.fn(),
}));

vi.mock('./auth', () => ({
    createAuthRateLimiter: mockCreateAuthRateLimiter,
    createAuthSession: mockCreateAuthSession,
    REGISTRATION_PRIVACY_VERSION: 'privacy-test',
    REGISTRATION_TERMS_VERSION: 'terms-test',
}));

vi.mock('../utils/response', () => ({
    sendSuccess: mockSendSuccess,
    sendError: mockSendError,
}));

vi.mock('../services/economy', () => ({
    tryAwardFirstLogin: mockTryAwardFirstLogin,
}));

vi.mock('../services/erpIdentity', () => ({
    buildErpAuthorizeUrl: vi.fn(() => 'https://radiotedu.com/erp/oauth/authorize?state=state'),
    buildErpResultUri: vi.fn(() => 'radiotedu://auth/erp/linked'),
    createOpaqueToken: vi.fn(() => 'o'.repeat(43)),
    createPkcePair: vi.fn(() => ({verifier: 's'.repeat(64), challenge: 'c'.repeat(43)})),
    encryptErpToken: vi.fn((value: string) => `encrypted:${value}`),
    exchangeErpAuthorizationCode: vi.fn(),
    fetchErpIdentityProfile: vi.fn(),
    hashOpaqueToken: vi.fn((value: string) => `hash:${value}`),
    isErpIdentityEnabled: vi.fn(() => true),
    resolveErpReturnUri: vi.fn((value?: string) => value ?? 'radiotedu://auth/erp/linked'),
}));

import {deriveClientS256CodeChallenge} from './erpIdentity';

const LOGIN_CODE = 'l'.repeat(43);
const RFC_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const RFC_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const USER_ROW = {
    id: 'user-1',
    email: 'member@example.test',
    display_name: 'Member',
    role: 'user',
    is_guest: false,
};

function configureExchangeDatabase(
    storedChallenge: string | null,
    options: {user?: Record<string, unknown> | null} = {},
) {
    let transactionOpen = false;
    let stagedConsumption = false;
    let consumed = false;
    mockClientQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
        if (sql === 'BEGIN') {
            transactionOpen = true;
            stagedConsumption = false;
            return {rows: []};
        }
        if (sql === 'ROLLBACK') {
            transactionOpen = false;
            stagedConsumption = false;
            return {rows: []};
        }
        if (sql === 'COMMIT') {
            consumed = consumed || stagedConsumption;
            transactionOpen = false;
            stagedConsumption = false;
            return {rows: []};
        }
        if (sql.includes('SET exchanged_at = NOW()')) {
            if (!transactionOpen) throw new Error('Exchange update must run in a transaction');
            const presentedChallenge = params[1] ?? null;
            const matches = storedChallenge === null || presentedChallenge === storedChallenge;
            if (!consumed && !stagedConsumption && matches) {
                stagedConsumption = true;
                return {rows: [{user_id: USER_ROW.id}]};
            }
            return {rows: []};
        }
        if (sql.includes('FROM users')) {
            const user = options.user === undefined ? USER_ROW : options.user;
            return {rows: user ? [user] : []};
        }
        return {rows: []};
    });
    return {wasConsumed: () => consumed};
}

function clientSqlStatements() {
    return mockClientQuery.mock.calls.map(([sql]) => String(sql).trim().split(/\s+/)[0].toUpperCase());
}

async function exchange(body: Record<string, unknown>) {
    return mockRouteHandlers.post['/login/exchange']({body}, {});
}

describe('ERP outer mobile PKCE', () => {
    beforeEach(() => {
        mockDbQuery.mockReset();
        mockClientQuery.mockReset();
        mockClientRelease.mockReset();
        mockPoolConnect.mockReset().mockResolvedValue(mockDbClient);
        mockSendSuccess.mockReset();
        mockSendError.mockReset();
        mockCreateAuthSession.mockReset().mockResolvedValue({
            access_token: 'access',
            refresh_token: 'refresh',
        });
        mockTryAwardFirstLogin.mockReset().mockResolvedValue(null);
    });

    it('derives the RFC 7636 S256 challenge', () => {
        expect(deriveClientS256CodeChallenge(RFC_VERIFIER)).toBe(RFC_CHALLENGE);
    });

    it('applies dedicated campus-safe limits to public login start and exchange', () => {
        expect(mockCreateAuthRateLimiter).toHaveBeenNthCalledWith(1, 15 * 60_000, 20);
        expect(mockCreateAuthRateLimiter).toHaveBeenNthCalledWith(2, 15 * 60_000, 40);
        expect(mockRouter.post).toHaveBeenCalledWith(
            '/login/start',
            mockStartLimiter,
            expect.any(Function),
        );
        expect(mockRouter.post).toHaveBeenCalledWith(
            '/login/exchange',
            mockExchangeLimiter,
            expect.any(Function),
        );
    });

    it('stores a valid client challenge and method on login start', async () => {
        mockDbQuery.mockResolvedValueOnce({rows: []});
        await mockRouteHandlers.post['/login/start']({
            body: {
                return_uri: 'radiotedu://auth/erp/linked',
                code_challenge: RFC_CHALLENGE,
                code_challenge_method: 'S256',
            },
        }, {});

        expect(mockDbQuery).toHaveBeenCalledTimes(1);
        expect(mockDbQuery.mock.calls[0][0]).toContain('client_code_challenge');
        expect(mockDbQuery.mock.calls[0][1].slice(-2)).toEqual([RFC_CHALLENGE, 'S256']);
        expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('keeps legacy login start compatible with nullable client PKCE columns', async () => {
        mockDbQuery.mockResolvedValueOnce({rows: []});
        await mockRouteHandlers.post['/login/start']({
            body: {return_uri: 'radiotedu://auth/erp/linked'},
        }, {});

        expect(mockDbQuery.mock.calls[0][1].slice(-2)).toEqual([null, null]);
        expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('returns a controlled callback error when state storage is unavailable', async () => {
        mockDbQuery.mockRejectedValueOnce(new Error('database unavailable'));
        const status = vi.fn();
        const json = vi.fn();
        status.mockReturnValue({json});
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        await mockRouteHandlers.get['/callback']({
            query: {code: 'provider-code', state: 'oauth-state'},
        }, {status});

        expect(status).toHaveBeenCalledWith(500);
        expect(json).toHaveBeenCalledWith({error: 'erp_identity_unavailable'});
        expect(consoleError).toHaveBeenCalledWith('ERP identity callback state lookup failed');
        expect(consoleError).not.toHaveBeenCalledWith(expect.stringContaining('provider-code'));
        expect(consoleError).not.toHaveBeenCalledWith(expect.stringContaining('oauth-state'));
        consoleError.mockRestore();
    });

    it.each([
        {code_challenge: RFC_CHALLENGE, code_challenge_method: 'plain'},
        {code_challenge: 'not-base64url', code_challenge_method: 'S256'},
        {code_challenge: RFC_CHALLENGE},
        {code_challenge_method: 'S256'},
        {unexpected: 'field'},
    ])('strictly rejects invalid login start input %#', async (body) => {
        await mockRouteHandlers.post['/login/start']({body}, {});
        expect(mockDbQuery).not.toHaveBeenCalled();
        expect(mockSendError).toHaveBeenCalledWith({}, 'Invalid ERP login request', 400);
    });

    it('atomically consumes a code when the verifier is correct', async () => {
        const database = configureExchangeDatabase(RFC_CHALLENGE);
        await exchange({code: LOGIN_CODE, code_verifier: RFC_VERIFIER});

        const [sql, params] = mockClientQuery.mock.calls.find(
            ([statement]) => String(statement).includes('SET exchanged_at = NOW()'),
        )!;
        expect(sql).toContain('client_code_challenge IS NULL');
        expect(sql).toContain("client_code_challenge_method = 'S256'");
        expect(sql).toContain('client_code_challenge = $2');
        expect(params).toEqual([`hash:${LOGIN_CODE}`, RFC_CHALLENGE]);
        expect(database.wasConsumed()).toBe(true);
        expect(clientSqlStatements()).toEqual(['BEGIN', 'UPDATE', 'SELECT', 'INSERT', 'COMMIT']);
        expect(mockCreateAuthSession).toHaveBeenCalledWith(
            USER_ROW.id,
            USER_ROW.email,
            USER_ROW.role,
            mockDbClient,
        );
        const commitIndex = mockClientQuery.mock.calls.findIndex(([statement]) => statement === 'COMMIT');
        expect(mockClientQuery.mock.invocationCallOrder[commitIndex]).toBeLessThan(
            mockTryAwardFirstLogin.mock.invocationCallOrder[0],
        );
        expect(mockClientRelease).toHaveBeenCalledTimes(1);
        expect(mockSendSuccess).toHaveBeenCalledTimes(1);
    });

    it('rejects a wrong verifier without consuming the code', async () => {
        const database = configureExchangeDatabase(RFC_CHALLENGE);
        await exchange({code: LOGIN_CODE, code_verifier: 'w'.repeat(43)});

        expect(database.wasConsumed()).toBe(false);
        expect(clientSqlStatements()).toEqual(['BEGIN', 'UPDATE', 'ROLLBACK']);
        expect(mockClientRelease).toHaveBeenCalledTimes(1);
        expect(mockSendError).toHaveBeenCalledWith(
            {},
            'ERP login code is invalid or expired',
            401,
        );
    });

    it('rejects a missing verifier for a PKCE-bound code', async () => {
        const database = configureExchangeDatabase(RFC_CHALLENGE);
        await exchange({code: LOGIN_CODE});

        expect(database.wasConsumed()).toBe(false);
        const updateCall = mockClientQuery.mock.calls.find(
            ([statement]) => String(statement).includes('SET exchanged_at = NOW()'),
        )!;
        expect(updateCall[1][1]).toBeNull();
        expect(mockSendError).toHaveBeenCalledWith(
            {},
            'ERP login code is invalid or expired',
            401,
        );
    });

    it('rolls back code consumption when the app account is unavailable', async () => {
        const database = configureExchangeDatabase(RFC_CHALLENGE, {user: null});
        await exchange({code: LOGIN_CODE, code_verifier: RFC_VERIFIER});

        expect(database.wasConsumed()).toBe(false);
        expect(clientSqlStatements()).toEqual(['BEGIN', 'UPDATE', 'SELECT', 'ROLLBACK']);
        expect(mockCreateAuthSession).not.toHaveBeenCalled();
        expect(mockTryAwardFirstLogin).not.toHaveBeenCalled();
        expect(mockClientRelease).toHaveBeenCalledTimes(1);
        expect(mockSendError).toHaveBeenCalledWith({}, 'App account is not available', 403);
    });

    it('rolls back code, legal acceptance, and session creation on a transient session error', async () => {
        const database = configureExchangeDatabase(RFC_CHALLENGE);
        mockCreateAuthSession.mockRejectedValueOnce(new Error('refresh token insert unavailable'));

        await exchange({code: LOGIN_CODE, code_verifier: RFC_VERIFIER});

        expect(database.wasConsumed()).toBe(false);
        expect(clientSqlStatements()).toEqual(['BEGIN', 'UPDATE', 'SELECT', 'INSERT', 'ROLLBACK']);
        expect(mockTryAwardFirstLogin).not.toHaveBeenCalled();
        expect(mockClientRelease).toHaveBeenCalledTimes(1);
        expect(mockSendError).toHaveBeenCalledWith(
            {},
            'Failed to exchange ERP login code',
            500,
        );
    });

    it('returns a controlled error when a database connection cannot be acquired', async () => {
        mockPoolConnect.mockRejectedValueOnce(new Error('database unavailable'));

        await exchange({code: LOGIN_CODE, code_verifier: RFC_VERIFIER});

        expect(mockClientQuery).not.toHaveBeenCalled();
        expect(mockClientRelease).not.toHaveBeenCalled();
        expect(mockTryAwardFirstLogin).not.toHaveBeenCalled();
        expect(mockSendError).toHaveBeenCalledWith(
            {},
            'Failed to exchange ERP login code',
            500,
        );
    });

    it.each([
        {code: LOGIN_CODE, code_verifier: 'short'},
        {code: LOGIN_CODE, code_verifier: RFC_VERIFIER, unexpected: true},
        {code: 'not-an-opaque-login-code', code_verifier: RFC_VERIFIER},
    ])('strictly rejects invalid login exchange input %#', async (body) => {
        await exchange(body);

        expect(mockDbQuery).not.toHaveBeenCalled();
        expect(mockPoolConnect).not.toHaveBeenCalled();
        expect(mockSendError).toHaveBeenCalledWith(
            {},
            'Invalid ERP login exchange request',
            400,
        );
    });

    it('rejects replay after one successful atomic exchange', async () => {
        configureExchangeDatabase(RFC_CHALLENGE);
        await exchange({code: LOGIN_CODE, code_verifier: RFC_VERIFIER});
        await exchange({code: LOGIN_CODE, code_verifier: RFC_VERIFIER});

        expect(mockSendSuccess).toHaveBeenCalledTimes(1);
        expect(mockSendError).toHaveBeenCalledWith(
            {},
            'ERP login code is invalid or expired',
            401,
        );
    });

    it('keeps legacy rows without a challenge exchangeable', async () => {
        configureExchangeDatabase(null);
        await exchange({code: LOGIN_CODE});

        expect(mockSendSuccess).toHaveBeenCalledTimes(1);
    });

    it('ships an idempotent additive migration without executing it', () => {
        const migration = fs.readFileSync(path.resolve(
            process.cwd(),
            'src/db/migrations/20260830_outer_mobile_pkce.sql',
        ), 'utf8');
        expect(migration).toContain('ADD COLUMN IF NOT EXISTS client_code_challenge');
        expect(migration).toContain('ADD COLUMN IF NOT EXISTS client_code_challenge_method');
        expect(migration).toContain("conname = 'external_identity_link_requests_client_pkce_check'");
        expect(migration).toContain("conrelid = 'external_identity_link_requests'::regclass");

        const schema = fs.readFileSync(path.resolve(process.cwd(), 'src/db/schema.sql'), 'utf8');
        expect(schema).toContain("conrelid = 'external_identity_link_requests'::regclass");
    });
});
