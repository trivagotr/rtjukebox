import express, { Response } from 'express';
import crypto from 'crypto';
import { db } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { sendSuccess, sendError } from '../utils/response';
import { awardUserPoints, spendUserPoints } from '../services/gamification';
import {
  parseStudyRoomInstanceId,
  selectStudyRoomInstance,
  STUDY_ROOM_CAPACITIES,
  type StudyPhysicalRoomId,
} from '../services/studyRoomInstances';

const router = express.Router();

const VALID_LOCATIONS = new Set(['library', 'chim-alan']);
const VALID_INTERACTIONS = new Set(['idle', 'walking', 'seated', 'spark', 'rock']);
const VALID_AVATAR_SLOTS = new Set(['hair', 'top', 'bottom', 'shoes', 'hat', 'accessory']);
const VALID_SESSION_TYPES = new Set(['study', 'pomodoro']);
const DEFAULT_POMODORO_MINUTES = 25;
const ALLOWED_POMODORO_MINUTES = new Set([25, 50]);
const MIN_CUSTOM_POMODORO_MINUTES = 5;
const MAX_CUSTOM_POMODORO_MINUTES = 120;
const HEARTBEAT_MAX_SECONDS = 300;
const MIN_FINISH_SECONDS = 5 * 60;
const MIN_VALID_HEARTBEATS = 2;
const DAILY_STUDY_POINT_CAP = 25;
const PRESENCE_TTL_SECONDS = 35;
const CHAT_WINDOW_SECONDS = 10;
const CHAT_WINDOW_LIMIT = 5;

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

    const acceptedSeconds = focused && foreground && interaction === 'seated' && seatId
      ? secondsSince(session.last_heartbeat_at, HEARTBEAT_MAX_SECONDS)
      : 0;
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
      const pointsResult = await db.query(
        'SELECT spendable_points FROM user_points WHERE user_id = $1',
        [req.user!.id],
      );
      return sendSuccess(
        res,
        {
          session: mapSession(session),
          awarded_points: toNumber(session.awarded_points),
          spendable_points: toNumber(pointsResult.rows[0]?.spendable_points),
        },
        'Study session already finished',
      );
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

    let spendablePoints = 0;
    if (pointsToAward > 0) {
      const awardResult = await awardUserPoints({
        userId: req.user!.id,
        amount: pointsToAward,
        category: 'social',
        sourceType: session.session_type === 'pomodoro' ? 'pomodoro_session' : 'study_session',
        sourceId: session.id,
        idempotencyKey: `study:finish:${session.id}`,
        metadata: {
          location: session.location,
          session_type: normalizeSessionType(session.session_type),
          pomodoro_target_minutes: session.pomodoro_target_minutes ?? null,
          eligible_seconds: toNumber(session.eligible_seconds),
          valid_heartbeat_count: toNumber(session.valid_heartbeat_count),
        },
      });
      spendablePoints = awardResult.spendablePoints;
    } else {
      const pointsResult = await db.query(
        'SELECT spendable_points FROM user_points WHERE user_id = $1',
        [req.user!.id],
      );
      spendablePoints = toNumber(pointsResult.rows[0]?.spendable_points);
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
      {
        session: mapSession(updateResult.rows[0]),
        awarded_points: pointsToAward,
        spendable_points: spendablePoints,
      },
      'Study session finished',
    );
  } catch (error) {
    console.error('Study finish error:', error);
    return sendError(res, 'Failed to finish Study session', 500);
  }
}

export async function handleStudySummary(req: AuthRequest, res: Response) {
  if (!ensureRegisteredAccount(req, res)) {
    return undefined;
  }

  try {
    const result = await db.query(
      `SELECT
         COALESCE(SUM(eligible_seconds) FILTER (
           WHERE started_at >= date_trunc('day', timezone('Europe/Istanbul', NOW()))
         ), 0) AS today_seconds,
         COALESCE(SUM(eligible_seconds) FILTER (
           WHERE started_at >= date_trunc('month', timezone('Europe/Istanbul', NOW()))
         ), 0) AS month_seconds,
         COALESCE(SUM(eligible_seconds), 0) AS total_seconds
       FROM study_sessions
       WHERE user_id = $1
         AND status IN ('active', 'finished', 'closed')`,
      [req.user!.id],
    );
    const row = result.rows[0] ?? {};
    return sendSuccess(res, {
      todaySeconds: toNumber(row.today_seconds),
      monthSeconds: toNumber(row.month_seconds),
      totalSeconds: toNumber(row.total_seconds),
    }, 'Study summary fetched');
  } catch (error) {
    console.error('Study summary error:', error);
    return sendError(res, 'Failed to fetch Study summary', 500);
  }
}

