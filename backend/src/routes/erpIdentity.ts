import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { ROLES } from '../middleware/rbac';
import { db } from '../db';
import {
    createAuthRateLimiter,
    createAuthSession,
    REGISTRATION_PRIVACY_VERSION,
    REGISTRATION_TERMS_VERSION,
} from './auth';
import { sendError, sendSuccess } from '../utils/response';
import { normalizeClientIp } from '../utils/networkAddress';
import { tryAwardFirstLogin } from '../services/economy';
import {
    buildErpAuthorizeUrl,
    buildErpResultUri,
    createOpaqueToken,
    createPkcePair,
    encryptErpToken,
    exchangeErpAuthorizationCode,
    fetchErpIdentityProfile,
    hashOpaqueToken,
    isErpIdentityEnabled,
    resolveErpReturnUri,
    type ErpIdentityProfile,
    type ErpTokenResponse,
} from '../services/erpIdentity';

const router = Router();
const erpLoginStartLimiter = createAuthRateLimiter(15 * 60_000, 20);
const erpLoginExchangeLimiter = createAuthRateLimiter(15 * 60_000, 40);

const OPAQUE_LOGIN_CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const S256_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const PKCE_VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/;

const loginStartRequestSchema = z.object({
    return_uri: z.string().min(1).max(2048).optional(),
    code_challenge: z.string().regex(S256_CHALLENGE_PATTERN).optional(),
    code_challenge_method: z.literal('S256').optional(),
}).strict().superRefine((value, context) => {
    if (Boolean(value.code_challenge) !== Boolean(value.code_challenge_method)) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'PKCE challenge and method must be provided together',
        });
    }
});

const loginExchangeRequestSchema = z.object({
    code: z.string().trim().regex(OPAQUE_LOGIN_CODE_PATTERN),
    code_verifier: z.string().regex(PKCE_VERIFIER_PATTERN).optional(),
}).strict();

export function deriveClientS256CodeChallenge(codeVerifier: string): string {
    if (!PKCE_VERIFIER_PATTERN.test(codeVerifier)) {
        throw new Error('Invalid PKCE verifier');
    }
    return crypto.createHash('sha256').update(codeVerifier, 'utf8').digest('base64url');
}

type LinkRequest = {
    user_id: string | null;
    purpose: 'link' | 'login';
    code_verifier: string;
    return_uri: string;
};

function disabled(res: Response): boolean {
    if (isErpIdentityEnabled()) return false;
    res.status(404).json({ error: 'ERP identity login is not enabled' });
    return true;
}

function profileEmail(profile: ErpIdentityProfile): string {
    return profile.email.trim().toLowerCase();
}

function profileDisplayName(profile: ErpIdentityProfile): string {
    const normalized = String(profile.name ?? '')
        .normalize('NFC')
        .replace(/[\u0000-\u001F\u007F]/g, '')
        .trim()
        .slice(0, 100);
    return normalized || profileEmail(profile).split('@')[0] || 'RadioTEDU Member';
}

function mapErpSessionUser(row: Record<string, unknown>) {
    return {
        id: row.id,
        email: row.email,
        display_name: row.display_name,
        avatar_url: row.avatar_url ?? null,
        rank_score: Number(row.rank_score ?? 0),
        monthly_rank_score: Number(row.monthly_rank_score ?? 0),
        is_guest: Boolean(row.is_guest),
        role: row.role ?? ROLES.USER,
        total_songs_added: Number(row.total_songs_added ?? 0),
        total_upvotes_received: Number(row.total_upvotes_received ?? 0),
        last_super_vote_at: row.last_super_vote_at ?? null,
    };
}

async function storeErpIdentity(
    client: PoolClient,
    userId: string,
    profile: ErpIdentityProfile,
    tokens: ErpTokenResponse,
): Promise<void> {
    await client.query(
        `INSERT INTO external_identities
            (user_id, provider, provider_subject, provider_email, display_name,
             roles, permissions, authorization_version, access_token_ciphertext,
             refresh_token_ciphertext, token_expires_at, last_verified_at, updated_at)
         VALUES ($1, 'erp', $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9,
                 NOW() + ($10 * INTERVAL '1 second'), NOW(), NOW())
         ON CONFLICT (user_id, provider) DO UPDATE SET
            provider_subject = EXCLUDED.provider_subject,
            provider_email = EXCLUDED.provider_email,
            display_name = EXCLUDED.display_name,
            roles = EXCLUDED.roles,
            permissions = EXCLUDED.permissions,
            authorization_version = EXCLUDED.authorization_version,
            access_token_ciphertext = EXCLUDED.access_token_ciphertext,
            refresh_token_ciphertext = EXCLUDED.refresh_token_ciphertext,
            token_expires_at = EXCLUDED.token_expires_at,
            last_verified_at = NOW(),
            updated_at = NOW()`,
        [
            userId,
            profile.sub,
            profileEmail(profile),
            profileDisplayName(profile),
            JSON.stringify(profile.roles || []),
            JSON.stringify(profile.permissions || []),
            profile.authorization_version,
            encryptErpToken(tokens.access_token),
            tokens.refresh_token ? encryptErpToken(tokens.refresh_token) : null,
            tokens.expires_in,
        ],
    );
}

