import { Router, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { rbacMiddleware, ROLES } from '../middleware/rbac';
import { adminRateLimit } from '../middleware/rateLimits';
import { adminAuditLog } from '../middleware/adminAudit';
import { db } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { sendSuccess, sendError } from '../utils/response';
import {
    awardUserPointsInTransaction,
    getGameAwardedPoints,
    withGamificationTransaction,
} from '../services/gamification';
import { getIstanbulDayKey } from '../services/jukeboxScoring';
import { createQrRewardToken, verifyQrRewardToken } from '../services/qrRewardTokens';
import { heartbeatRateLimit, writeRateLimit } from '../middleware/rateLimits';

const router = Router();

const gameScoreSubmissionSchema = z.object({
    score: z.number().int().min(0).max(1_000_000),
    session_id: z.string().uuid(),
}).strict();

const listeningHeartbeatSchema = z.object({
    content_type: z.enum(['radio', 'podcast']).default('radio'),
    content_id: z.string().trim().max(120).optional().nullable(),
    content_title: z.string().trim().max(500).optional().nullable(),
    // Accepted for compatibility with older clients, but never used to award points.
    listened_seconds: z.number().int().min(0).max(86_400).optional(),
}).strict();

const qrClaimSchema = z.object({ code: z.string().trim().min(1).max(2048) }).strict();
const emptyBodySchema = z.object({}).strict();

function toNumber(value: unknown, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function mapPoints(row: Record<string, unknown> = {}) {
    return {
        lifetime_points: toNumber(row.lifetime_points),
        spendable_points: toNumber(row.spendable_points),
        monthly_points: toNumber(row.monthly_points),
        listening_points: toNumber(row.listening_points),
        events_points: toNumber(row.events_points),
        games_points: toNumber(row.games_points),
        social_points: toNumber(row.social_points),
        jukebox_points: toNumber(row.jukebox_points),
    };
}

function ensureRegisteredAccount(req: AuthRequest, res: Response) {
    if (req.user?.role === 'guest') {
        sendError(res, 'Account required', 403);
        return false;
    }

    return true;
}

class GamificationWriteRejected extends Error {
    constructor(readonly status: number, message: string) {
        super(message);
    }
}

export async function handleCurrentGamificationRequest(req: AuthRequest, res: Response) {
    try {
        const result = await db.query(
            `SELECT u.id,
                    u.display_name,
                    u.avatar_url,
                    u.is_guest,
                    up.lifetime_points,
                    up.spendable_points,
                    up.monthly_points,
                    up.listening_points,
                    up.events_points,
                    up.games_points,
                    up.social_points,
                    up.jukebox_points
             FROM users u
             LEFT JOIN user_points up ON up.user_id = u.id
             WHERE u.id = $1`,
            [req.user?.id],
        );

        if (!result.rows[0]) {
            return sendError(res, 'User not found', 404);
        }

        return sendSuccess(
            res,
            {
                user: {
                    id: result.rows[0].id,
                    display_name: result.rows[0].display_name,
                    avatar_url: result.rows[0].avatar_url,
                    is_guest: Boolean(result.rows[0].is_guest),
                },
                points: mapPoints(result.rows[0]),
            },
            'Gamification profile fetched',
        );
    } catch (error) {
        console.error('Gamification profile error:', error);
        return sendError(res, 'Failed to fetch gamification profile', 500);
    }
}

export async function handleGamificationHomeRequest(req: AuthRequest, res: Response) {
    try {
        const [points, events, games, market] = await Promise.all([
            db.query(
                `SELECT lifetime_points, spendable_points, monthly_points, listening_points, events_points, games_points, social_points, jukebox_points
                 FROM user_points WHERE user_id = $1`,
                [req.user?.id],
            ),
            db.query(
                `SELECT id, title, description, starts_at, ends_at, location, image_url, check_in_points
                 FROM app_events
                 WHERE is_active = true
                 ORDER BY starts_at ASC NULLS LAST
                 LIMIT 5`,
            ),
            db.query(
                `SELECT id, slug, title, description, point_rate, daily_point_limit, metadata
                 FROM arcade_games
                 WHERE is_active = true
                 ORDER BY title ASC
                 LIMIT 5`,
            ),
            db.query(
                `SELECT id, title, description, item_kind, cost_points, image_url, stock_quantity
                 FROM market_items
                 WHERE is_active = true
                 ORDER BY cost_points ASC, title ASC
                 LIMIT 5`,
            ),
        ]);

        return sendSuccess(res, {
            points: mapPoints(points.rows[0]),
            events: events.rows,
            games: games.rows,
            market: market.rows,
        }, 'Gamification home fetched');
    } catch (error) {
        console.error('Gamification home error:', error);
        return sendError(res, 'Failed to fetch gamification home', 500);
    }
}

export async function handleMarketRequest(req: AuthRequest, res: Response) {
    try {
        const result = await db.query(
            `SELECT id, title, description, item_kind, cost_points, image_url, stock_quantity, metadata
             FROM market_items
             WHERE is_active = true
             ORDER BY cost_points ASC, title ASC`,
        );

        return sendSuccess(res, { items: result.rows }, 'Market fetched');
    } catch (error) {
        console.error('Market fetch error:', error);
        return sendError(res, 'Failed to fetch market', 500);
    }
}

export async function handleMarketRedemptionRequest(req: AuthRequest, res: Response) {
    if (!ensureRegisteredAccount(req, res)) {
        return undefined;
    }

    if (!z.string().uuid().safeParse(req.params.itemId).success || !emptyBodySchema.safeParse(req.body ?? {}).success) {
        return sendError(res, 'Invalid market redemption request', 400, 'INVALID_MARKET_REDEMPTION');
    }

    try {
        const redemption = await withGamificationTransaction(async (client) => {
            const itemResult = await client.query(
                `SELECT id, cost_points
                 FROM market_items
                 WHERE id = $1 AND is_active = true
                 FOR UPDATE`,
                [req.params.itemId],
            );
            const item = itemResult.rows[0];
            if (!item) throw new GamificationWriteRejected(404, 'Market item not found');

            const costPoints = toNumber(item.cost_points);
            if (costPoints <= 0) throw new GamificationWriteRejected(400, 'Market item cost is invalid');

            const stockUpdate = await client.query(
                `UPDATE market_items
                 SET stock_quantity = CASE WHEN stock_quantity IS NULL THEN NULL ELSE stock_quantity - 1 END,
                     updated_at = NOW()
                 WHERE id = $1 AND is_active = true
                   AND (stock_quantity IS NULL OR stock_quantity > 0)
                 RETURNING stock_quantity`,
                [item.id],
            );
            if (stockUpdate.rows.length === 0) throw new GamificationWriteRejected(409, 'Market item is out of stock');

            const pointsUpdate = await client.query(
                `UPDATE user_points
                 SET spendable_points = spendable_points - $1, updated_at = NOW()
                 WHERE user_id = $2 AND spendable_points >= $1
                 RETURNING spendable_points`,
                [costPoints, req.user?.id],
            );
            if (pointsUpdate.rows.length === 0) throw new GamificationWriteRejected(400, 'Not enough points');

            const redemptionResult = await client.query(
                `INSERT INTO market_redemptions (user_id, market_item_id, cost_points, status)
                 VALUES ($1, $2, $3, 'pending')
                 RETURNING *`,
                [req.user!.id, item.id, costPoints],
            );
            return {
                redemption: redemptionResult.rows[0],
                spendablePoints: toNumber(pointsUpdate.rows[0].spendable_points),
            };
        });

        return sendSuccess(res, {
            redemption: redemption.redemption,
            spendable_points: redemption.spendablePoints,
        }, 'Market item redeemed', undefined, 201);
    } catch (error) {
        if (error instanceof GamificationWriteRejected) return sendError(res, error.message, error.status);
        console.error('Market redemption error:', error);
        return sendError(res, 'Failed to redeem market item', 500);
    }
}

export async function handleEventsRequest(req: AuthRequest, res: Response) {
    try {
        const result = await db.query(
            `SELECT id, title, description, starts_at, ends_at, location, image_url, check_in_points, metadata
             FROM app_events
             WHERE is_active = true
             ORDER BY starts_at ASC NULLS LAST`,
        );

        return sendSuccess(res, { events: result.rows }, 'Events fetched');
    } catch (error) {
        console.error('Events fetch error:', error);
        return sendError(res, 'Failed to fetch events', 500);
    }
}

export async function handleEventRegistrationRequest(req: AuthRequest, res: Response) {
    if (!ensureRegisteredAccount(req, res)) {
        return undefined;
    }

    try {
        const result = await db.query(
            `INSERT INTO event_registrations (user_id, event_id, status)
             VALUES ($1, $2, 'registered')
             ON CONFLICT (user_id, event_id) DO UPDATE SET status = 'registered'
             RETURNING *`,
            [req.user?.id, req.params.eventId],
        );

        return sendSuccess(res, { registration: result.rows[0] }, 'Event registration saved', undefined, 201);
    } catch (error) {
        console.error('Event registration error:', error);
        return sendError(res, 'Failed to register event', 500);
    }
}

export async function handleMyTicketsRequest(req: AuthRequest, res: Response) {
    try {
        const result = await db.query(
            `SELECT er.id, er.status, er.ticket_code, er.checked_in_at, er.created_at,
                    ae.id AS event_id, ae.title, ae.starts_at, ae.ends_at, ae.location, ae.image_url
             FROM event_registrations er
             JOIN app_events ae ON ae.id = er.event_id
             WHERE er.user_id = $1
             ORDER BY ae.starts_at ASC NULLS LAST`,
            [req.user?.id],
        );

        return sendSuccess(res, { tickets: result.rows }, 'Tickets fetched');
    } catch (error) {
        console.error('Ticket fetch error:', error);
        return sendError(res, 'Failed to fetch tickets', 500);
    }
}

export async function handleQrClaimRequest(req: AuthRequest, res: Response) {
    if (!ensureRegisteredAccount(req, res)) {
        return undefined;
    }

    try {
        const parsed = qrClaimSchema.safeParse(req.body);
        if (!parsed.success) return sendError(res, 'Invalid QR reward token', 400, 'INVALID_QR_TOKEN');
        const token = verifyQrRewardToken(parsed.data.code);
        if (!token.valid) {
            return sendError(res, token.reason === 'expired' ? 'QR reward token expired' : 'Invalid QR reward token', token.reason === 'expired' ? 410 : 400, token.reason === 'expired' ? 'QR_TOKEN_EXPIRED' : 'INVALID_QR_TOKEN');
        }

        const pointsAwarded = await withGamificationTransaction(async (client) => {
            const rewardResult = await client.query(
                `SELECT id, points
                 FROM qr_rewards
                 WHERE id = $1
                   AND is_active = true
                   AND (starts_at IS NULL OR starts_at <= NOW())
                   AND (ends_at IS NULL OR ends_at >= NOW())
                 FOR UPDATE`,
                [token.rewardId],
            );
            const reward = rewardResult.rows[0];
            if (!reward) throw new GamificationWriteRejected(404, 'QR reward not found');

            await client.query(
                `INSERT INTO qr_reward_claims (qr_reward_id, user_id, points_awarded)
                 VALUES ($1, $2, $3)`,
                [reward.id, req.user!.id, reward.points],
            );
            await awardUserPointsInTransaction(client, {
                userId: req.user!.id,
                amount: toNumber(reward.points),
                category: 'events',
                sourceType: 'qr_reward',
                sourceId: reward.id,
            });
            return toNumber(reward.points);
        });

        return sendSuccess(res, { points_awarded: pointsAwarded }, 'QR reward claimed', undefined, 201);
    } catch (error: any) {
        if (error instanceof GamificationWriteRejected) return sendError(res, error.message, error.status);
        if (error?.code === '23505') {
            return sendError(res, 'QR reward already claimed', 409);
        }

        console.error('QR claim error:', error);
        return sendError(res, 'Failed to claim QR reward', 500);
    }
}

export async function handleQrRewardTokenIssueRequest(req: AuthRequest, res: Response) {
    const rewardId = z.string().uuid().safeParse(req.params.rewardId);
    if (!rewardId.success) return sendError(res, 'Invalid QR reward ID', 400, 'INVALID_QR_REWARD_ID');

    try {
        const rewardResult = await db.query(
            `SELECT id, ends_at FROM qr_rewards
             WHERE id = $1 AND is_active = true
               AND (starts_at IS NULL OR starts_at <= NOW())
               AND (ends_at IS NULL OR ends_at > NOW())`,
            [rewardId.data],
        );
        const reward = rewardResult.rows[0];
        if (!reward) return sendError(res, 'Active QR reward not found', 404);

        const now = Math.floor(Date.now() / 1000);
        let expiresAt = now + 15 * 60;
        if (reward.ends_at) expiresAt = Math.min(expiresAt, Math.floor(new Date(reward.ends_at).getTime() / 1000));
        if (expiresAt <= now) return sendError(res, 'QR reward is no longer active', 409);

        const code = createQrRewardToken(reward.id, expiresAt);
        return sendSuccess(res, { code, expires_at: new Date(expiresAt * 1000).toISOString() }, 'QR reward token issued');
    } catch (error) {
        console.error('QR reward token issue failed:', error instanceof Error ? error.name : 'Error');
        return sendError(res, 'Failed to issue QR reward token', 500);
    }

    if (!z.string().uuid().safeParse(req.params.eventId).success || !emptyBodySchema.safeParse(req.body ?? {}).success) {
        return sendError(res, 'Invalid event registration request', 400, 'INVALID_EVENT_REGISTRATION');
    }
}

export async function handleGamesRequest(req: AuthRequest, res: Response) {
    try {
        const result = await db.query(
            `SELECT id, slug, title, description, point_rate, daily_point_limit, metadata
             FROM arcade_games
             WHERE is_active = true
             ORDER BY title ASC`,
        );

        return sendSuccess(res, { games: result.rows }, 'Games fetched');
    } catch (error) {
        console.error('Games fetch error:', error);
        return sendError(res, 'Failed to fetch games', 500);
    }
}

export async function handleGameScoreRequest(req: AuthRequest, res: Response) {
    if (!ensureRegisteredAccount(req, res)) {
        return undefined;
    }

    try {
        const parsedSubmission = gameScoreSubmissionSchema.safeParse(req.body);
        if (!parsedSubmission.success) return sendError(res, 'Invalid game score submission', 400, 'INVALID_GAME_SCORE_SUBMISSION');
        const { score, session_id: sessionId } = parsedSubmission.data;
        const userId = req.user!.id;
        const dayKey = getIstanbulDayKey();

        const submission = await withGamificationTransaction(async (client) => {
            await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`arcade-score:${userId}:${req.params.gameId}:${dayKey}`]);
            const gameResult = await client.query(
                `SELECT id, point_rate, daily_point_limit, is_active
                 FROM arcade_games
                 WHERE id = $1 AND is_active = true
                 FOR UPDATE`,
                [req.params.gameId],
            );
            const game = gameResult.rows[0];
            if (!game) return null;

            const sessionResult = await client.query(
                `SELECT id, started_at FROM game_play_sessions
                 WHERE id = $1 AND game_id = $2 AND user_id = $3
                   AND submitted_at IS NULL AND expires_at > NOW()
                 FOR UPDATE`,
                [sessionId, game.id, userId],
            );
            const session = sessionResult.rows[0];
            if (!session) return { error: 'session_invalid' as const };
            const elapsedResult = await client.query(
                `SELECT FLOOR(EXTRACT(EPOCH FROM (NOW() - $1::timestamp)) * 1000)::integer AS elapsed_ms`,
                [session.started_at],
            );
            const elapsedMs = Number(elapsedResult.rows[0]?.elapsed_ms ?? 0);
            if (elapsedMs < 1_000 || elapsedMs > 7_200_000) return { error: 'session_duration_invalid' as const };
            await client.query('UPDATE game_play_sessions SET submitted_at = NOW() WHERE id = $1', [session.id]);

            const dailyResult = await client.query(
                `SELECT COALESCE(SUM(points_awarded), 0) AS awarded_today
                 FROM game_score_submissions
                 WHERE user_id = $1 AND game_id = $2 AND submitted_at::date = $3::date`,
                [userId, game.id, dayKey],
            );
            const dailyLimit = toNumber(game.daily_point_limit);
            const remainingDailyLimit = Math.max(0, dailyLimit - toNumber(dailyResult.rows[0]?.awarded_today));
            const pointsAwarded = Math.min(
                getGameAwardedPoints({ score, pointRate: toNumber(game.point_rate), dailyLimit }),
                remainingDailyLimit,
            );

            if (pointsAwarded > 0) {
                await awardUserPointsInTransaction(client, {
                    userId,
                    amount: pointsAwarded,
                    category: 'games',
                    sourceType: 'arcade_game',
                    sourceId: game.id,
                    metadata: { score },
                });
            }

            await client.query(
                `INSERT INTO game_score_submissions
                    (game_id, user_id, score, points_awarded, client_round_id, play_duration_ms, submission_source, session_id)
                 VALUES ($1, $2, $3, $4, $5, $6, 'server_session', $7)`,
                [game.id, userId, score, pointsAwarded, session.id, elapsedMs, session.id],
            );
            return { score, pointsAwarded };
        });

        if (!submission) return sendError(res, 'Game not found', 404);
        if ('error' in submission) {
            return sendError(res, submission.error === 'session_invalid' ? 'Game session is invalid, expired, or already used' : 'Game session duration is invalid', 409, 'INVALID_GAME_SESSION');
        }
        return sendSuccess(res, { score: submission.score, points_awarded: submission.pointsAwarded }, 'Game score submitted', undefined, 201);
    } catch (error) {
        if ((error as { code?: string })?.code === '23505') {
            return sendError(res, 'This game round was already submitted', 409, 'GAME_ROUND_ALREADY_SUBMITTED');
        }
        console.error('Game score error:', error);
        return sendError(res, 'Failed to submit game score', 500);
    }
}