export async function handleStudyInstanceJoin(req: AuthRequest, res: Response) {
  if (!ensureRegisteredAccount(req, res)) {
    return undefined;
  }
  const roomId = normalizeLocation(req.body?.roomId ?? req.body?.room_id) as StudyPhysicalRoomId | null;
  const nodeId = normalizeNodeId(req.body?.nodeId ?? req.body?.node_id);
  const clientSessionId = normalizeClientSessionId(req.body?.clientSessionId ?? req.body?.client_session_id);
  const preferredValue = req.body?.preferredInstanceId ?? req.body?.preferred_instance_id;
  const preferredInstanceId = preferredValue === null || preferredValue === undefined || preferredValue === ''
    ? null
    : typeof preferredValue === 'string' ? preferredValue : null;
  const position = normalizeStudyRoomPosition(req.body?.position);
  if (!roomId || !nodeId || !clientSessionId || !position) {
    return sendError(res, 'Invalid Study room instance payload', 400);
  }
  if (preferredInstanceId && !parseStudyRoomInstanceId(preferredInstanceId, roomId)) {
    return sendError(res, 'Invalid Study room instance', 400);
  }

  const client = await db.pool.connect();
  let transactionStarted = false;
  try {
    await client.query('BEGIN');
    transactionStarted = true;
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext($1::text)) AS locked`,
      [`study-instance:${roomId}`],
    );
    const stickyResult = await client.query(
      `SELECT instance_id
       FROM study_room_presence
       WHERE user_id = $1
         AND room_id = $2
         AND client_session_id = $3
         AND is_active = true
         AND last_heartbeat_at >= NOW() - ($4 * INTERVAL '1 second')
       FOR UPDATE`,
      [req.user!.id, roomId, clientSessionId, PRESENCE_TTL_SECONDS],
    );
    const occupancyResult = await client.query(
      `SELECT instance_id, COUNT(*)::integer AS occupancy
       FROM study_room_presence
       WHERE room_id = $1
         AND instance_id IS NOT NULL
         AND is_active = true
         AND last_heartbeat_at >= NOW() - ($2 * INTERVAL '1 second')
       GROUP BY instance_id
       ORDER BY instance_id`,
      [roomId, PRESENCE_TTL_SECONDS],
    );
    const stickyInstanceId = typeof stickyResult.rows[0]?.instance_id === 'string'
      && parseStudyRoomInstanceId(stickyResult.rows[0].instance_id, roomId)
      ? stickyResult.rows[0].instance_id as string
      : null;
    const occupancies = occupancyResult.rows.map((row: Record<string, unknown>) => ({
      instanceId: String(row.instance_id),
      occupancy: toNumber(row.occupancy),
    }));
    const stickyParsed = stickyInstanceId ? parseStudyRoomInstanceId(stickyInstanceId, roomId) : null;
    const selected = stickyInstanceId && stickyParsed
      ? {
          id: stickyInstanceId,
          roomId,
          number: stickyParsed.number,
          occupancy: occupancies.find((row) => row.instanceId === stickyInstanceId)?.occupancy ?? 1,
          capacity: STUDY_ROOM_CAPACITIES[roomId],
          preferredInstanceFull: false,
        }
      : selectStudyRoomInstance(roomId, occupancies, preferredInstanceId);

    await client.query(
      `INSERT INTO study_room_presence (
         user_id, room_id, instance_id, client_session_id, day_key,
         node_id, position_x, position_y, presence_mode, is_active,
         current_session_started_at, last_heartbeat_at, updated_at
       )
       VALUES (
         $1, $2, $3, $4, to_char(timezone('Europe/Istanbul', NOW()), 'YYYY-MM-DD'),
         $5, $6, $7, 'studying', true, NOW(), NOW(), NOW()
       )
       ON CONFLICT (user_id) DO UPDATE SET
         room_id = EXCLUDED.room_id,
         instance_id = EXCLUDED.instance_id,
         client_session_id = EXCLUDED.client_session_id,
         day_key = EXCLUDED.day_key,
         node_id = EXCLUDED.node_id,
         position_x = EXCLUDED.position_x,
         position_y = EXCLUDED.position_y,
         seat_id = NULL,
         presence_mode = 'studying',
         is_active = true,
         current_session_started_at = CASE
           WHEN study_room_presence.instance_id IS DISTINCT FROM EXCLUDED.instance_id THEN NOW()
           ELSE study_room_presence.current_session_started_at
         END,
         last_heartbeat_at = NOW(),
         updated_at = NOW()
       RETURNING instance_id`,
      [
        req.user!.id, roomId, selected.id, clientSessionId,
        nodeId, position.x, position.y,
      ],
    );
    await client.query('COMMIT');
    transactionStarted = false;

    return sendSuccess(res, {
      instance: {
        ...selected,
        occupancy: stickyInstanceId ? Math.max(1, selected.occupancy) : selected.occupancy + 1,
      },
    }, 'Study room instance assigned');
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK');
    console.error('Study room instance join error:', error);
    return sendError(res, 'Failed to join Study room instance', 500);
  } finally {
    client.release();
  }
}

export async function handleStudyPresence(req: AuthRequest, res: Response) {
  if (!ensureRegisteredAccount(req, res)) {
    return undefined;
  }
  const roomId = normalizeLocation(req.query?.roomId) as StudyPhysicalRoomId | null;
  const instanceId = typeof req.query?.instanceId === 'string' ? req.query.instanceId : null;
  if (!roomId || !instanceId || !parseStudyRoomInstanceId(instanceId, roomId)) {
    return sendError(res, 'Invalid Study room instance', 400);
  }

  try {
    const result = await db.query(
      `SELECT p.user_id, p.room_id, p.node_id, p.position_x, p.position_y,
              p.seat_id, p.presence_mode, p.last_heartbeat_at, u.display_name,
              COALESCE((
                SELECT jsonb_object_agg(e.slot, e.item_id)
                FROM avatar_equipment e
                WHERE e.user_id = p.user_id
              ), '{}'::jsonb) AS equipped
       FROM study_room_presence p
       JOIN users u ON u.id = p.user_id
       WHERE p.room_id = $1
         AND p.instance_id = $2
         AND p.is_active = true
         AND p.last_heartbeat_at >= NOW() - ($3 * INTERVAL '1 second')
       ORDER BY p.last_heartbeat_at DESC
       LIMIT 80`,
      [roomId, instanceId, PRESENCE_TTL_SECONDS],
    );
    return sendSuccess(res, { presence: result.rows.map(mapPresence) }, 'Study presence fetched');
  } catch (error) {
    console.error('Study presence error:', error);
    return sendError(res, 'Failed to fetch Study presence', 500);
  }
}

export async function handleStudyPresenceHeartbeat(req: AuthRequest, res: Response) {
  if (!ensureRegisteredAccount(req, res)) {
    return undefined;
  }
  const roomId = normalizeLocation(req.body?.roomId ?? req.body?.room_id) as StudyPhysicalRoomId | null;
  const instanceId = typeof (req.body?.instanceId ?? req.body?.instance_id) === 'string'
    ? req.body.instanceId ?? req.body.instance_id
    : null;
  const clientSessionId = normalizeClientSessionId(req.body?.clientSessionId ?? req.body?.client_session_id);
  const nodeId = normalizeNodeId(req.body?.nodeId ?? req.body?.node_id);
  const rawSeatId = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'seatId')
    ? req.body?.seatId
    : req.body?.seat_id;
  const seatId = rawSeatId === null || rawSeatId === undefined ? null : normalizeSeatId(rawSeatId);
  const position = normalizePosition(req.body?.position);
  if (
    !roomId || !instanceId || !parseStudyRoomInstanceId(instanceId, roomId)
    || !clientSessionId || !nodeId
    || (rawSeatId !== null && rawSeatId !== undefined && !seatId)
  ) {
    return sendError(res, 'Invalid Study presence payload', 400);
  }

  try {
    const result = await db.query(
      `UPDATE study_room_presence
       SET day_key = to_char(timezone('Europe/Istanbul', NOW()), 'YYYY-MM-DD'),
           node_id = $5,
           position_x = $6,
           position_y = $7,
           seat_id = $8,
           presence_mode = 'studying',
           is_active = true,
           last_heartbeat_at = NOW(),
           updated_at = NOW()
       WHERE user_id = $1
         AND room_id = $2
         AND instance_id = $3
         AND client_session_id = $4
         AND is_active = true
         AND last_heartbeat_at >= NOW() - INTERVAL '${PRESENCE_TTL_SECONDS} seconds'
       RETURNING user_id, room_id, node_id, position_x, position_y,
                  instance_id, seat_id, presence_mode, last_heartbeat_at`,
      [
        req.user!.id, roomId, instanceId, clientSessionId,
        nodeId, position.x, position.y, seatId,
      ],
    );
    if (!result.rows[0]) {
      return sendError(res, 'Study room instance rejoin required', 409);
    }
    return sendSuccess(res, { presence: mapPresence(result.rows[0]) }, 'Study presence updated');
  } catch (error) {
    console.error('Study presence heartbeat error:', error);
    return sendError(res, 'Failed to update Study presence', 500);
  }
}

export async function handleStudyChat(req: AuthRequest, res: Response) {
  if (!ensureRegisteredAccount(req, res)) {
    return undefined;
  }
  const roomId = normalizeLocation(req.query?.roomId) as StudyPhysicalRoomId | null;
  const instanceId = typeof req.query?.instanceId === 'string' ? req.query.instanceId : null;
  if (!roomId || !instanceId || !parseStudyRoomInstanceId(instanceId, roomId)) {
    return sendError(res, 'Invalid Study room instance', 400);
  }

  try {
    const result = await db.query(
      `SELECT * FROM (
         SELECT m.id, m.user_id, u.display_name, m.room_id, m.instance_id,
                m.message_text, m.created_at
         FROM study_chat_messages m
         JOIN users u ON u.id = m.user_id
         WHERE m.room_id = $1
           AND m.instance_id = $2
         ORDER BY m.created_at DESC
         LIMIT 50
       ) recent
       ORDER BY created_at ASC`,
      [roomId, instanceId],
    );
    return sendSuccess(res, { messages: result.rows.map(mapChatMessage) }, 'Study messages fetched');
  } catch (error) {
    console.error('Study chat fetch error:', error);
    return sendError(res, 'Failed to fetch Study messages', 500);
  }
}

export async function handleStudyChatSend(req: AuthRequest, res: Response) {
  if (!ensureRegisteredAccount(req, res)) {
    return undefined;
  }
  const roomId = normalizeLocation(req.body?.roomId ?? req.body?.room_id) as StudyPhysicalRoomId | null;
  const instanceId = typeof (req.body?.instanceId ?? req.body?.instance_id) === 'string'
    ? req.body.instanceId ?? req.body.instance_id
    : null;
  const text = normalizeChatText(req.body?.text);
  if (!roomId || !instanceId || !parseStudyRoomInstanceId(instanceId, roomId) || !text) {
    return sendError(res, 'Invalid Study message', 400);
  }

  try {
    const result = await db.query(
      `WITH locked_user AS (
         SELECT pg_try_advisory_xact_lock(hashtext($2::text)) AS acquired
       ), recent AS (
         SELECT locked_user.acquired, COUNT(messages.id) AS recent_count
         FROM locked_user
         LEFT JOIN study_chat_messages messages
           ON locked_user.acquired
          AND messages.user_id = $2
           AND messages.created_at >= NOW() - ($5 * INTERVAL '1 second')
         GROUP BY locked_user.acquired
       ), inserted AS (
         INSERT INTO study_chat_messages (room_id, instance_id, user_id, message_text, created_at)
         SELECT $1, $3, $2, $4, NOW()
         FROM recent
         WHERE acquired AND recent_count < $6
           AND EXISTS (
             SELECT 1
             FROM study_room_presence presence
             WHERE presence.user_id = $2
               AND presence.room_id = $1
               AND presence.instance_id = $3
               AND presence.is_active = true
               AND presence.last_heartbeat_at >= NOW() - INTERVAL '${PRESENCE_TTL_SECONDS} seconds'
           )
         RETURNING id, user_id, room_id, instance_id, message_text, created_at
       )
       SELECT i.id, i.user_id, u.display_name, i.room_id, i.instance_id,
              i.message_text, i.created_at
       FROM inserted i
       JOIN users u ON u.id = i.user_id`,
      [roomId, req.user!.id, instanceId, text, CHAT_WINDOW_SECONDS, CHAT_WINDOW_LIMIT],
    );
    if (!result.rows[0]) {
      return sendError(res, 'Study chat rate limit exceeded', 429);
    }
    return sendSuccess(res, { message: mapChatMessage(result.rows[0]) }, 'Study message sent', undefined, 201);
  } catch (error) {
    console.error('Study chat send error:', error);
    return sendError(res, 'Failed to send Study message', 500);
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
      db.query(
        `SELECT item_id FROM avatar_inventory WHERE user_id = $1
         UNION
         SELECT item_id FROM avatar_items WHERE is_default = true AND enabled = true`,
        [req.user!.id],
      ),
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
  const idempotencyKey = typeof req.body?.idempotencyKey === 'string'
    ? req.body.idempotencyKey.trim().slice(0, 180)
    : '';
  if (!idempotencyKey) {
    return sendError(res, 'idempotencyKey required', 400);
  }

  const client = await db.pool.connect();
  let transactionOpen = false;
  try {
    await client.query('BEGIN');
    transactionOpen = true;
    const itemResult = await client.query(
      `SELECT item_id, cost_points, is_default
       FROM avatar_items
       WHERE item_id = $1 AND enabled = true
       FOR UPDATE`,
      [itemId],
    );
    const item = itemResult.rows[0];
    if (!item) {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return sendError(res, 'Avatar item not found', 404);
    }
    const ownedResult = await client.query(
      `SELECT item_id
       FROM avatar_inventory
       WHERE user_id = $1 AND item_id = $2
       LIMIT 1`,
      [req.user!.id, itemId],
    );
    if (ownedResult.rows.length > 0) {
      const pointsResult = await client.query(
        'SELECT spendable_points FROM user_points WHERE user_id = $1',
        [req.user!.id],
      );
      const spendablePoints = toNumber(pointsResult.rows[0]?.spendable_points);
      await client.query('COMMIT');
      transactionOpen = false;
      return sendSuccess(
        res,
        { ownedItemIds: [itemId], spendable_points: spendablePoints, replayed: true },
        'Avatar item already owned',
      );
    }

    const costPoints = toNumber(item.cost_points);
    let spendablePoints: number;
    if (!item.is_default && costPoints > 0) {
      const spendResult = await spendUserPoints({
        userId: req.user!.id,
        amount: costPoints,
        category: 'market',
        sourceType: 'avatar_purchase',
        sourceId: itemId,
        idempotencyKey,
        metadata: {
          avatar_item_id: itemId,
          cost_points: costPoints,
        },
      }, client);
      spendablePoints = spendResult.spendablePoints;
    } else {
      const pointsResult = await client.query(
        'SELECT spendable_points FROM user_points WHERE user_id = $1',
        [req.user!.id],
      );
      spendablePoints = toNumber(pointsResult.rows[0]?.spendable_points);
    }

    await client.query(
      `INSERT INTO avatar_inventory (user_id, item_id, created_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id, item_id) DO NOTHING
       RETURNING item_id`,
      [req.user!.id, itemId],
    );
    await client.query('COMMIT');
    transactionOpen = false;
    return sendSuccess(
      res,
      {
        ownedItemIds: [itemId],
        points: mapPoints({spendable_points: spendablePoints}),
        spendable_points: spendablePoints,
        replayed: false,
      },
      'Avatar item purchased',
      undefined,
      201,
    );
  } catch (error: any) {
    if (transactionOpen) {
      await client.query('ROLLBACK');
    }
    if (error?.message === 'INSUFFICIENT_GOLD') {
      return sendError(res, 'Not enough points', 400);
    }
    console.error('Avatar purchase error:', error);
    return sendError(res, 'Failed to purchase avatar item', 500);
  } finally {
    client.release();
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

function normalizeNodeId(value: unknown) {
  return typeof value === 'string' && /^[a-zA-Z0-9:_-]{1,120}$/.test(value) ? value : null;
}

function normalizeChatText(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized.length > 0 && normalized.length <= 180 ? normalized : null;
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

function normalizeStudyRoomPosition(value: unknown) {
  const maybePosition = value as Record<string, unknown> | undefined;
  const x = toNumber(maybePosition?.x, Number.NaN);
  const y = toNumber(maybePosition?.y, Number.NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    x: Math.max(0, Math.min(10_000, x)),
    y: Math.max(0, Math.min(10_000, y)),
  };
}

function mapPresence(row: Record<string, unknown> = {}) {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    roomId: row.room_id,
    instanceId: row.instance_id,
    nodeId: row.node_id,
    position: { x: toNumber(row.position_x), y: toNumber(row.position_y) },
    seatId: row.seat_id ?? null,
    mode: row.presence_mode ?? 'studying',
    equipped: row.equipped ?? {},
    lastHeartbeatAt: row.last_heartbeat_at,
  };
}

function mapChatMessage(row: Record<string, unknown> = {}) {
  return {
    id: row.id,
    userId: row.user_id,
    displayName: row.display_name,
    roomId: row.room_id,
    instanceId: row.instance_id,
    text: row.message_text,
    createdAt: row.created_at,
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
router.get('/summary', handleStudySummary);
router.post('/instances/join', handleStudyInstanceJoin);
router.get('/presence', handleStudyPresence);
router.post('/presence/heartbeat', handleStudyPresenceHeartbeat);
router.get('/chat', handleStudyChat);
router.post('/chat', handleStudyChatSend);
router.get('/avatar/catalog', handleAvatarCatalog);
router.get('/avatar/me', handleAvatarProfile);
router.post('/avatar/purchase', handleAvatarPurchase);
router.post('/avatar/equip', handleAvatarEquip);

export default router;
