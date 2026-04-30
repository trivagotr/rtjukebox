import { Router, Response } from 'express';
import { db } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { sendSuccess, sendError } from '../utils/response';
import {
    awardUserPoints,
    buildSpendablePointUpdate,
    getGameAwardedPoints,
} from '../services/gamification';
import { getIstanbulDayKey } from '../services/jukeboxScoring';

const router = Router();

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

    try {
        const itemResult = await db.query(
            `SELECT id, title, cost_points, stock_quantity, is_active
             FROM market_items
             WHERE id = $1 AND is_active = true`,
            [req.params.itemId],
        );
        const item = itemResult.rows[0];

        if (!item) {
            return sendError(res, 'Market item not found', 404);
        }

        if (item.stock_quantity !== null && Number(item.stock_quantity) <= 0) {
            return sendError(res, 'Market item is out of stock', 409);
        }

        const pointsResult = await db.query('SELECT spendable_points FROM user_points WHERE user_id = $1', [req.user?.id]);
        const spendablePoints = toNumber(pointsResult.rows[0]?.spendable_points);
        const costPoints = toNumber(item.cost_points);
        const update = buildSpendablePointUpdate(spendablePoints, costPoints);

        if (!update.canRedeem) {
            return sendError(res, 'Not enough points', 400);
        }

        await db.query('BEGIN');
        try {
            await db.query(
                'UPDATE user_points SET spendable_points = $1, updated_at = NOW() WHERE user_id = $2',
                [update.nextSpendablePoints, req.user?.id],
            );
            if (item.stock_quantity !== null) {
                await db.query(
                    'UPDATE market_items SET stock_quantity = stock_quantity - 1, updated_at = NOW() WHERE id = $1',
                    [item.id],
                );
            }
            const redemptionResult = await db.query(
                `INSERT INTO market_redemptions (user_id, market_item_id, cost_points, status)
                 VALUES ($1, $2, $3, 'pending')
                 RETURNING *`,
                [req.user?.id, item.id, costPoints],
            );
            await db.query('COMMIT');

            return sendSuccess(
                res,
                {
                    redemption: redemptionResult.rows[0],
                    spendable_points: update.nextSpendablePoints,
                },
                'Market item redeemed',
                undefined,
                201,
            );
        } catch (error) {
            await db.query('ROLLBACK');
            throw error;
        }
    } catch (error) {
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
        const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
        if (!code) {
            return sendError(res, 'QR code required', 400);
        }

        const rewardResult = await db.query(
            `SELECT id, points
             FROM qr_rewards
             WHERE code = $1
               AND is_active = true
               AND (starts_at IS NULL OR starts_at <= NOW())
               AND (ends_at IS NULL OR ends_at >= NOW())`,
            [code],
        );
        const reward = rewardResult.rows[0];

        if (!reward) {
            return sendError(res, 'QR reward not found', 404);
        }

        await db.query(
            `INSERT INTO qr_reward_claims (qr_reward_id, user_id, points_awarded)
             VALUES ($1, $2, $3)`,
            [reward.id, req.user?.id, reward.points],
        );
        await awardUserPoints({
            userId: req.user!.id,
            amount: toNumber(reward.points),
            category: 'events',
            sourceType: 'qr_reward',
            sourceId: reward.id,
        });

        return sendSuccess(res, { points_awarded: toNumber(reward.points) }, 'QR reward claimed', undefined, 201);
    } catch (error: any) {
        if (error?.code === '23505') {
            return sendError(res, 'QR reward already claimed', 409);
        }

        console.error('QR claim error:', error);
        return sendError(res, 'Failed to claim QR reward', 500);
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
        const score = Math.max(0, Math.floor(toNumber(req.body?.score)));
        const gameResult = await db.query(
            `SELECT id, point_rate, daily_point_limit, is_active
             FROM arcade_games
             WHERE id = $1 AND is_active = true`,
            [req.params.gameId],
        );
        const game = gameResult.rows[0];

        if (!game) {
            return sendError(res, 'Game not found', 404);
        }

        const dailyResult = await db.query(
            `SELECT COALESCE(SUM(points_awarded), 0) AS awarded_today
             FROM game_score_submissions
             WHERE user_id = $1 AND game_id = $2 AND submitted_at::date = $3::date`,
            [req.user?.id, game.id, getIstanbulDayKey()],
        );
        const awardedToday = toNumber(dailyResult.rows[0]?.awarded_today);
        const dailyLimit = toNumber(game.daily_point_limit);
        const remainingDailyLimit = Math.max(0, dailyLimit - awardedToday);
        const calculatedAward = getGameAwardedPoints({
            score,
            pointRate: toNumber(game.point_rate),
            dailyLimit,
        });
        const pointsAwarded = Math.min(calculatedAward, remainingDailyLimit);

        if (pointsAwarded > 0) {
            await awardUserPoints({
                userId: req.user!.id,
                amount: pointsAwarded,
                category: 'games',
                sourceType: 'arcade_game',
                sourceId: game.id,
                metadata: { score },
            });
        }

        await db.query(
            `INSERT INTO game_score_submissions (game_id, user_id, score, points_awarded)
             VALUES ($1, $2, $3, $4)`,
            [game.id, req.user?.id, score, pointsAwarded],
        );

        return sendSuccess(res, { score, points_awarded: pointsAwarded }, 'Game score submitted', undefined, 201);
    } catch (error) {
        console.error('Game score error:', error);
        return sendError(res, 'Failed to submit game score', 500);
    }
}

export async function handleListeningHeartbeatRequest(req: AuthRequest, res: Response) {
    if (!ensureRegisteredAccount(req, res)) {
        return undefined;
    }

    try {
        const listenedSeconds = Math.max(0, Math.floor(toNumber(req.body?.listened_seconds)));
        const pointsAwarded = Math.min(10, Math.floor(listenedSeconds / 300));
        const result = await db.query(
            `INSERT INTO listening_sessions (
                user_id, content_type, content_id, content_title, listened_seconds, points_awarded, last_heartbeat_at
             )
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             RETURNING *`,
            [
                req.user?.id,
                req.body?.content_type ?? 'radio',
                req.body?.content_id ?? null,
                req.body?.content_title ?? null,
                listenedSeconds,
                pointsAwarded,
            ],
        );

        if (pointsAwarded > 0) {
            await awardUserPoints({
                userId: req.user!.id,
                amount: pointsAwarded,
                category: 'listening',
                sourceType: 'listening_session',
                sourceId: result.rows[0]?.id ?? null,
                metadata: {
                    content_type: req.body?.content_type ?? 'radio',
                    listened_seconds: listenedSeconds,
                },
            });
        }

        return sendSuccess(res, { session: result.rows[0], points_awarded: pointsAwarded }, 'Listening heartbeat saved');
    } catch (error) {
        console.error('Listening heartbeat error:', error);
        return sendError(res, 'Failed to save listening heartbeat', 500);
    }
}

router.use(authMiddleware);
router.get('/me', handleCurrentGamificationRequest);
router.get('/home', handleGamificationHomeRequest);
router.get('/market', handleMarketRequest);
router.post('/market/:itemId/redeem', handleMarketRedemptionRequest);
router.get('/events', handleEventsRequest);
router.get('/events/my-tickets', handleMyTicketsRequest);
router.post('/events/:eventId/register', handleEventRegistrationRequest);
router.post('/events/qr/claim', handleQrClaimRequest);
router.get('/games', handleGamesRequest);
router.post('/games/:gameId/score', handleGameScoreRequest);
router.post('/listening/heartbeat', handleListeningHeartbeatRequest);

export default router;
