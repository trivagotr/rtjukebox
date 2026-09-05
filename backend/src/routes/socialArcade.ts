import crypto from 'crypto';
import { Response } from 'express';

import { db } from '../db';
import { AuthRequest } from '../middleware/auth';
import { awardUserPoints, getGameAwardedPoints } from '../services/gamification';
import { getIstanbulDayKey } from '../services/jukeboxScoring';
import {
    advancePoolDiveState,
    choosePoolDivePrompt,
    createPoolDiveState,
    deriveArcadeNonce,
    hashArcadeNonce,
    isPoolDiveChoice,
    nonceHashesMatch,
    normalizePoolDiveState,
    POOL_DIVE_MAX_RESPONSE_MS,
    POOL_DIVE_SESSION_TTL_MS,
    POOL_DIVE_TOTAL_ROUNDS,
} from '../services/socialArcade';
import { sendError, sendSuccess } from '../utils/response';
import { normalizeClientIp } from '../utils/networkAddress';

const POOL_DIVE_SLUG = 'pool-dive';
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NONCE = /^[A-Za-z0-9_-]{32,180}$/;

function toNumber(value: unknown, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function ensureRegisteredAccount(req: AuthRequest, res: Response) {
    if (!req.user?.id || req.user.role === 'guest') {
        sendError(res, 'A registered RadioTEDU account is required.', 403, 'REGISTERED_ACCOUNT_REQUIRED');
        return false;
    }
    return true;
}

function requestUserAgent(req: AuthRequest) {
    const value = typeof req.get === 'function' ? req.get('user-agent') : '';
    return typeof value === 'string' ? value.slice(0, 500) : '';
}

function nonceSecret() {
    return process.env.SOCIAL_ARCADE_NONCE_SECRET ?? '';
}

function responseForReplay(
    response: Record<string, unknown>,
    sessionId: string,
    clientRoundId: string,
    completedRounds: number,
    active: boolean,
) {
    if (!active) return response;
    const priorSession = response.session && typeof response.session === 'object' && !Array.isArray(response.session)
        ? response.session as Record<string, unknown>
        : {};
    return {
        ...response,
        session: {
            ...priorSession,
            nonce: deriveArcadeNonce(nonceSecret(), sessionId, clientRoundId, completedRounds),
        },
    };
}

function sessionPayload(input: {
    id: string;
    round: number;
    score: number;
    prompt: string;
    nonce?: string;
    expiresAt?: string;
    final?: boolean;
}) {
    return {
        id: input.id,
        status: input.final ? 'completed' : 'active',
        round: input.round,
        totalRounds: POOL_DIVE_TOTAL_ROUNDS,
        score: input.score,
        prompt: input.final ? null : input.prompt,
        nonce: input.final ? null : input.nonce,
        promptExpiresAt: input.final
            ? null
            : new Date(Date.now() + POOL_DIVE_MAX_RESPONSE_MS).toISOString(),
        expiresAt: input.expiresAt ?? null,
        final: input.final === true,
    };
}

export async function handlePoolDiveStart(req: AuthRequest, res: Response) {
    if (!ensureRegisteredAccount(req, res)) return undefined;
    const client = await db.pool.connect();
    let transactionOpen = false;
    try {
        await client.query('BEGIN');
        transactionOpen = true;
        await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [req.user!.id]);
        await client.query(
            `UPDATE arcade_game_sessions
             SET status = 'expired', finished_at = COALESCE(finished_at, NOW())
             WHERE user_id = $1 AND status = 'active'`,
            [req.user!.id],
        );
        const gameResult = await client.query(
            `SELECT id, slug, title, point_rate, daily_point_limit
             FROM arcade_games
             WHERE slug = $1 AND is_active = true
             FOR UPDATE`,
            [POOL_DIVE_SLUG],
        );
        const game = gameResult.rows[0];
        if (!game) {
            await client.query('ROLLBACK');
            transactionOpen = false;
            return sendError(res, 'Pool Dive is temporarily unavailable.', 503, 'SOCIAL_ARCADE_UNAVAILABLE');
        }

        const now = new Date();
        const expiresAt = new Date(now.getTime() + POOL_DIVE_SESSION_TTL_MS);
        const prompt = choosePoolDivePrompt();
        const state = createPoolDiveState(now, prompt);
        const sessionId = crypto.randomUUID();
        const clientRoundId = `social-pool-dive:${crypto.randomUUID()}`;
        const nonce = deriveArcadeNonce(nonceSecret(), sessionId, clientRoundId, 0);
        const inserted = await client.query(
            `INSERT INTO arcade_game_sessions
                (id, user_id, game_id, client_round_id, status, current_nonce_hash, started_at,
                 last_ip, user_agent, game_state, expires_at, server_score)
             VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, $8, $9::jsonb, $10, 0)
             RETURNING id, started_at, expires_at`,
            [
                sessionId,
                req.user!.id,
                game.id,
                clientRoundId,
                hashArcadeNonce(nonce),
                now,
                normalizeClientIp(req.ip),
                requestUserAgent(req),
                JSON.stringify(state),
                expiresAt,
            ],
        );
        const session = inserted.rows[0];
        const data = {
            game: { id: game.id, slug: game.slug, title: game.title, totalRounds: POOL_DIVE_TOTAL_ROUNDS },
            session: sessionPayload({
                id: session.id,
                round: 1,
                score: 0,
                prompt,
                nonce,
                expiresAt: new Date(session.expires_at).toISOString(),
            }),
        };
        await client.query('COMMIT');
        transactionOpen = false;
        return sendSuccess(res, data, 'Pool Dive started', undefined, 201);
    } catch (error) {
        if (transactionOpen) await client.query('ROLLBACK');
        console.error('Social Pool Dive start error:', error);
        return sendError(res, 'Pool Dive could not start.', 500, 'SOCIAL_ARCADE_START_FAILED');
    } finally {
        client.release();
    }
}

