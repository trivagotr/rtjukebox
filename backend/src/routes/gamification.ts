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
router.get('/study-room', handleStudyRoomRequest);
router.post('/study-room/heartbeat', handleStudyHeartbeatRequest);
router.get('/games', handleGamesRequest);
router.post('/games/:gameId/score', handleGameScoreRequest);
router.post('/listening/heartbeat', handleListeningHeartbeatRequest);

export default router;