export async function handleGameSessionStartRequest(req: AuthRequest, res: Response) {
    if (!ensureRegisteredAccount(req, res)) return undefined;
    const gameId = z.string().uuid().safeParse(req.params.gameId);
    if (!gameId.success || !emptyBodySchema.safeParse(req.body ?? {}).success) {
        return sendError(res, 'Invalid game session request', 400, 'INVALID_GAME_SESSION_REQUEST');
    }

    try {
        const sessionId = randomUUID();
        const session = await withGamificationTransaction(async (client) => {
            const game = await client.query('SELECT id FROM arcade_games WHERE id = $1 AND is_active = true FOR SHARE', [gameId.data]);
            if (!game.rows[0]) return null;
            const inserted = await client.query(
                `INSERT INTO game_play_sessions (id, game_id, user_id, started_at, expires_at)
                 VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '2 hours')
                 RETURNING id, started_at, expires_at`,
                [sessionId, gameId.data, req.user!.id],
            );
            return inserted.rows[0];
        });
        if (!session) return sendError(res, 'Game not found', 404);
        return sendSuccess(res, { session }, 'Game session started', undefined, 201);
    } catch (error) {
        console.error('Game session start error:', error instanceof Error ? error.name : 'Error');
        return sendError(res, 'Failed to start game session', 500);
    }
}

