import express, { Response } from 'express';
import crypto from 'crypto';
import { db } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { sendSuccess, sendError } from '../utils/response';
import { awardUserPoints } from '../services/gamification';

const router = express.Router();

const VALID_LOCATIONS = new Set(['library', 'chim-alan']);
const VALID_INTERACTIONS = new Set(['idle', 'walking', 'seated', 'spark', 'rock']);
const VALID_AVATAR_SLOTS = new Set(['hair', 'top', 'bottom', 'shoes', 'accessory']);
const VALID_SESSION_TYPES = new Set(['study', 'pomodoro']);
const DEFAULT_POMODORO_MINUTES = 25;
const ALLOWED_POMODORO_MINUTES = new Set([25, 50]);
const MIN_CUSTOM_POMODORO_MINUTES = 5;
const MAX_CUSTOM_POMODORO_MINUTES = 120;
const HEARTBEAT_MAX_SECONDS = 300;
const MIN_FINISH_SECONDS = 5 * 60;
const MIN_VALID_HEARTBEATS = 2;
const DAILY_STUDY_POINT_CAP = 25;

router.use(authMiddleware);

export function hashStudyNonce(nonce: string) {
  return crypto.createHash('sha256').update(nonce).digest('hex');
}

export async function handleStartStudySession(req: AuthRequest, res: Response) {
  if (!ensureRegisteredAccount(req, res)) {
    return undefined;
  }

  const location = normalizeLocation(req.body?.location);
  const clientSessionId = normalizeClientSessionId(req.body?.clientSessionId);
  const sessionType = normalizeSessionType(req.body?.sessionType ?? req.body?.session_type);
  const pomodoroTargetMinutes = sessionType === 'pomodoro'
    ? normalizePomodoroMinutes(req.body?.pomodoroTargetMinutes ?? req.body?.pomodoro_target_minutes)
    : null;
  if (!location || !clientSessionId) {
    return sendError(res, 'Invalid Study session payload', 400);
  }

  try {
    const nonce = createNonce();
    await db.query(
      `UPDATE study_sessions
       SET status = 'closed', finished_at = NOW(), updated_at = NOW()
       WHERE user_id = $1 AND status = 'active'`,
      [req.user!.id],
    );
    const result = await db.query(
      `INSERT INTO study_sessions (
          user_id, location, client_session_id, status, current_nonce_hash,
          session_type, pomodoro_target_minutes,
          started_at, last_heartbeat_at, valid_heartbeat_count, eligible_seconds,
          awarded_points, created_at, updated_at
       )
       VALUES ($1, $2, $3, 'active', $4, $5, $6, NOW(), NOW(), 0, 0, 0, NOW(), NOW())
       RETURNING id, location, status, session_type, pomodoro_target_minutes, started_at, last_heartbeat_at`,
      [req.user!.id, location, clientSessionId, hashStudyNonce(nonce), sessionType, pomodoroTargetMinutes],
    );

    return sendSuccess(res, { session: mapSession(result.rows[0]), nonce }, 'Study session started', undefined, 201);
  } catch (error) {
    console.error('Study session start error:', error);
    return sendError(res, 'Failed to start Study session', 500);
  }
}

export async function handleStudyHeartbeat(req: AuthRequest, res: Response) {
  if (!ensureRegisteredAccount(req, res)) {
    return undefined;
  }

  const nonce = typeof req.body?.nonce === 'string' ? req.body.nonce : '';
  const interaction = VALID_INTERACTIONS.has(req.body?.interaction) ? req.body.interaction : 'idle';
  const focused = req.body?.focused === true;
  const foreground = req.body?.foreground === true;
  const position = normalizePosition(req.body?.position);
  const seatId = normalizeSeatId(req.body?.seatId ?? req.body?.seat_id);

  try {
    const sessionResult = await db.query(
      `SELECT id, user_id, location, status, current_nonce_hash, last_heartbeat_at,
              valid_heartbeat_count, eligible_seconds
       FROM study_sessions
       WHERE id = $1 AND user_id = $2
       LIMIT 1`,
      [req.params.id, req.user!.id],
    );
    const session = sessionResult.rows[0];
    if (!session || session.status !== 'active') {
      return sendError(res, 'Active Study session not found', 404);
    }
    if (session.current_nonce_hash !== hashStudyNonce(nonce)) {
      return sendError(res, 'Invalid session nonce', 409);
    }

    const acceptedSeconds = focused && foreground ? secondsSince(session.last_heartbeat_at, HEARTBEAT_MAX_SECONDS) : 0;
    const nextNonce = createNonce();
    await db.query(
      `INSERT INTO study_session_events (
          session_id, event_type, server_received_at, position_x, position_y,
          seat_id, interaction, accepted, accepted_seconds
       )
       VALUES ($1, 'heartbeat', NOW(), $2, $3, $4, $5, $6, $7)`,
      [session.id, position.x, position.y, seatId, interaction, acceptedSeconds > 0, acceptedSeconds],
    );
    const updateResult = await db.query(
      `UPDATE study_sessions
       SET current_nonce_hash = $1,
           last_heartbeat_at = NOW(),
           valid_heartbeat_count = valid_heartbeat_count + CASE WHEN $2 > 0 THEN 1 ELSE 0 END,
           eligible_seconds = eligible_seconds + $2,
           updated_at = NOW()
       WHERE id = $3 AND user_id = $4 AND status = 'active'
       RETURNING id, location, status, started_at, last_heartbeat_at`,
      [hashStudyNonce(nextNonce), acceptedSeconds, session.id, req.user!.id],
    );

    return sendSuccess(
      res,
      { session: mapSession(updateResult.rows[0]), nonce: nextNonce, accepted_seconds: acceptedSeconds },
      'Study heartbeat accepted',
    );
  } catch (error) {
    console.error('Study heartbeat error:', error);
    return sendError(res, 'Failed to save Study heartbeat', 500);
  }
}

