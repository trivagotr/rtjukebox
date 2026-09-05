import jwt from 'jsonwebtoken';
import { describe, expect, it, vi } from 'vitest';
import {
    authenticateAccessToken,
    authMiddleware,
    JWT_SECRET,
    optionalAuth,
    verifyAccessToken,
} from './auth';

function responseStub() {
    const response = {
        status: vi.fn(),
        json: vi.fn(),
    };
    response.status.mockReturnValue(response);
    response.json.mockReturnValue(response);
    return response;
}

function accountToken(
    algorithm: 'HS256' | 'HS384' = 'HS256',
    sid?: string,
) {
    return jwt.sign(
        {
            id: 'user-1',
            email: 'student@tedu.edu.tr',
            role: 'user',
            ...(sid ? { sid } : {}),
        },
        JWT_SECRET,
        { algorithm, expiresIn: '1h' },
    );
}

describe('account JWT verification', () => {
    it('continues accepting existing well-shaped HS256 account tokens', async () => {
        const request = {
            headers: { authorization: `Bearer ${accountToken()}` },
        } as any;
        const response = responseStub();
        const next = vi.fn();

        await authMiddleware(request, response as any, next);

        expect(next).toHaveBeenCalledOnce();
        expect(request.user).toEqual(expect.objectContaining({
            id: 'user-1',
            email: 'student@tedu.edu.tr',
            role: 'user',
        }));
        expect(request.user.exp).toEqual(expect.any(Number));
    });

    it('rejects a token signed with another HMAC algorithm', () => {
        expect(() => verifyAccessToken(accountToken('HS384'))).toThrow();
    });

    it('rejects a kiosk-purpose token at the account boundary', () => {
        const token = jwt.sign(
            { device_id: 'device-1', purpose: 'kiosk' },
            JWT_SECRET,
            {
                algorithm: 'HS256',
                audience: 'radiotedu:kiosk',
                issuer: 'radiotedu-backend',
                expiresIn: '1h',
            },
        );

        expect(() => verifyAccessToken(token)).toThrow('Invalid access token payload');
    });

    it.each([
        { id: 'user-1', email: 'student@tedu.edu.tr' },
        { id: 'user-1', role: 'user' },
        { email: 'student@tedu.edu.tr', role: 'user' },
    ])('rejects incomplete account claims', (claims) => {
        const token = jwt.sign(claims, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
        expect(() => verifyAccessToken(token)).toThrow('Invalid access token payload');
    });

    it('keeps optional authentication anonymous for invalid tokens', async () => {
        const request = {
            headers: { authorization: `Bearer ${accountToken('HS384')}` },
        } as any;
        const response = responseStub();
        const next = vi.fn();

        await optionalAuth(request, response as any, next);

        expect(next).toHaveBeenCalledOnce();
        expect(request.user).toBeUndefined();
    });

    it('keeps sid-less legacy access tokens stateless until their JWT expiry', async () => {
        const query = vi.fn();

        const claims = await authenticateAccessToken(accountToken(), { query } as any);

        expect(claims.id).toBe('user-1');
        expect(claims.sid).toBeUndefined();
        expect(query).not.toHaveBeenCalled();
    });

    it('accepts a sid-bearing token only while its refresh family is active', async () => {
        const sid = '11111111-1111-4111-8111-111111111111';
        const query = vi.fn().mockResolvedValue({ rows: [{}] });

        const claims = await authenticateAccessToken(accountToken('HS256', sid), { query } as any);

        expect(claims.sid).toBe(sid);
        expect(query).toHaveBeenCalledWith(
            expect.stringContaining('session_family_id = $2::uuid'),
            ['user-1', sid, 'user'],
        );
        const sessionSql = String(query.mock.calls[0][0]);
        expect(sessionSql).toContain('INNER JOIN users');
        expect(sessionSql).toContain('COALESCE(u.is_banned, FALSE) = FALSE');
        expect(sessionSql).toContain('u.role = $3');
    });

    it('rejects a sid-bearing token when its database role no longer matches', async () => {
        const sid = '33333333-3333-4333-8333-333333333333';
        const query = vi.fn().mockResolvedValue({ rows: [] });

        await expect(
            authenticateAccessToken(accountToken('HS256', sid), { query } as any),
        ).rejects.toThrow('Access token session has been revoked');
        expect(query).toHaveBeenCalledWith(
            expect.stringContaining('u.role = $3'),
            ['user-1', sid, 'user'],
        );
    });

    it('rejects a sid-bearing token after its refresh family is revoked', async () => {
        const sid = '22222222-2222-4222-8222-222222222222';
        const query = vi.fn().mockResolvedValue({ rows: [] });

        await expect(
            authenticateAccessToken(accountToken('HS256', sid), { query } as any),
        ).rejects.toThrow('Access token session has been revoked');
    });

    it('rejects a malformed sid claim before querying session state', async () => {
        const query = vi.fn();

        await expect(
            authenticateAccessToken(accountToken('HS256', 'not-a-uuid'), { query } as any),
        ).rejects.toThrow('Invalid access token payload');
        expect(query).not.toHaveBeenCalled();
    });
});