export async function handlePoolDiveAction(req: AuthRequest, res: Response) {
    if (!ensureRegisteredAccount(req, res)) return undefined;
    const sessionId = typeof req.params.sessionId === 'string' ? req.params.sessionId : '';
    const nonce = typeof req.body?.nonce === 'string' ? req.body.nonce : '';
    const choice = req.body?.choice;
    if (!SESSION_ID.test(sessionId) || !NONCE.test(nonce) || !isPoolDiveChoice(choice)) {
        return sendError(res, 'Invalid Pool Dive action.', 400, 'SOCIAL_ARCADE_INVALID_ACTION');
    }

    const client = await db.pool.connect();
    let transactionOpen = false;
    try {
        await client.query('BEGIN');
        transactionOpen = true;
        const sessionResult = await client.query(
            `SELECT s.id, s.status, s.current_nonce_hash, s.started_at, s.expires_at,
                    s.client_round_id, s.game_state, s.server_score,
                    g.id AS game_id, g.point_rate, g.daily_point_limit
             FROM arcade_game_sessions s
             JOIN arcade_games g ON g.id = s.game_id
             WHERE s.id = $1 AND s.user_id = $2 AND g.slug = $3
             FOR UPDATE OF s`,
            [sessionId, req.user!.id, POOL_DIVE_SLUG],
        );
        const session = sessionResult.rows[0];
        if (!session) {
            await client.query('ROLLBACK');
            transactionOpen = false;
            return sendError(res, 'Pool Dive session not found.', 404, 'SOCIAL_ARCADE_SESSION_NOT_FOUND');
        }
        const state = normalizePoolDiveState(session.game_state);
        if (!state) {
            await client.query(
                `UPDATE arcade_game_sessions SET status = 'expired', finished_at = NOW() WHERE id = $1`,
                [sessionId],
            );
            await client.query('COMMIT');
            transactionOpen = false;
            return sendError(res, 'Pool Dive session state is invalid.', 409, 'SOCIAL_ARCADE_STATE_INVALID');
        }

        const suppliedNonceHash = hashArcadeNonce(nonce);
        if (
            state.lastNonceHash
            && state.lastResponse
            && nonceHashesMatch(state.lastNonceHash, suppliedNonceHash)
        ) {
            await client.query('COMMIT');
            transactionOpen = false;
            return sendSuccess(
                res,
                responseForReplay(
                    state.lastResponse,
                    sessionId,
                    String(session.client_round_id),
                    state.completedRounds,
                    session.status === 'active',
                ),
                'Pool Dive action replayed',
            );
        }
        if (session.status !== 'active') {
            await client.query('ROLLBACK');
            transactionOpen = false;
            return sendError(res, 'Pool Dive session is no longer active.', 409, 'SOCIAL_ARCADE_SESSION_CLOSED');
        }
        if (Date.now() > new Date(session.expires_at).getTime()) {
            await client.query(
                `UPDATE arcade_game_sessions SET status = 'expired', finished_at = NOW() WHERE id = $1`,
                [sessionId],
            );
            await client.query('COMMIT');
            transactionOpen = false;
            return sendError(res, 'Pool Dive session expired.', 410, 'SOCIAL_ARCADE_SESSION_EXPIRED');
        }
        if (!nonceHashesMatch(String(session.current_nonce_hash), suppliedNonceHash)) {
            await client.query('ROLLBACK');
            transactionOpen = false;
            return sendError(res, 'Pool Dive action could not be verified.', 409, 'SOCIAL_ARCADE_NONCE_INVALID');
        }

        const now = new Date();
        const advanced = advancePoolDiveState(state, choice, now);
        if (!advanced.final) {
            const nextNonce = deriveArcadeNonce(
                nonceSecret(),
                sessionId,
                String(session.client_round_id),
                advanced.state.completedRounds,
            );
            const data = {
                result: advanced.result,
                session: sessionPayload({
                    id: sessionId,
                    round: advanced.state.completedRounds + 1,
                    score: advanced.state.score,
                    prompt: advanced.state.prompt,
                    nonce: nextNonce,
                    expiresAt: new Date(session.expires_at).toISOString(),
                }),
            };
            const nextState = {
                ...advanced.state,
                lastNonceHash: suppliedNonceHash,
                lastResponse: {
                    ...data,
                    session: { ...data.session, nonce: null },
                },
            };
            await client.query(
                `UPDATE arcade_game_sessions
                 SET current_nonce_hash = $2, game_state = $3::jsonb, server_score = $4,
                     last_ip = $5, user_agent = $6
                 WHERE id = $1`,
                [
                    sessionId,
                    hashArcadeNonce(nextNonce),
                    JSON.stringify(nextState),
                    advanced.state.score,
                    normalizeClientIp(req.ip),
                    requestUserAgent(req),
                ],
            );
            await client.query('COMMIT');
            transactionOpen = false;
            return sendSuccess(res, data, 'Pool Dive round completed');
        }

        await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [req.user!.id]);
        const dailyResult = await client.query(
            `SELECT COALESCE(SUM(points_awarded), 0) AS awarded_today
             FROM game_score_submissions
             WHERE user_id = $1 AND game_id = $2
               AND (submitted_at AT TIME ZONE 'Europe/Istanbul')::date = $3::date`,
            [req.user!.id, session.game_id, getIstanbulDayKey()],
        );
        const dailyLimit = Math.max(0, Math.floor(toNumber(session.daily_point_limit)));
        const awardedToday = Math.max(0, Math.floor(toNumber(dailyResult.rows[0]?.awarded_today)));
        const calculatedAward = getGameAwardedPoints({
            score: advanced.state.score,
            pointRate: toNumber(session.point_rate),
            dailyLimit,
        });
        const pointsAwarded = Math.min(calculatedAward, Math.max(0, dailyLimit - awardedToday));
        let spendablePoints: number;
        if (pointsAwarded > 0) {
            spendablePoints = (await awardUserPoints({
                userId: req.user!.id,
                amount: pointsAwarded,
                category: 'games',
                sourceType: 'social_arcade_pool_dive',
                sourceId: String(session.game_id),
                idempotencyKey: `social-arcade:${sessionId}`,
                metadata: {
                    session_id: sessionId,
                    score: advanced.state.score,
                    verification_status: 'server-authoritative',
                },
            }, client)).spendablePoints;
        } else {
            const points = await client.query('SELECT spendable_points FROM user_points WHERE user_id = $1', [req.user!.id]);
            spendablePoints = Math.max(0, Math.floor(toNumber(points.rows[0]?.spendable_points)));
        }

        const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - new Date(session.started_at).getTime()) / 1_000));
        await client.query(
            `INSERT INTO game_score_submissions
                (game_id, user_id, score, points_awarded, client_round_id, session_id,
                 reported_score, server_elapsed_seconds, verification_status)
             VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, 'server-authoritative')
             ON CONFLICT (user_id, client_round_id) WHERE client_round_id IS NOT NULL DO NOTHING`,
            [
                session.game_id,
                req.user!.id,
                advanced.state.score,
                pointsAwarded,
                session.client_round_id,
                sessionId,
                elapsedSeconds,
            ],
        );
        const data = {
            result: advanced.result,
            session: sessionPayload({
                id: sessionId,
                round: POOL_DIVE_TOTAL_ROUNDS,
                score: advanced.state.score,
                prompt: advanced.state.prompt,
                final: true,
            }),
            pointsAwarded,
            spendablePoints,
            verification: 'server-authoritative',
        };
        const finalState = {
            ...advanced.state,
            lastNonceHash: suppliedNonceHash,
            lastResponse: data,
        };
        await client.query(
            `UPDATE arcade_game_sessions
             SET status = 'completed', finished_at = $2, current_nonce_hash = $3,
                 game_state = $4::jsonb, server_score = $5, last_ip = $6, user_agent = $7
             WHERE id = $1`,
            [
                sessionId,
                now,
                hashArcadeNonce(crypto.randomBytes(32).toString('base64url')),
                JSON.stringify(finalState),
                advanced.state.score,
                normalizeClientIp(req.ip),
                requestUserAgent(req),
            ],
        );
        await client.query('COMMIT');
        transactionOpen = false;
        return sendSuccess(res, data, 'Pool Dive completed', undefined, 201);
    } catch (error) {
        if (transactionOpen) await client.query('ROLLBACK');
        console.error('Social Pool Dive action error:', error);
        return sendError(res, 'Pool Dive action failed.', 500, 'SOCIAL_ARCADE_ACTION_FAILED');
    } finally {
        client.release();
    }
}