export async function handleFinishStudySession(req: AuthRequest, res: Response) {
  if (!ensureRegisteredAccount(req, res)) {
    return undefined;
  }

  const nonce = typeof req.body?.nonce === 'string' ? req.body.nonce : '';

  try {
    const sessionResult = await db.query(
      `SELECT id, user_id, location, status, current_nonce_hash,
              valid_heartbeat_count, eligible_seconds, awarded_points, session_type, pomodoro_target_minutes
       FROM study_sessions
       WHERE id = $1 AND user_id = $2
       LIMIT 1`,
      [req.params.id, req.user!.id],
    );
    const session = sessionResult.rows[0];
    if (!session) {
      return sendError(res, 'Study session not found', 404);
    }
    if (session.status === 'finished') {
      return sendSuccess(res, { session: mapSession(session), awarded_points: toNumber(session.awarded_points) }, 'Study session already finished');
    }
    if (session.current_nonce_hash !== hashStudyNonce(nonce)) {
      return sendError(res, 'Invalid session nonce', 409);
    }

    const dailyResult = await db.query(
      `SELECT COALESCE(SUM(amount), 0) AS awarded_today
       FROM points_ledger
       WHERE user_id = $1
         AND source_type IN ('study_session', 'pomodoro_session')
         AND created_at >= CURRENT_DATE`,
      [req.user!.id],
    );
    const remainingDailyPoints = Math.max(0, DAILY_STUDY_POINT_CAP - toNumber(dailyResult.rows[0]?.awarded_today));
    const rawAward = getStudyAwardPoints({
      eligibleSeconds: toNumber(session.eligible_seconds),
      validHeartbeatCount: toNumber(session.valid_heartbeat_count),
    });
    const pointsToAward = Math.min(rawAward, remainingDailyPoints);

    if (pointsToAward > 0) {
      await awardUserPoints({
        userId: req.user!.id,
        amount: pointsToAward,
        category: 'social',
        sourceType: session.session_type === 'pomodoro' ? 'pomodoro_session' : 'study_session',
        sourceId: session.id,
        metadata: {
          location: session.location,
          session_type: normalizeSessionType(session.session_type),
          pomodoro_target_minutes: session.pomodoro_target_minutes ?? null,
          eligible_seconds: toNumber(session.eligible_seconds),
          valid_heartbeat_count: toNumber(session.valid_heartbeat_count),
        },
      });
    }

    const updateResult = await db.query(
      `UPDATE study_sessions
       SET status = 'finished', finished_at = NOW(), awarded_points = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3 AND status = 'active'
       RETURNING id, location, status, session_type, pomodoro_target_minutes, finished_at, awarded_points`,
      [pointsToAward, session.id, req.user!.id],
    );

    return sendSuccess(
      res,
      { session: mapSession(updateResult.rows[0]), awarded_points: pointsToAward },
      'Study session finished',
    );
  } catch (error) {
    console.error('Study finish error:', error);
    return sendError(res, 'Failed to finish Study session', 500);
  }
}

export async function handleAvatarCatalog(_req: AuthRequest, res: Response) {
  try {
    const result = await db.query(
      `SELECT item_id, slot, title, cost_points, rarity, is_default, enabled
       FROM avatar_items
       WHERE enabled = true
       ORDER BY is_default DESC, cost_points ASC, title ASC`,
    );
    return sendSuccess(res, { items: result.rows.map(mapAvatarItem) }, 'Avatar catalog fetched');
  } catch (error) {
    console.error('Avatar catalog error:', error);
    return sendError(res, 'Failed to fetch avatar catalog', 500);
  }
}

