import crypto from 'crypto';
import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import type { PoolClient } from 'pg';
import { db } from '../db';
import { AuthRequest } from '../middleware/auth';
import { requireWebCsrf, webAuthMiddleware } from '../services/webSession';
import { sendSuccess, sendError } from '../utils/response';
import {
    awardUserPoints,
    getGameAwardedPoints,
    spendUserPoints,
} from '../services/gamification';
import { getIstanbulDayKey, getIstanbulYearMonth } from '../services/jukeboxScoring';
import { gameScoreFingerprint } from '../services/gameScoreRecovery';
import { handlePoolDiveAction, handlePoolDiveStart } from './socialArcade';
import {
    claimGameSessionProof,
    completeGameSessionProof,
    GameSessionProofError,
    issueGameSessionProof,
    releaseGameSessionProof,
} from '../services/gameSessionProof';

const router = Router();

const gameScoreLimiter = rateLimit({
    windowMs: 60_000,
    max: process.env.NODE_ENV === 'test' ? 1000 : 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: AuthRequest) => req.user?.id ?? 'anonymous-game-user',
});

const socialArcadeLimiter = rateLimit({
    windowMs: 60_000,
    max: process.env.NODE_ENV === 'test' ? 1000 : 40,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: AuthRequest) => req.user?.id ?? 'anonymous-social-arcade-user',
    handler: (_req, res) => sendError(
        res,
        'Social arcade action limit reached. Please wait a moment.',
        429,
        'SOCIAL_ARCADE_RATE_LIMITED',
    ),
});

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

const CLIENT_GAME_PRACTICE_ONLY_ERROR = 'Client-reported games are practice-only and do not award Gold';

function isVerifiedMobileGame(metadata: unknown) {
    const value = metadata as Record<string, unknown> | null;
    return value?.surface === 'mobile' && value?.verification === 'client-timed-session';
}

function optionalIdempotencyKey(req: AuthRequest): string | null {
    const headerValue = typeof req.get === 'function' ? req.get('Idempotency-Key') : undefined;
    const value = headerValue ?? req.body?.idempotency_key ?? req.body?.idempotencyKey;
    if (typeof value !== 'string') return null;
    const normalized = value.trim().slice(0, 160);
    return normalized || null;
}