async function provisionOrFindAppUser(
    profile: ErpIdentityProfile,
    tokens: ErpTokenResponse,
    request: Request,
): Promise<string> {
    const client = await db.pool.connect();
    const clientIp = normalizeClientIp(request.ip);
    let transactionOpen = false;

    try {
        await client.query('BEGIN');
        transactionOpen = true;

        const existingIdentity = await client.query(
            `SELECT user_id
             FROM external_identities
             WHERE provider = 'erp' AND provider_subject = $1
             FOR UPDATE`,
            [profile.sub],
        );
        let userId = existingIdentity.rows[0]?.user_id as string | undefined;

        if (!userId) {
            const email = profileEmail(profile);
            const existingUser = await client.query(
                `SELECT id
                 FROM users
                 WHERE LOWER(email) = $1
                 FOR UPDATE`,
                [email],
            );
            userId = existingUser.rows[0]?.id;

            if (!userId) {
                const created = await client.query(
                    `INSERT INTO users
                        (email, password_hash, display_name, is_guest, role, last_ip, user_agent)
                     VALUES ($1, NULL, $2, FALSE, $3, $4, $5)
                     RETURNING id`,
                    [
                        email,
                        profileDisplayName(profile),
                        ROLES.USER,
                        clientIp,
                        request.headers['user-agent'],
                    ],
                );
                userId = created.rows[0].id;
            } else {
                const linkedIdentity = await client.query(
                    `SELECT provider_subject
                     FROM external_identities
                     WHERE user_id = $1 AND provider = 'erp'
                     FOR UPDATE`,
                    [userId],
                );
                if (
                    linkedIdentity.rows[0]
                    && linkedIdentity.rows[0].provider_subject !== profile.sub
                ) {
                    throw new Error('Existing app account is linked to another ERP account');
                }
            }
        }

        if (!userId) {
            throw new Error('ERP app account could not be resolved');
        }
        const resolvedUserId = userId;

        await storeErpIdentity(client, resolvedUserId, profile, tokens);
        await client.query(
            `UPDATE users
             SET is_guest = FALSE,
                 role = CASE WHEN role = $2 THEN $3 ELSE role END,
                 updated_at = NOW()
             WHERE id = $1`,
            [resolvedUserId, ROLES.GUEST, ROLES.USER],
        );
        await client.query(
            `INSERT INTO audit_logs (user_id, action, entity_type, metadata, ip_address)
             VALUES ($1, 'erp_identity_login', 'external_identity', $2::jsonb, $3)`,
            [
                resolvedUserId,
                JSON.stringify({ provider_subject: profile.sub }),
                clientIp,
            ],
        );

        await client.query('COMMIT');
        transactionOpen = false;
        return resolvedUserId;
    } catch (error) {
        if (transactionOpen) await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function linkCurrentUser(
    userId: string,
    profile: ErpIdentityProfile,
    tokens: ErpTokenResponse,
): Promise<void> {
    const client = await db.pool.connect();
    let transactionOpen = false;

    try {
        await client.query('BEGIN');
        transactionOpen = true;

        const conflict = await client.query(
            `SELECT user_id
             FROM external_identities
             WHERE provider = 'erp' AND provider_subject = $1 AND user_id <> $2
             FOR UPDATE`,
            [profile.sub, userId],
        );
        if (conflict.rows[0]) {
            throw new Error('ERP account is already linked to another app account');
        }

        await storeErpIdentity(client, userId, profile, tokens);
        await client.query(
            `INSERT INTO audit_logs (user_id, action, entity_type, metadata)
             VALUES ($1, 'erp_identity_linked', 'external_identity', $2::jsonb)`,
            [userId, JSON.stringify({ provider_subject: profile.sub })],
        );

        await client.query('COMMIT');
        transactionOpen = false;
    } catch (error) {
        if (transactionOpen) await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function createAuthorizationRequest(
    purpose: 'link' | 'login',
    userId: string | null,
    returnUri: string,
    clientPkce: { challenge: string; method: 'S256' } | null = null,
) {
    const state = createOpaqueToken();
    const { verifier, challenge } = createPkcePair();
    await db.query(
        `INSERT INTO external_identity_link_requests
            (user_id, provider, purpose, state_hash, code_verifier, return_uri,
             client_code_challenge, client_code_challenge_method, expires_at)
         VALUES ($1, 'erp', $2, $3, $4, $5, $6, $7, NOW() + INTERVAL '10 minutes')`,
        [
            userId,
            purpose,
            hashOpaqueToken(state),
            verifier,
            returnUri,
            clientPkce?.challenge ?? null,
            clientPkce?.method ?? null,
        ],
    );

    return {
        authorization_url: buildErpAuthorizeUrl(state, challenge),
        expires_in: 600,
    };
}

router.post('/login/start', erpLoginStartLimiter, async (req: Request, res: Response) => {
    if (disabled(res)) return;

    try {
        const parsed = loginStartRequestSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
            return sendError(res, 'Invalid ERP login request', 400);
        }
        const returnUri = resolveErpReturnUri(
            parsed.data.return_uri,
        );
        const result = await createAuthorizationRequest(
            'login',
            null,
            returnUri,
            parsed.data.code_challenge ? {
                challenge: parsed.data.code_challenge,
                method: parsed.data.code_challenge_method!,
            } : null,
        );
        return sendSuccess(res, result, 'ERP login started', null, 201);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'ERP login could not be started';
        return sendError(res, message, 400);
    }
});

router.post('/start', authMiddleware, async (req: AuthRequest, res: Response) => {
    if (disabled(res)) return;

    try {
        const returnUri = resolveErpReturnUri(
            typeof req.body?.return_uri === 'string' ? req.body.return_uri : undefined,
        );
        const result = await createAuthorizationRequest(
            'link',
            req.user!.id,
            returnUri,
        );
        return sendSuccess(res, result, 'ERP account link started', null, 201);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'ERP link could not be started';
        return sendError(res, message, 400);
    }
});

router.get('/callback', async (req: Request, res: Response) => {
    if (disabled(res)) return;

    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    if (!code || !state) {
        return res.status(400).json({ error: 'missing_oauth_response' });
    }

    let requestResult: Awaited<ReturnType<typeof db.query>>;
    try {
        requestResult = await db.query(
            `UPDATE external_identity_link_requests
             SET used_at = NOW()
             WHERE state_hash = $1 AND provider = 'erp'
               AND used_at IS NULL AND expires_at > NOW()
             RETURNING user_id, purpose, code_verifier, return_uri`,
            [hashOpaqueToken(state)],
        );
    } catch {
        console.error('ERP identity callback state lookup failed');
        return res.status(500).json({ error: 'erp_identity_unavailable' });
    }
    const linkRequest = requestResult.rows[0] as LinkRequest | undefined;
    if (!linkRequest) {
        return res.status(400).json({ error: 'invalid_or_expired_state' });
    }

    try {
        const tokens = await exchangeErpAuthorizationCode(code, linkRequest.code_verifier);
        const profile = await fetchErpIdentityProfile(tokens.access_token);

        if (linkRequest.purpose === 'link') {
            if (!linkRequest.user_id) throw new Error('Missing app account for ERP link');
            await linkCurrentUser(linkRequest.user_id, profile, tokens);
            return res.redirect(buildErpResultUri(linkRequest.return_uri, 'success'));
        }

        const userId = await provisionOrFindAppUser(profile, tokens, req);
        const loginCode = createOpaqueToken();
        await db.query(
            `UPDATE external_identity_link_requests
             SET user_id = $2,
                 login_code_hash = $3,
                 login_code_expires_at = NOW() + INTERVAL '2 minutes'
             WHERE state_hash = $1 AND purpose = 'login'`,
            [hashOpaqueToken(state), userId, hashOpaqueToken(loginCode)],
        );
        return res.redirect(buildErpResultUri(
            linkRequest.return_uri,
            'success',
            { erp_code: loginCode },
        ));
    } catch {
        console.error('ERP identity callback failed');
        return res.redirect(buildErpResultUri(
            linkRequest.return_uri,
            'error',
            { message: 'erp_login_failed' },
        ));
    }
});

router.post('/login/exchange', erpLoginExchangeLimiter, async (req: Request, res: Response) => {
    if (disabled(res)) return;

    const parsed = loginExchangeRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendError(res, 'Invalid ERP login exchange request', 400);
    const { code, code_verifier: codeVerifier } = parsed.data;
    const clientCodeChallenge = codeVerifier
        ? deriveClientS256CodeChallenge(codeVerifier)
        : null;

    let client: PoolClient | null = null;
    let transactionOpen = false;
    let user: Record<string, any>;
    let tokens: Awaited<ReturnType<typeof createAuthSession>>;

    try {
        client = await db.pool.connect();
        await client.query('BEGIN');
        transactionOpen = true;

        const requestResult = await client.query(
            `UPDATE external_identity_link_requests
             SET exchanged_at = NOW()
             WHERE login_code_hash = $1
               AND purpose = 'login'
               AND exchanged_at IS NULL
               AND login_code_expires_at > NOW()
               AND (
                 client_code_challenge IS NULL
                 OR (
                   client_code_challenge_method = 'S256'
                   AND $2::text IS NOT NULL
                   AND client_code_challenge = $2
                 )
               )
             RETURNING user_id`,
            [hashOpaqueToken(code), clientCodeChallenge],
        );
        const userId = requestResult.rows[0]?.user_id;
        if (!userId) {
            await client.query('ROLLBACK');
            transactionOpen = false;
            return sendError(res, 'ERP login code is invalid or expired', 401);
        }

        const userResult = await client.query(
            `SELECT *
             FROM users
             WHERE id = $1 AND COALESCE(is_banned, FALSE) = FALSE`,
            [userId],
        );
        user = userResult.rows[0];
        if (!user) {
            await client.query('ROLLBACK');
            transactionOpen = false;
            return sendError(res, 'App account is not available', 403);
        }

        await client.query(
            `INSERT INTO legal_acceptance_events (
                user_id, event_type, terms_version, privacy_version, age_18_confirmed, channel
             ) VALUES ($1, 'erp-first-login', $2, $3, NULL, 'erp')
             ON CONFLICT (user_id, event_type) DO NOTHING`,
            [user.id, REGISTRATION_TERMS_VERSION, REGISTRATION_PRIVACY_VERSION],
        );
        tokens = await createAuthSession(user.id, user.email, user.role, client);

        await client.query('COMMIT');
        transactionOpen = false;
    } catch (error) {
        if (transactionOpen && client) {
            try {
                await client.query('ROLLBACK');
            } catch {
                // Preserve the original exchange failure.
            }
        }
        console.error('ERP login exchange failed:', error);
        return sendError(res, 'Failed to exchange ERP login code', 500);
    } finally {
        client?.release();
    }

    const firstLoginReward = await tryAwardFirstLogin(user.id, 'erp');
    return sendSuccess(
        res,
        { user: mapErpSessionUser(user), first_login_reward: firstLoginReward, ...tokens },
        'ERP login successful',
    );
});

router.get('/status', authMiddleware, async (req: AuthRequest, res: Response) => {
    if (disabled(res)) return;

    const result = await db.query(
        `SELECT provider_subject, provider_email, display_name, roles, permissions,
                authorization_version, last_verified_at, created_at
         FROM external_identities
         WHERE user_id = $1 AND provider = 'erp'`,
        [req.user!.id],
    );
    const identity = result.rows[0];
    return sendSuccess(res, identity ? {
        linked: true,
        subject: identity.provider_subject,
        email: identity.provider_email,
        display_name: identity.display_name,
        roles: identity.roles,
        permissions: identity.permissions,
        authorization_version: identity.authorization_version,
        last_verified_at: identity.last_verified_at,
        linked_at: identity.created_at,
    } : { linked: false });
});

router.delete('/', authMiddleware, async (req: AuthRequest, res: Response) => {
    if (disabled(res)) return;

    await db.query(
        `DELETE FROM external_identities WHERE user_id = $1 AND provider = 'erp'`,
        [req.user!.id],
    );
    await db.query(
        `INSERT INTO audit_logs (user_id, action, entity_type)
         VALUES ($1, 'erp_identity_unlinked', 'external_identity')`,
        [req.user!.id],
    );
    return res.status(204).send();
});

export default router;