export async function handleAvatarProfile(req: AuthRequest, res: Response) {
  try {
    const [inventory, equipment, points] = await Promise.all([
      db.query('SELECT item_id FROM avatar_inventory WHERE user_id = $1', [req.user!.id]),
      db.query('SELECT slot, item_id FROM avatar_equipment WHERE user_id = $1', [req.user!.id]),
      db.query(
        `SELECT lifetime_points, spendable_points, monthly_points, listening_points,
                events_points, games_points, social_points, jukebox_points
         FROM user_points
         WHERE user_id = $1`,
        [req.user!.id],
      ),
    ]);
    return sendSuccess(res, {
      ownedItemIds: inventory.rows.map((row: Record<string, unknown>) => row.item_id),
      equipped: equipment.rows.reduce<Record<string, unknown>>((acc, row: Record<string, unknown>) => {
        if (typeof row.slot === 'string') {
          acc[row.slot] = row.item_id;
        }
        return acc;
      }, {}),
      points: mapPoints(points.rows[0]),
    }, 'Avatar profile fetched');
  } catch (error) {
    console.error('Avatar profile error:', error);
    return sendError(res, 'Failed to fetch avatar profile', 500);
  }
}

export async function handleAvatarPurchase(req: AuthRequest, res: Response) {
  if (!ensureRegisteredAccount(req, res)) {
    return undefined;
  }
  const itemId = normalizeItemId(req.body?.itemId);
  if (!itemId) {
    return sendError(res, 'Invalid avatar item', 400);
  }

  try {
    await db.query('BEGIN');
    const itemResult = await db.query(
      `SELECT item_id, cost_points, is_default
       FROM avatar_items
       WHERE item_id = $1 AND enabled = true
       FOR UPDATE`,
      [itemId],
    );
    const item = itemResult.rows[0];
    if (!item) {
      await db.query('ROLLBACK');
      return sendError(res, 'Avatar item not found', 404);
    }
    const ownedResult = await db.query(
      `SELECT item_id
       FROM avatar_inventory
       WHERE user_id = $1 AND item_id = $2
       LIMIT 1`,
      [req.user!.id, itemId],
    );
    if (ownedResult.rows.length > 0) {
      await db.query('COMMIT');
      return sendSuccess(res, { ownedItemIds: [itemId] }, 'Avatar item already owned');
    }
    const pointsResult = await db.query(
      `SELECT lifetime_points, spendable_points, monthly_points, listening_points,
              events_points, games_points, social_points, jukebox_points
       FROM user_points WHERE user_id = $1 FOR UPDATE`,
      [req.user!.id],
    );
    const spendablePoints = toNumber(pointsResult.rows[0]?.spendable_points);
    const costPoints = toNumber(item.cost_points);
    if (!item.is_default && spendablePoints < costPoints) {
      await db.query('ROLLBACK');
      return sendError(res, 'Not enough points', 400);
    }
    await db.query(
      `INSERT INTO avatar_inventory (user_id, item_id, created_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id, item_id) DO NOTHING`,
      [req.user!.id, itemId],
    );
    if (!item.is_default && costPoints > 0) {
      await db.query(
        `UPDATE user_points
         SET spendable_points = spendable_points - $1, updated_at = NOW()
         WHERE user_id = $2`,
        [costPoints, req.user!.id],
      );
    }
    await db.query('COMMIT');
    return sendSuccess(
      res,
      {
        ownedItemIds: [itemId],
        points: mapPoints({
          ...pointsResult.rows[0],
          spendable_points: item.is_default ? spendablePoints : spendablePoints - costPoints,
        }),
      },
      'Avatar item purchased',
      undefined,
      201,
    );
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Avatar purchase error:', error);
    return sendError(res, 'Failed to purchase avatar item', 500);
  }
}