const DEFAULT_STUDY_ROOM_ID = 'sesli-kutuphane';
const STUDY_HEARTBEAT_MAX_DELTA_SECONDS = 300;
const LIBRARY_BREAK_ZONE_ID = 'd-sigara';
const LIBRARY_SEATS = [
    { id: 'A1', label: 'A1', position: { x: 4, y: 2 }, kind: 'desk' },
    { id: 'A2', label: 'A2', position: { x: 6, y: 2 }, kind: 'desk' },
    { id: 'A3', label: 'A3', position: { x: 8, y: 2 }, kind: 'desk' },
    { id: 'A4', label: 'A4', position: { x: 10, y: 2 }, kind: 'desk' },
    { id: 'B1', label: 'B1', position: { x: 4, y: 4 }, kind: 'desk' },
    { id: 'B2', label: 'B2', position: { x: 6, y: 4 }, kind: 'desk' },
    { id: 'B3', label: 'B3', position: { x: 8, y: 4 }, kind: 'desk' },
    { id: 'B4', label: 'B4', position: { x: 10, y: 4 }, kind: 'desk' },
    { id: 'C1', label: 'C1', position: { x: 4, y: 6 }, kind: 'desk' },
    { id: 'C2', label: 'C2', position: { x: 6, y: 6 }, kind: 'desk' },
    { id: 'C3', label: 'C3', position: { x: 8, y: 6 }, kind: 'desk' },
    { id: 'C4', label: 'C4', position: { x: 10, y: 6 }, kind: 'desk' },
    { id: 'D1', label: 'D1', position: { x: 4, y: 8 }, kind: 'desk' },
    { id: 'D2', label: 'D2', position: { x: 6, y: 8 }, kind: 'desk' },
    { id: 'D3', label: 'D3', position: { x: 8, y: 8 }, kind: 'desk' },
    { id: 'D4', label: 'D4', position: { x: 10, y: 8 }, kind: 'desk' },
    { id: 'Window Desk', label: 'Window Desk', position: { x: 12, y: 3 }, kind: 'window' },
    { id: 'Quiet Desk', label: 'Quiet Desk', position: { x: 12, y: 5 }, kind: 'quiet' },
    { id: 'Focus Desk', label: 'Focus Desk', position: { x: 12, y: 7 }, kind: 'focus' },
    { id: 'Corner Desk', label: 'Corner Desk', position: { x: 12, y: 9 }, kind: 'quiet' },
];
const LIBRARY_ZONES = [
    { id: 'entrance', label: 'Entrance', position: { x: 1, y: 10 }, kind: 'navigation' },
    { id: 'study-chairs', label: 'Study Chairs', position: { x: 7, y: 5 }, kind: 'study' },
    { id: LIBRARY_BREAK_ZONE_ID, label: 'D Sigara Break Area', position: { x: 13, y: 10 }, kind: 'break' },
    { id: 'wardrobe-shelf', label: 'Wardrobe Shelf', position: { x: 2, y: 2 }, kind: 'wardrobe' },
    { id: 'exit', label: 'Exit', position: { x: 0, y: 11 }, kind: 'navigation' },
];
const CHIM_ALAN_ROWS = [
    { id: 'upper', y: 4, label: 'Upper lawn' },
    { id: 'mid-upper', y: 8, label: 'Mid-upper lawn' },
    { id: 'middle', y: 11, label: 'Middle lawn' },
    { id: 'mid-lower', y: 14, label: 'Mid-lower lawn' },
    { id: 'lower', y: 17, label: 'Lower lawn' },
];
const CHIM_ALAN_SEATS = CHIM_ALAN_ROWS.flatMap((row) =>
    [4, 6, 8, 10, 12, 14, 16, 18, 20, 22].map((x) => ({
        id: `chim-${row.id}-seat-${x}`,
        label: `${row.label} ${x}`,
        position: { x, y: row.y },
        kind: 'amphitheatre-seat',
    })),
);
const CHIM_ALAN_ZONES = [
    { id: 'chim-entrance', label: 'Çim alan entrance', position: { x: 13, y: 20 }, kind: 'navigation' },
    { id: 'chim-stage', label: 'Çim alan stage', position: { x: 14, y: 3 }, kind: 'stage' },
    { id: 'spark', label: 'Spark', position: { x: 14, y: 3 }, kind: 'actor' },
    { id: 'rock', label: 'Rock', position: { x: 23, y: 6 }, kind: 'actor' },
    { id: LIBRARY_BREAK_ZONE_ID, label: 'D Sigara Break Area', position: { x: 25, y: 17 }, kind: 'break' },
];
const ALLOWED_OUTFIT_KEYS = new Set(['baseId', 'shirtId', 'hoodieId', 'pantsId', 'shoesId', 'backpackId', 'accessoryId']);

function normalizeShortSlug(value: unknown, fallback: string) {
    const raw = Array.isArray(value) ? value[0] : value;
    const normalized = String(raw ?? fallback)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return normalized.slice(0, 80) || fallback;
}

function normalizeAvatarStyle(value: unknown) {
    const raw = Array.isArray(value) ? value[0] : value;
    const normalized = String(raw ?? 'classic-red')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return normalized.slice(0, 80) || 'classic-red';
}

function normalizePresenceMode(value: unknown) {
    return value === 'break' ? 'break' : 'studying';
}

function getStudyRoomDefinition(roomId: string) {
    if (roomId === 'chim-alan') {
        return {
            room: {
                id: 'chim-alan',
                title: 'Çim alan',
                theme: 'semantic-amphitheatre',
                chat_enabled: false,
            },
            seats: CHIM_ALAN_SEATS,
            zones: CHIM_ALAN_ZONES,
        };
    }

    return {
        room: {
            id: roomId,
            title: 'Library',
            theme: 'pixel-library',
            chat_enabled: false,
        },
        seats: LIBRARY_SEATS,
        zones: LIBRARY_ZONES,
    };
}

function normalizeSeatId(value: unknown, roomId = DEFAULT_STUDY_ROOM_ID) {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) {
        return null;
    }

    return getStudyRoomDefinition(roomId).seats.find((seat) => seat.id.toLowerCase() === raw.toLowerCase())?.id ?? null;
}