export async function handleListeningHeartbeatRequest(req: AuthRequest, res: Response) {
    if (!ensureRegisteredAccount(req, res)) {
        return undefined;
    }

    if (!z.string().uuid().safeParse(req.params.gameId).success) return sendError(res, 'Invalid game ID', 400, 'INVALID_GAME_ID');

    try {
        const parsed = listeningHeartbeatSchema.safeParse(req.body);
        if (!parsed.success) return sendError(res, 'Invalid listening heartbeat', 400, 'INVALID_LISTENING_HEARTBEAT');
        const { content_type: contentType, content_id: contentId = null, content_title: contentTitle = null } = parsed.data;
        const userId = req.user!.id;
        const result = await withGamificationTransaction(async (client) => {
            await client.query(
                'SELECT pg_advisory_xact_lock(hashtext($1))',
                [`listening:${userId}:${contentType}:${contentId ?? ''}`],
            );
            const active = await client.query(
                `SELECT * FROM listening_sessions
                 WHERE user_id = $1 AND content_type = $2 AND content_id IS NOT DISTINCT FROM $3
                   AND last_heartbeat_at > NOW() - INTERVAL '10 minutes'
                 ORDER BY last_heartbeat_at DESC LIMIT 1 FOR UPDATE`,
                [userId, contentType, contentId],
            );
            const session = active.rows[0];
            if (!session) {
                const inserted = await client.query(
                    `INSERT INTO listening_sessions (user_id, content_type, content_id, content_title, listened_seconds, points_awarded, last_heartbeat_at)
                     VALUES ($1, $2, $3, $4, 0, 0, NOW()) RETURNING *`,
                    [userId, contentType, contentId, contentTitle],
                );
                return { session: inserted.rows[0], pointsAwarded: 0 };
            }

            const elapsed = await client.query(
                `SELECT LEAST(60, GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - $1::timestamp)))))::integer AS seconds`,
                [session.last_heartbeat_at],
            );
            const listenedSeconds = Number(session.listened_seconds ?? 0) + Number(elapsed.rows[0]?.seconds ?? 0);
            const previousPoints = Number(session.points_awarded ?? 0);
            const totalPoints = Math.floor(listenedSeconds / 300);
            const pointsAwarded = Math.max(0, totalPoints - previousPoints);
            const updated = await client.query(
                `UPDATE listening_sessions
                 SET listened_seconds = $2, points_awarded = $3, last_heartbeat_at = NOW(),
                     content_title = COALESCE($4, content_title)
                 WHERE id = $1 RETURNING *`,
                [session.id, listenedSeconds, totalPoints, contentTitle],
            );
            if (pointsAwarded > 0) {
                await awardUserPointsInTransaction(client, {
                    userId,
                    amount: pointsAwarded,
                    category: 'listening',
                    sourceType: 'listening_session',
                    sourceId: session.id,
                    metadata: { content_type: contentType, listened_seconds: Number(elapsed.rows[0]?.seconds ?? 0) },
                });
            }
            return { session: updated.rows[0], pointsAwarded };
        });

        return sendSuccess(res, result, 'Listening heartbeat saved');
    } catch (error) {
        console.error('Listening heartbeat error:', error);
        return sendError(res, 'Failed to save listening heartbeat', 500);
    }
}

router.use(authMiddleware);
router.post('/admin/qr-rewards/:rewardId/token', rbacMiddleware([ROLES.ADMIN]), adminRateLimit, adminAuditLog, handleQrRewardTokenIssueRequest);
router.get('/me', handleCurrentGamificationRequest);
router.get('/home', handleGamificationHomeRequest);
router.get('/market', handleMarketRequest);
router.post('/market/:itemId/redeem', writeRateLimit, handleMarketRedemptionRequest);
router.get('/events', handleEventsRequest);
router.get('/events/my-tickets', handleMyTicketsRequest);
router.post('/events/:eventId/register', writeRateLimit, handleEventRegistrationRequest);
router.post('/events/qr/claim', writeRateLimit, handleQrClaimRequest);
router.get('/games', handleGamesRequest);
router.post('/games/:gameId/sessions', writeRateLimit, handleGameSessionStartRequest);
router.post('/games/:gameId/score', writeRateLimit, handleGameScoreRequest);
router.post('/listening/heartbeat', heartbeatRateLimit, handleListeningHeartbeatRequest);

export default router;