export async function handleAvatarEquip(req: AuthRequest, res: Response) {
  if (!ensureRegisteredAccount(req, res)) {
    return undefined;
  }
  const slot = typeof req.body?.slot === 'string' && VALID_AVATAR_SLOTS.has(req.body.slot) ? req.body.slot : null;
  const itemId = normalizeItemId(req.body?.itemId);
  if (!slot || !itemId) {
    return sendError(res, 'Invalid avatar equipment payload', 400);
  }

  try {
    const result = await db.query(
      `SELECT i.item_id
       FROM avatar_items i
       LEFT JOIN avatar_inventory owned ON owned.item_id = i.item_id AND owned.user_id = $2
       WHERE i.item_id = $1
         AND i.slot = $3
         AND i.enabled = true
         AND (i.is_default = true OR owned.item_id IS NOT NULL)
       LIMIT 1`,
      [itemId, req.user!.id, slot],
    );
    if (result.rows.length === 0) {
      return sendError(res, 'Avatar item is not owned', 403);
    }
    await db.query(
      `INSERT INTO avatar_equipment (user_id, slot, item_id, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, slot) DO UPDATE SET item_id = EXCLUDED.item_id, updated_at = NOW()`,
      [req.user!.id, slot, itemId],
    );
    return sendSuccess(res, { equipped: { [slot]: itemId } }, 'Avatar item equipped');
  } catch (error) {
    console.error('Avatar equip error:', error);
    return sendError(res, 'Failed to equip avatar item', 500);
  }
}

function ensureRegisteredAccount(req: AuthRequest, res: Response) {
  if (!req.user?.id || req.user.role === 'guest') {
    sendError(res, 'Registered account required', 403);
    return false;
  }
  return true;
}

function createNonce() {
  return crypto.randomBytes(24).toString('base64url');
}

function normalizeLocation(value: unknown) {
  return typeof value === 'string' && VALID_LOCATIONS.has(value) ? value : null;
}

function normalizeClientSessionId(value: unknown) {
  return typeof value === 'string' && /^[a-zA-Z0-9:_-]{6,128}$/.test(value) ? value : null;
}

function normalizeSessionType(value: unknown) {
  return typeof value === 'string' && VALID_SESSION_TYPES.has(value) ? value : 'study';
}

function normalizePomodoroMinutes(value: unknown) {
  const raw = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(raw)) {
    return DEFAULT_POMODORO_MINUTES;
  }
  const minutes = Math.floor(raw);
  if (ALLOWED_POMODORO_MINUTES.has(minutes)) {
    return minutes;
  }
  return Math.max(MIN_CUSTOM_POMODORO_MINUTES, Math.min(MAX_CUSTOM_POMODORO_MINUTES, minutes));
}

function normalizeItemId(value: unknown) {
  return typeof value === 'string' && /^[a-zA-Z0-9:_-]{1,80}$/.test(value) ? value : null;
}

function normalizeSeatId(value: unknown) {
  return typeof value === 'string' && /^[a-zA-Z0-9:_-]{1,120}$/.test(value) ? value : null;
}

function normalizePosition(value: unknown) {
  const maybePosition = value as Record<string, unknown> | undefined;
  return {
    x: clampTile(toNumber(maybePosition?.x)),
    y: clampTile(toNumber(maybePosition?.y)),
  };
}

function clampTile(value: number) {
  return Math.max(0, Math.min(99, Math.floor(value)));
}

function secondsSince(value: unknown, cap: number) {
  const date = value instanceof Date ? value : new Date(String(value));
  const elapsed = Number.isFinite(date.getTime()) ? Math.floor((Date.now() - date.getTime()) / 1000) : 0;
  return Math.max(0, Math.min(cap, elapsed));
}

function getStudyAwardPoints(params: { eligibleSeconds: number; validHeartbeatCount: number }) {
  if (params.eligibleSeconds < MIN_FINISH_SECONDS || params.validHeartbeatCount < MIN_VALID_HEARTBEATS) {
    return 0;
  }
  return Math.max(0, Math.floor(params.eligibleSeconds / 60));
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mapSession(row: Record<string, unknown> = {}) {
  return {
    id: row.id,
    location: row.location,
    status: row.status,
    session_type: normalizeSessionType(row.session_type),
    pomodoro_target_minutes: row.pomodoro_target_minutes ?? null,
    started_at: row.started_at,
    last_heartbeat_at: row.last_heartbeat_at,
    finished_at: row.finished_at ?? null,
  };
}

function mapAvatarItem(row: Record<string, unknown>) {
  return {
    itemId: row.item_id,
    slot: row.slot,
    title: row.title,
    costPoints: toNumber(row.cost_points),
    rarity: row.rarity,
    isDefault: row.is_default === true,
    enabled: row.enabled !== false,
  };
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

router.post('/sessions/start', handleStartStudySession);
router.post('/sessions/:id/heartbeat', handleStudyHeartbeat);
router.post('/sessions/:id/finish', handleFinishStudySession);
router.get('/avatar/catalog', handleAvatarCatalog);
router.get('/avatar/me', handleAvatarProfile);
router.post('/avatar/purchase', handleAvatarPurchase);
router.post('/avatar/equip', handleAvatarEquip);

export default router;