function normalizeBreakZoneId(value: unknown, presenceMode: string) {
    if (presenceMode !== 'break') {
        return null;
    }

    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return raw === LIBRARY_BREAK_ZONE_ID ? LIBRARY_BREAK_ZONE_ID : LIBRARY_BREAK_ZONE_ID;
}

function normalizeEquippedOutfit(value: unknown) {
    const parsed = typeof value === 'string' ? (() => {
        try {
            return JSON.parse(value);
        } catch {
            return {};
        }
    })() : value;

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {};
    }

    return Object.entries(parsed as Record<string, unknown>).reduce<Record<string, string | null>>((outfit, [key, itemId]) => {
        if (!ALLOWED_OUTFIT_KEYS.has(key)) {
            return outfit;
        }

        if (itemId === null) {
            outfit[key] = null;
            return outfit;
        }

        if (typeof itemId === 'string') {
            const normalized = itemId.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
            if (normalized) {
                outfit[key] = normalized.slice(0, 80);
            }
        }

        return outfit;
    }, {});
}

function clampGridPosition(value: unknown, fallback: number, max: number) {
    return Math.max(0, Math.min(max, Math.floor(toNumber(value, fallback))));
}

function mapStudyParticipant(row: Record<string, unknown> = {}) {
    return {
        user_id: row.user_id,
        display_name: row.display_name ?? 'RadioTEDU student',
        avatar_url: row.avatar_url ?? null,
        room_id: row.room_id ?? DEFAULT_STUDY_ROOM_ID,
        avatar_style: row.avatar_style ?? 'classic-red',
        position: {
            x: toNumber(row.position_x, 6),
            y: toNumber(row.position_y, 8),
        },
        studied_seconds_today: toNumber(row.studied_seconds_today),
        studied_seconds_total: toNumber(row.studied_seconds_total),
        current_session_started_at: row.current_session_started_at ?? null,
        last_heartbeat_at: row.last_heartbeat_at ?? null,
        seat_id: typeof row.seat_id === 'string' ? row.seat_id : null,
        presence_mode: normalizePresenceMode(row.presence_mode),
        break_zone_id: typeof row.break_zone_id === 'string' ? row.break_zone_id : null,
        equipped_outfit: normalizeEquippedOutfit(row.equipped_outfit),
    };
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
                    COALESCE(ums.score, 0) AS monthly_points,
                    up.listening_points,
                    up.events_points,
                    up.games_points,
                    up.social_points,
                    up.jukebox_points
             FROM users u
             LEFT JOIN user_points up ON up.user_id = u.id
             LEFT JOIN user_monthly_rank_scores ums ON ums.user_id = u.id AND ums.year_month = $2
             WHERE u.id = $1`,
            [req.user?.id, getIstanbulYearMonth(new Date())],
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
                `SELECT up.lifetime_points, up.spendable_points, COALESCE(ums.score, 0) AS monthly_points,
                        up.listening_points, up.events_points, up.games_points, up.social_points, up.jukebox_points
                 FROM user_points up
                 LEFT JOIN user_monthly_rank_scores ums ON ums.user_id = up.user_id AND ums.year_month = $2
                 WHERE up.user_id = $1`,
                [req.user?.id, getIstanbulYearMonth(new Date())],
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

export async function handleStudyRoomRequest(req: AuthRequest, res: Response) {
    try {
        const roomId = normalizeShortSlug(req.query?.room_id, DEFAULT_STUDY_ROOM_ID);
        const roomDefinition = getStudyRoomDefinition(roomId);
        const result = await db.query(
            `SELECT p.user_id,
                    COALESCE(NULLIF(u.display_name, ''), 'RadioTEDU student') AS display_name,
                    u.avatar_url,
                    p.room_id,
                    p.avatar_style,
                    p.position_x,
                    p.position_y,
                    p.studied_seconds_today,
                    p.studied_seconds_total,
                    p.current_session_started_at,
                    p.last_heartbeat_at,
                    p.seat_id,
                    p.presence_mode,
                    p.break_zone_id,
                    p.equipped_outfit
             FROM study_room_presence p
             JOIN users u ON u.id = p.user_id
             WHERE p.room_id = $1
               AND p.is_active = true
               AND p.last_heartbeat_at >= NOW() - INTERVAL '5 minutes'
             ORDER BY p.studied_seconds_today DESC, p.last_heartbeat_at DESC
             LIMIT 60`,
            [roomId],
        );

        return sendSuccess(res, {
            room: roomDefinition.room,
            zones: roomDefinition.zones,
            seats: roomDefinition.seats,
            participants: result.rows.map(mapStudyParticipant),
        }, 'Study room fetched');
    } catch (error) {
        console.error('Study room fetch error:', error);
        return sendError(res, 'Failed to fetch study room', 500);
    }
}

export async function handleStudyHeartbeatRequest(req: AuthRequest, res: Response) {
    if (!ensureRegisteredAccount(req, res)) {
        return undefined;
    }

    try {
        const roomId = normalizeShortSlug(req.body?.room_id, DEFAULT_STUDY_ROOM_ID);
        const roomDefinition = getStudyRoomDefinition(roomId);
        const avatarStyle = normalizeAvatarStyle(req.body?.avatar_style);
        const presenceMode = normalizePresenceMode(req.body?.presence_mode);
        const seatId = normalizeSeatId(req.body?.seat_id, roomId);
        const breakZoneId = normalizeBreakZoneId(req.body?.break_zone_id, presenceMode);
        const seat = roomDefinition.seats.find((roomSeat) => roomSeat.id === seatId);
        const breakZone = roomDefinition.zones.find((zone) => zone.id === breakZoneId);
        const positionX = breakZone?.position.x ?? seat?.position.x ?? clampGridPosition(req.body?.position?.x, 6, 15);
        const positionY = breakZone?.position.y ?? seat?.position.y ?? clampGridPosition(req.body?.position?.y, 8, 11);
        const equippedOutfit = normalizeEquippedOutfit(req.body?.equipped_outfit);
        const studiedSecondsDelta = Math.min(
            STUDY_HEARTBEAT_MAX_DELTA_SECONDS,
            Math.max(0, Math.floor(toNumber(req.body?.studied_seconds_delta))),
        ) * (presenceMode === 'break' ? 0 : 1);
        const dayKey = getIstanbulDayKey();
        if (seatId) {
            const seatResult = await db.query(
                `SELECT user_id
                 FROM study_room_presence
                 WHERE room_id = $1
                   AND seat_id = $2
                   AND user_id <> $3
                   AND is_active = true
                   AND last_heartbeat_at >= NOW() - INTERVAL '5 minutes'
                 LIMIT 1`,
                [roomId, seatId, req.user?.id],
            );

            if (seatResult.rows.length > 0) {
                return sendError(res, 'Seat already occupied', 409);
            }
        }
        const result = await db.query(
            `INSERT INTO study_room_presence (
                 user_id,
                 room_id,
                 day_key,
                 avatar_style,
                 position_x,
                 position_y,
                 studied_seconds_today,
                 studied_seconds_total,
                 current_session_started_at,
                 last_heartbeat_at,
                 seat_id,
                 presence_mode,
                 break_zone_id,
                 equipped_outfit,
                 is_active,
                 metadata,
                 updated_at
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $7, NOW(), NOW(), $8, $9, $10, $11::jsonb, true, $12, NOW())
             ON CONFLICT (user_id) DO UPDATE SET
                 room_id = EXCLUDED.room_id,
                 day_key = EXCLUDED.day_key,
                 avatar_style = EXCLUDED.avatar_style,
                 position_x = EXCLUDED.position_x,
                 position_y = EXCLUDED.position_y,
                 seat_id = EXCLUDED.seat_id,
                 presence_mode = EXCLUDED.presence_mode,
                 break_zone_id = EXCLUDED.break_zone_id,
                 equipped_outfit = EXCLUDED.equipped_outfit,
                 studied_seconds_today = CASE
                     WHEN study_room_presence.day_key = EXCLUDED.day_key
                         THEN study_room_presence.studied_seconds_today + EXCLUDED.studied_seconds_today
                     ELSE EXCLUDED.studied_seconds_today
                 END,
                 studied_seconds_total = study_room_presence.studied_seconds_total + EXCLUDED.studied_seconds_total,
                 current_session_started_at = CASE
                     WHEN study_room_presence.last_heartbeat_at < NOW() - INTERVAL '10 minutes'
                         OR study_room_presence.room_id <> EXCLUDED.room_id
                         THEN NOW()
                     ELSE study_room_presence.current_session_started_at
                 END,
                 last_heartbeat_at = NOW(),
                 is_active = true,
                 metadata = EXCLUDED.metadata,
                 updated_at = NOW()
             RETURNING user_id,
                       room_id,
                       avatar_style,
                       position_x,
                       position_y,
                       studied_seconds_today,
                       studied_seconds_total,
                       current_session_started_at,
                       last_heartbeat_at,
                       seat_id,
                       presence_mode,
                       break_zone_id,
                       equipped_outfit`,
            [
                req.user?.id,
                roomId,
                dayKey,
                avatarStyle,
                positionX,
                positionY,
                studiedSecondsDelta,
                seatId,
                presenceMode,
                breakZoneId,
                JSON.stringify(equippedOutfit),
                JSON.stringify({ source: 'mobile-gamification' }),
            ],
        );

        return sendSuccess(res, {
            participant: mapStudyParticipant({
                ...result.rows[0],
                display_name: 'RadioTEDU student',
                avatar_url: null,
            }),
            studied_seconds_delta: studiedSecondsDelta,
        }, 'Study heartbeat saved');
    } catch (error) {
        console.error('Study heartbeat error:', error);
        return sendError(res, 'Failed to save study heartbeat', 500);
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

    const clientIdempotencyKey = optionalIdempotencyKey(req);
    const idempotencyKey = clientIdempotencyKey ?? `legacy:${crypto.randomUUID()}`;
    const client = await db.pool.connect();
    let transactionOpen = false;
    try {
        await client.query('BEGIN');
        transactionOpen = true;
        await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [req.user!.id]);

        if (clientIdempotencyKey) {
            const replayResult = await client.query(
                `SELECT * FROM market_redemptions
                 WHERE user_id = $1 AND idempotency_key = $2
                 LIMIT 1`,
                [req.user!.id, clientIdempotencyKey],
            );
            const replay = replayResult.rows[0];
            if (replay) {
                if (String(replay.market_item_id) !== String(req.params.itemId)) {
                    await client.query('ROLLBACK');
                    transactionOpen = false;
                    return sendError(res, 'Idempotency-Key was already used for another item', 409);
                }
                const points = await client.query(
                    'SELECT spendable_points FROM user_points WHERE user_id = $1',
                    [req.user!.id],
                );
                await client.query('COMMIT');
                transactionOpen = false;
                return sendSuccess(res, {
                    redemption: replay,
                    spendable_points: toNumber(points.rows[0]?.spendable_points),
                }, 'Market item redeemed');
            }
        }

        const itemResult = await client.query(
            `SELECT id, title, cost_points, stock_quantity, is_active
             FROM market_items
             WHERE id = $1 AND is_active = true
             FOR UPDATE`,
            [req.params.itemId],
        );
        const item = itemResult.rows[0];
        if (!item) {
            await client.query('ROLLBACK');
            transactionOpen = false;
            return sendError(res, 'Market item not found', 404);
        }
        if (item.stock_quantity !== null && Number(item.stock_quantity) <= 0) {
            await client.query('ROLLBACK');
            transactionOpen = false;
            return sendError(res, 'Market item is out of stock', 409);
        }

        const costPoints = toNumber(item.cost_points);
        const spendablePoints = costPoints > 0
            ? (await spendUserPoints({
                userId: req.user!.id,
                amount: costPoints,
                category: 'market',
                sourceType: 'market_redemption',
                sourceId: String(item.id),
                idempotencyKey: `market:${idempotencyKey}`,
                metadata: { market_item_id: item.id, cost_points: costPoints },
            }, client)).spendablePoints
            : toNumber((await client.query(
                'SELECT spendable_points FROM user_points WHERE user_id = $1',
                [req.user!.id],
            )).rows[0]?.spendable_points);

        if (item.stock_quantity !== null) {
            const stockUpdate = await client.query(
                `UPDATE market_items
                 SET stock_quantity = stock_quantity - 1, updated_at = NOW()
                 WHERE id = $1 AND stock_quantity > 0`,
                [item.id],
            );
            if (stockUpdate.rowCount !== 1) throw new Error('MARKET_OUT_OF_STOCK');
        }
        const redemptionResult = await client.query(
            `INSERT INTO market_redemptions (user_id, market_item_id, cost_points, status, idempotency_key)
             VALUES ($1, $2, $3, 'pending', $4)
             RETURNING *`,
            [req.user!.id, item.id, costPoints, idempotencyKey],
        );
        await client.query('COMMIT');
        transactionOpen = false;
        return sendSuccess(
            res,
            {
                redemption: redemptionResult.rows[0],
                spendable_points: spendablePoints,
            },
            'Market item redeemed',
            undefined,
            201,
        );
    } catch (error: any) {
        if (transactionOpen) await client.query('ROLLBACK');
        if (error?.message === 'INSUFFICIENT_GOLD') return sendError(res, 'Not enough points', 400);
        if (error?.message === 'MARKET_OUT_OF_STOCK') return sendError(res, 'Market item is out of stock', 409);
        if (error?.message === 'GOLD_IDEMPOTENCY_PAYLOAD_MISMATCH') {
            return sendError(res, 'Idempotency-Key was already used for another item', 409);
        }
        console.error('Market redemption error:', error);
        return sendError(res, 'Failed to redeem market item', 500);
    } finally {
        client.release();
    }
}

export async function handleEventsRequest(req: AuthRequest, res: Response) {
    try {
        const result = await db.query(
            `SELECT ae.id, ae.title, ae.description, ae.starts_at, ae.ends_at, ae.location,
                    ae.image_url, ae.check_in_points, ae.metadata,
                    EXISTS (
                        SELECT 1 FROM event_registrations er
                        WHERE er.user_id = $1 AND er.event_id = ae.id AND er.status = 'registered'
                    ) AS registered
             FROM app_events ae
             WHERE ae.is_active = true
             ORDER BY ae.starts_at ASC NULLS LAST, ae.title ASC`,
            [req.user?.id],
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
             SELECT $1, ae.id, 'registered'
             FROM app_events ae
             WHERE ae.id = $2
               AND ae.is_active = true
               AND (ae.ends_at IS NULL OR ae.ends_at >= NOW())
             ON CONFLICT (user_id, event_id) DO UPDATE SET status = 'registered'
             RETURNING *`,
            [req.user?.id, req.params.eventId],
        );

        if (!result.rows[0]) {
            return sendError(res, 'Social event not found or no longer available.', 404, 'SOCIAL_EVENT_UNAVAILABLE');
        }

        return sendSuccess(res, { registration: result.rows[0] }, 'Social event registration saved', undefined, 201);
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

    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    if (!code || code.length > 240) {
        return sendError(res, 'QR code required', 400);
    }

    const client = await db.pool.connect();
    let transactionOpen = false;
    try {
        await client.query('BEGIN');
        transactionOpen = true;
        await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [req.user!.id]);
        const rewardResult = await client.query(
            `SELECT id, points
             FROM qr_rewards
             WHERE code = $1
               AND is_active = true
               AND (starts_at IS NULL OR starts_at <= NOW())
               AND (ends_at IS NULL OR ends_at >= NOW())
             LIMIT 1`,
            [code],
        );
        const reward = rewardResult.rows[0];

        if (!reward) {
            await client.query('ROLLBACK');
            transactionOpen = false;
            return sendError(res, 'QR reward not found', 404);
        }

        await client.query(
            `INSERT INTO qr_reward_claims (qr_reward_id, user_id, points_awarded)
             VALUES ($1, $2, $3)`,
            [reward.id, req.user!.id, reward.points],
        );
        await awardUserPoints({
            userId: req.user!.id,
            amount: toNumber(reward.points),
            category: 'events',
            sourceType: 'qr_reward',
            sourceId: String(reward.id),
            idempotencyKey: `qr-reward:${reward.id}`,
            metadata: { qr_reward_id: reward.id },
        }, client);

        await client.query('COMMIT');
        transactionOpen = false;
        return sendSuccess(res, { points_awarded: toNumber(reward.points) }, 'QR reward claimed', undefined, 201);
    } catch (error: any) {
        if (transactionOpen) await client.query('ROLLBACK');
        if (error?.code === '23505') {
            return sendError(res, 'QR reward already claimed', 409);
        }

        console.error('QR claim error:', error);
        return sendError(res, 'Failed to claim QR reward', 500);
    } finally {
        client.release();
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

export async function handleGameStartRequest(req: AuthRequest, res: Response) {
    if (!ensureRegisteredAccount(req, res)) return undefined;
    const clientRoundId = typeof req.body?.client_round_id === 'string'
        ? req.body.client_round_id.trim()
        : '';
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(clientRoundId)
        || req.body?.submission_source !== 'mobile_game') {
        return sendError(res, 'Invalid game session request', 400);
    }
    try {
        const gameResult = await db.query(
            `SELECT id, metadata FROM arcade_games WHERE id = $1 AND is_active = true`,
            [req.params.gameId],
        );
        const game = gameResult.rows[0];
        if (!game) return sendError(res, 'Game not found', 404);
        if (!isVerifiedMobileGame(game.metadata)) {
            return sendError(res, CLIENT_GAME_PRACTICE_ONLY_ERROR, 403);
        }

        const proof = issueGameSessionProof({
            userId: req.user!.id,
            gameId: game.id,
            clientRoundId,
        });
        return sendSuccess(res, proof, 'Verified game session started', undefined, 201);
    } catch (error) {
        console.error('Game session start error:', error);
        return sendError(res, 'Failed to start game session', 500);
    }
}

export async function handleGameScoreRequest(req: AuthRequest, res: Response) {
    if (!ensureRegisteredAccount(req, res)) {
        return undefined;
    }

    let claimedSessionId: string | null = null;
    let client: PoolClient | null = null;
    let transactionOpen = false;
    let discardClient = false;
    try {
        const gameResult = await db.query(
            `SELECT id, point_rate, daily_point_limit, metadata
             FROM arcade_games
             WHERE id = $1 AND is_active = true`,
            [req.params.gameId],
        );
        const game = gameResult.rows[0];
        if (!game) return sendError(res, 'Game not found', 404);
        if (!isVerifiedMobileGame(game.metadata)
            || req.body?.submission_source !== 'mobile_game') {
            return sendError(res, CLIENT_GAME_PRACTICE_ONLY_ERROR, 403);
        }

        const fingerprint = gameScoreFingerprint(req.user!.id, game.id, req.body);
        const score = req.body.score;
        client = await db.pool.connect();
        await client.query('BEGIN');
        transactionOpen = true;
        // Match economy's lock order. Serialize rounds and daily limits across processes.
        await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [req.user!.id]);
        const recovered = await client.query(
            `SELECT request_fingerprint, outcome FROM game_score_recoveries
             WHERE user_id = $1 AND client_round_id = $2`,
            [req.user!.id, req.body.client_round_id],
        );
        if (recovered.rows[0]) {
            if (recovered.rows[0].request_fingerprint !== fingerprint) {
                throw new GameSessionProofError('game_round_payload_mismatch', 409);
            }
            await client.query('COMMIT');
            transactionOpen = false;
            return sendSuccess(res, recovered.rows[0].outcome, 'Game score submitted', undefined, 201);
        }
        const claim = claimGameSessionProof({
            sessionId: req.body?.session_id,
            nonce: req.body?.nonce,
            userId: req.user!.id,
            gameId: game.id,
            clientRoundId: req.body?.client_round_id,
            playDurationMs: req.body?.play_duration_ms,
            score,
        });
        claimedSessionId = claim.sessionId;

        const dailyResult = await client.query(
            `SELECT COALESCE(SUM(points_awarded), 0) AS awarded_today
             FROM game_score_submissions
             WHERE user_id = $1 AND game_id = $2 AND submitted_at::date = $3::date`,
            [req.user!.id, game.id, getIstanbulDayKey()],
        );
        const dailyLimit = Math.max(0, Math.floor(toNumber(game.daily_point_limit)));
        const remainingDailyLimit = Math.max(0, dailyLimit - toNumber(dailyResult.rows[0]?.awarded_today));
        const scoreAward = getGameAwardedPoints({
            score,
            pointRate: toNumber(game.point_rate),
            dailyLimit,
        });
        const pointsAwarded = Math.min(
            remainingDailyLimit,
            score > 0 && dailyLimit > 0 ? Math.max(1, scoreAward) : 0,
        );
        const elapsedSeconds = Math.max(0, Math.floor((Date.now() - claim.startedAtMs) / 1_000));

        await client.query(
            `INSERT INTO game_score_submissions (
                game_id, user_id, score, points_awarded, client_round_id,
                reported_score, server_elapsed_seconds, verification_status
             ) VALUES ($1, $2, $3, $4, $5, $3, $6, 'client-timed-session')`,
            [game.id, req.user!.id, score, pointsAwarded, claim.clientRoundId, elapsedSeconds],
        );

        let spendablePoints: number | null = null;
        if (pointsAwarded > 0) {
            const gold = await awardUserPoints({
                userId: req.user!.id,
                amount: pointsAwarded,
                category: 'games',
                sourceType: 'arcade_game',
                sourceId: game.id,
                idempotencyKey: `mobile-game:${req.user!.id}:${claim.clientRoundId}`,
                metadata: {
                    score,
                    client_round_id: claim.clientRoundId,
                    verification: 'client-timed-session',
                },
            }, client);
            spendablePoints = gold.spendablePoints;
        }

        const outcome = {
            score,
            points_awarded: pointsAwarded,
            ...(spendablePoints === null ? {} : { spendable_points: spendablePoints }),
        };
        await client.query(
            `INSERT INTO game_score_recoveries
             (user_id, client_round_id, request_fingerprint, outcome) VALUES ($1, $2, $3, $4::jsonb)`,
            [req.user!.id, claim.clientRoundId, fingerprint, JSON.stringify(outcome)],
        );
        await client.query('COMMIT');
        transactionOpen = false;
        completeGameSessionProof(claim.sessionId);
        return sendSuccess(res, outcome, 'Game score submitted', undefined, 201);
    } catch (error: any) {
        if (transactionOpen && client) {
            // COMMIT may have succeeded even if its acknowledgement was lost. Never
            // infer an outcome here: the next attempt reads the durable row first.
            discardClient = true;
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                console.error('Game score rollback error:', rollbackError);
            }
        }
        if (claimedSessionId) releaseGameSessionProof(claimedSessionId);
        if (error instanceof GameSessionProofError) {
            return sendError(res, error.code, error.status);
        }
        if (error?.code === '23505') {
            return sendError(res, 'Game round already submitted', 409);
        }
        console.error('Game score error:', error);
        return sendError(res, 'Failed to submit game score', 500);
    } finally {
        client?.release(discardClient);
    }
}

export async function handleListeningHeartbeatRequest(req: AuthRequest, res: Response) {
    if (!ensureRegisteredAccount(req, res)) {
        return undefined;
    }

    // The former endpoint trusted a client-provided duration and was replayable.
    // Current clients use /economy/listening/start and its rotating nonce.
    return sendError(res, 'Verified listening session required; update the RadioTEDU client', 426);
}

router.use(webAuthMiddleware);
router.use(requireWebCsrf);
router.get('/me', handleCurrentGamificationRequest);
router.get('/home', handleGamificationHomeRequest);
router.get('/market', handleMarketRequest);
router.post('/market/:itemId/redeem', handleMarketRedemptionRequest);
router.get('/events', handleEventsRequest);
router.get('/events/my-tickets', handleMyTicketsRequest);
router.post('/events/:eventId/register', handleEventRegistrationRequest);
router.post('/events/qr/claim', handleQrClaimRequest);
router.get('/study-room', handleStudyRoomRequest);
router.post('/study-room/heartbeat', handleStudyHeartbeatRequest);
router.get('/games', handleGamesRequest);
router.use('/games/:gameId/start', gameScoreLimiter);
router.post('/games/:gameId/start', handleGameStartRequest);
router.use('/games/:gameId/score', gameScoreLimiter);
router.post('/games/:gameId/score', handleGameScoreRequest);
router.use('/social-arcade', socialArcadeLimiter);
router.post('/social-arcade/pool-dive/start', handlePoolDiveStart);
router.post('/social-arcade/pool-dive/sessions/:sessionId/action', handlePoolDiveAction);
router.post('/listening/heartbeat', handleListeningHeartbeatRequest);

export default router;
