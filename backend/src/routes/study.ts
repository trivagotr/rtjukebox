import express, { Response } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { db } from '../db';
import { AuthRequest } from '../middleware/auth';
import { requireWebCsrf, webAuthMiddleware } from '../services/webSession';
import { enforceStudyAccess } from '../services/studyModerationAccess';
import { evaluateStudyChatText } from '../services/studyChatSafety';
import { sendSuccess, sendError } from '../utils/response';
import { rateLimitClientIpKey } from '../utils/networkAddress';
import { awardUserPoints, spendUserPoints } from '../services/gamification';
import { getEconomyRule } from '../services/economy';
import {
  parseStudyRoomInstanceId,
  selectStudyRoomInstance,
  STUDY_ROOM_CAPACITIES,
  type StudyPhysicalRoomId,
} from '../services/studyRoomInstances';

const router = express.Router();

const VALID_LOCATIONS = new Set(['library', 'chim-alan', 'grass-amphitheatre', 'sports-center', 'auditorium', 'learning-lab', 'sca-office']);
const STUDY_ROOM_IDS: readonly StudyPhysicalRoomId[] = Object.freeze([
  'library', 'chim-alan', 'grass-amphitheatre', 'sports-center', 'auditorium', 'learning-lab', 'sca-office',
]);
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
const PRESENCE_TTL_SECONDS = 35;
const CHAT_WINDOW_SECONDS = 10;
const CHAT_WINDOW_LIMIT = 5;
const CHAT_DUPLICATE_WINDOW_SECONDS = 3;
const STUDY_PLAYER_RATE_LIMIT_PER_MINUTE = positiveInteger(
  process.env.STUDY_PLAYER_RATE_LIMIT_PER_MINUTE,
  240,
);

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

interface PresenceCacheEntry {
  payload: { presence: ReturnType<typeof mapPresence>[] };
  expiresAt: number;
}

interface ChatCacheEntry {
  payload: { messages: ReturnType<typeof mapChatMessage>[] };
  expiresAt: number;
}

const presenceCache = new Map<string, PresenceCacheEntry>();
const presenceLoads = new Map<string, Promise<PresenceCacheEntry['payload']>>();
const chatCache = new Map<string, ChatCacheEntry>();
const PRESENCE_CACHE_TTL_MS = 500;
const CHAT_CACHE_TTL_MS = 1_000;

export function invalidateStudyPresenceCache(roomId?: string | null, instanceId?: string | null): void {
  if (roomId && instanceId) {
    presenceCache.delete(`${roomId}:${instanceId}`);
    presenceLoads.delete(`${roomId}:${instanceId}`);
  } else {
    presenceCache.clear();
    presenceLoads.clear();
  }
}

export function invalidateStudyChatCache(roomId?: string | null, instanceId?: string | null): void {
  if (roomId && instanceId) {
    chatCache.delete(`${roomId}:${instanceId}`);
  } else {
    chatCache.clear();
  }
}
const VALID_STUDY_SEATS: Readonly<Record<StudyPhysicalRoomId, ReadonlySet<string>>> = Object.freeze({
  library: new Set([
    'front-left', 'front-desk', 'front-right', 'lamp-left', 'lamp-desk', 'lamp-right',
    'middle-left', 'middle-row', 'middle-right', 'lower-left', 'lower-row', 'lower-right',
    'upper-back-left', 'upper-back-mid', 'upper-back-right', 'upper-near-left', 'upper-near-mid',
    'upper-near-right', 'middle-back-left', 'middle-back-mid-left', 'middle-back-mid-right',
    'middle-back-right', 'middle-front-left-edge', 'middle-front-left', 'middle-front-mid',
    'middle-front-right', 'middle-front-far-right', 'left-lower-back-left', 'left-lower-back-mid',
    'left-lower-back-right', 'left-lower-front-left', 'left-lower-front-mid', 'left-lower-front-right',
    'left-edge-back', 'left-edge-front', 'right-mid-back-left', 'right-mid-back-mid',
    'right-mid-back-right', 'right-mid-front-left', 'right-mid-front-mid', 'right-mid-front-right',
    'bottom-back-left', 'bottom-back-mid-left', 'bottom-back-mid-right', 'bottom-back-right',
    'bottom-front-left', 'bottom-front-mid-left', 'bottom-front-mid-right', 'bottom-front-right',
    'far-left-partial-back', 'far-left-partial-front',
  ]),
  'chim-alan': new Set(['courtyard-bench-west', 'courtyard-bench-cafe', 'courtyard-bench-rear']),
  'grass-amphitheatre': new Set(['amfi-a1', 'amfi-a2', 'amfi-a3', 'amfi-b1', 'amfi-b2', 'amfi-b3', 'amfi-c1', 'amfi-c2', 'amfi-c3']),
  'sports-center': new Set<string>(),
  'sca-office': new Set(['blue-west', 'blue-east', 'sofa-west', 'sofa-east']),
  auditorium: new Set(['auditorium-lower', 'auditorium-middle', 'auditorium-upper']),
  'learning-lab': new Set(['window-chair', 'blue-floor-cushion', 'gray-floor-cushion', 'right-floor-cushion', 'activity-table-seat']),
});

export async function handleStudyHealth(_req: express.Request, res: Response) {
  const startedAt = process.hrtime.bigint();
  res.set('Cache-Control', 'no-store');
  try {
    const result = await db.query(
      `SELECT
         to_regclass('study_sessions') IS NOT NULL AS study_sessions,
         to_regclass('study_room_presence') IS NOT NULL AS study_room_presence,
         to_regclass('study_world_chat_messages') IS NOT NULL AS study_world_chat_messages,
         to_regclass('study_player_reports') IS NOT NULL AS study_player_reports,
         to_regclass('avatar_items') IS NOT NULL AS avatar_items,
         to_regclass('avatar_inventory') IS NOT NULL AS avatar_inventory,
         to_regclass('avatar_equipment') IS NOT NULL AS avatar_equipment,
         to_regclass('user_points') IS NOT NULL AS user_points`,
    );
    const checks = Object.values(result.rows[0] ?? {});
    const schemaReady = checks.length === 8 && checks.every(Boolean);
    const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    return res.status(schemaReady ? 200 : 503).json({
      status: schemaReady ? 'ok' : 'unavailable',
      service: 'study',
      database: 'ok',
      schema: schemaReady ? 'ready' : 'missing',
      latencyMs: Math.round(latencyMs * 10) / 10,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Study health check error:', error);
    return res.status(503).json({
      status: 'unavailable',
      service: 'study',
      database: 'unavailable',
      timestamp: new Date().toISOString(),
    });
  }
}

const studyPlayerLimiter = rateLimit({
  windowMs: 60_000,
  max: STUDY_PLAYER_RATE_LIMIT_PER_MINUTE,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as AuthRequest).user?.id ?? rateLimitClientIpKey(req.ip),
  handler: (_req, res) => sendError(res, 'Study request rate limit exceeded', 429),
});

const studyReportLimiter = rateLimit({
  windowMs: 10 * 60_000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as AuthRequest).user?.id ?? 'anonymous',
  handler: (_req, res) => sendError(
    res,
    'Social report limit reached. Please wait before sending another report.',
    429,
    'STUDY_REPORT_RATE_LIMITED',
  ),
});

router.get('/health', handleStudyHealth);
router.use(webAuthMiddleware);
router.use(studyPlayerLimiter);
router.use(requireWebCsrf);
router.use(enforceStudyAccess);

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
    const client = await db.pool.connect();
    let transactionOpen = false;
    try {
      await client.query('BEGIN');
      transactionOpen = true;
      const userLock = await client.query(
        'SELECT id FROM users WHERE id = $1 FOR UPDATE',
        [req.user!.id],
      );
      if (userLock.rowCount !== 1) {
        throw new Error('Authenticated Study user no longer exists');
      }

      const nonce = createNonce();
      await client.query(
        `UPDATE study_sessions
         SET status = 'closed', finished_at = NOW(), updated_at = NOW()
         WHERE user_id = $1 AND status = 'active'`,
        [req.user!.id],
      );
      const result = await client.query(
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

      await client.query('COMMIT');
      transactionOpen = false;
      return sendSuccess(res, { session: mapSession(result.rows[0]), nonce }, 'Study session started', undefined, 201);
    } catch (error) {
      if (transactionOpen) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Preserve the original failure while still releasing the pinned client.
        }
      }
      throw error;
    } finally {
      client.release();
    }
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
  const rawSeatId = req.body?.seatId ?? req.body?.seat_id;

  const client = await db.pool.connect();
  let transactionOpen = false;
  try {
    await client.query('BEGIN');
    transactionOpen = true;
    const sessionResult = await client.query(
      `SELECT id, user_id, location, status, current_nonce_hash, last_heartbeat_at,
              valid_heartbeat_count, eligible_seconds
       FROM study_sessions
       WHERE id = $1 AND user_id = $2
       LIMIT 1
       FOR UPDATE`,
      [req.params.id, req.user!.id],
    );
    const session = sessionResult.rows[0];
    if (!session || session.status !== 'active') {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return sendError(res, 'Active Study session not found', 404);
    }
    if (session.current_nonce_hash !== hashStudyNonce(nonce)) {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return sendError(res, 'Invalid session nonce', 409);
    }
    const seatId = normalizeSeatId(normalizeLocation(session.location) as StudyPhysicalRoomId | null, rawSeatId);

    const eligibleHeartbeat = Boolean(focused && foreground && interaction === 'seated' && seatId);
    const firstEligibleHeartbeat = toNumber(session.valid_heartbeat_count) === 0;
    const acceptedSeconds = eligibleHeartbeat && !firstEligibleHeartbeat
      ? secondsSince(session.last_heartbeat_at, HEARTBEAT_MAX_SECONDS)
      : 0;
    const nextNonce = createNonce();
    await client.query(
      `INSERT INTO study_session_events (
          session_id, event_type, server_received_at, position_x, position_y,
          seat_id, interaction, accepted, accepted_seconds
       )
       VALUES ($1, 'heartbeat', NOW(), $2, $3, $4, $5, $6, $7)`,
      [session.id, position.x, position.y, seatId, interaction, acceptedSeconds > 0, acceptedSeconds],
    );
    const updateResult = await client.query(
      `UPDATE study_sessions
       SET current_nonce_hash = $1,
           last_heartbeat_at = NOW(),
           valid_heartbeat_count = valid_heartbeat_count + CASE WHEN $3 THEN 1 ELSE 0 END,
           eligible_seconds = eligible_seconds + $2,
           updated_at = NOW()
       WHERE id = $4 AND user_id = $5 AND status = 'active'
       RETURNING id, location, status, started_at, last_heartbeat_at`,
      [hashStudyNonce(nextNonce), acceptedSeconds, eligibleHeartbeat, session.id, req.user!.id],
    );
    await client.query('COMMIT');
    transactionOpen = false;

    return sendSuccess(
      res,
      { session: mapSession(updateResult.rows[0]), nonce: nextNonce, accepted_seconds: acceptedSeconds },
      'Study heartbeat accepted',
    );
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK');
    console.error('Study heartbeat error:', error);
    return sendError(res, 'Failed to save Study heartbeat', 500);
  } finally {
    client.release();
  }
}

export async function handleFinishStudySession(req: AuthRequest, res: Response) {
  if (!ensureRegisteredAccount(req, res)) {
    return undefined;
  }

  const nonce = typeof req.body?.nonce === 'string' ? req.body.nonce : '';

  const client = await db.pool.connect();
  let transactionOpen = false;
  try {
    await client.query('BEGIN');
    transactionOpen = true;
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [req.user!.id]);
    const sessionResult = await client.query(
      `SELECT id, user_id, location, status, current_nonce_hash,
              valid_heartbeat_count, eligible_seconds, awarded_points, session_type,
              pomodoro_target_minutes, finished_at
       FROM study_sessions
       WHERE id = $1 AND user_id = $2
       LIMIT 1
       FOR UPDATE`,
      [req.params.id, req.user!.id],
    );
    const session = sessionResult.rows[0];
    if (!session) {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return sendError(res, 'Study session not found', 404);
    }
    if (session.status === 'finished') {
      const pointsResult = await client.query(
        'SELECT spendable_points FROM user_points WHERE user_id = $1',
        [req.user!.id],
      );
      await client.query('COMMIT');
      transactionOpen = false;
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
    if (session.status !== 'active') {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return sendError(res, 'Active Study session not found', 404);
    }
    if (session.current_nonce_hash !== hashStudyNonce(nonce)) {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return sendError(res, 'Invalid session nonce', 409);
    }

    const studyRule = await getEconomyRule('study_minute', client);
    const dailyResult = await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS awarded_today
       FROM points_ledger
       WHERE user_id = $1
         AND source_type = 'economy:study_minute'
         AND created_at >= CURRENT_DATE`,
      [req.user!.id],
    );
    const dailyCap = studyRule.dailyCap ?? 25;
    const remainingDailyPoints = Math.max(0, dailyCap - toNumber(dailyResult.rows[0]?.awarded_today));
    const eligibleMinutes = getStudyAwardPoints({
      eligibleSeconds: toNumber(session.eligible_seconds),
      validHeartbeatCount: toNumber(session.valid_heartbeat_count),
    });
    const pointsToAward = studyRule.enabled
      ? Math.min(eligibleMinutes * studyRule.amount, remainingDailyPoints)
      : 0;

    let spendablePoints = 0;
    if (pointsToAward > 0) {
      const awardResult = await awardUserPoints({
        userId: req.user!.id,
        amount: pointsToAward,
        category: 'social',
        sourceType: 'economy:study_minute',
        sourceId: session.id,
        idempotencyKey: `study:finish:${session.id}`,
        metadata: {
          location: session.location,
          session_type: normalizeSessionType(session.session_type),
          rule_key: studyRule.ruleKey,
          rule_version: studyRule.version,
          pomodoro_target_minutes: session.pomodoro_target_minutes ?? null,
          eligible_seconds: toNumber(session.eligible_seconds),
          valid_heartbeat_count: toNumber(session.valid_heartbeat_count),
        },
      }, client);
      spendablePoints = awardResult.spendablePoints;
    } else {
      const pointsResult = await client.query(
        'SELECT spendable_points FROM user_points WHERE user_id = $1',
        [req.user!.id],
      );
      spendablePoints = toNumber(pointsResult.rows[0]?.spendable_points);
    }

    const updateResult = await client.query(
      `UPDATE study_sessions
       SET status = 'finished', finished_at = NOW(), awarded_points = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3 AND status = 'active'
       RETURNING id, location, status, session_type, pomodoro_target_minutes, finished_at, awarded_points`,
      [pointsToAward, session.id, req.user!.id],
    );
    if (!updateResult.rows[0]) throw new Error('STUDY_SESSION_STATE_CHANGED');
    await client.query('COMMIT');
    transactionOpen = false;

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
    if (transactionOpen) await client.query('ROLLBACK');
    console.error('Study finish error:', error);
    return sendError(res, 'Failed to finish Study session', 500);
  } finally {
    client.release();
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
    const keepStickyInstance = stickyInstanceId && stickyParsed
      && (!preferredInstanceId || preferredInstanceId === stickyInstanceId);
    const selected = keepStickyInstance
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
    invalidateStudyPresenceCache(roomId, selected.id);

    return sendSuccess(res, {
      instance: {
        ...selected,
        occupancy: keepStickyInstance ? Math.max(1, selected.occupancy) : selected.occupancy + 1,
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

  const cacheKey = `${roomId}:${instanceId}`;
  const now = Date.now();
  const cached = presenceCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return sendSuccess(res, cached.payload, 'Study presence fetched');
  }

  try {
    let pending = presenceLoads.get(cacheKey);
    if (!pending) {
      pending = db.query(
      `SELECT p.user_id, p.room_id, p.instance_id, p.node_id, p.position_x, p.position_y,
              p.seat_id, p.presence_mode, p.last_heartbeat_at, COALESCE(NULLIF(TRIM(u.username), ''), u.display_name) AS display_name,
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
      ).then(result => ({ presence: result.rows.map(mapPresence) }));
      presenceLoads.set(cacheKey, pending);
    }
    let payload: PresenceCacheEntry['payload'];
    try {
      payload = await pending;
      // An intervening heartbeat/join must not let this older read refill the cache.
      if (presenceLoads.get(cacheKey) === pending) {
        presenceCache.set(cacheKey, { payload, expiresAt: Date.now() + PRESENCE_CACHE_TTL_MS });
      }
    } finally {
      if (presenceLoads.get(cacheKey) === pending) presenceLoads.delete(cacheKey);
    }
    return sendSuccess(res, payload, 'Study presence fetched');
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
  const seatId = rawSeatId === null || rawSeatId === undefined ? null : normalizeSeatId(roomId, rawSeatId);
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
      `WITH seat_lock AS (
         SELECT pg_try_advisory_xact_lock(
            hashtextextended(CONCAT($2::text, ':', $3::text, ':', COALESCE($8::text, '')), 0)
         ) AS acquired
       )
       UPDATE study_room_presence
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
         AND (
           $8::text IS NULL
           OR (
             (SELECT acquired FROM seat_lock)
             AND NOT EXISTS (
               SELECT 1
               FROM study_room_presence occupied
               WHERE occupied.user_id <> $1
                 AND occupied.room_id = $2
                 AND occupied.instance_id = $3
                 AND occupied.seat_id = $8
                 AND occupied.is_active = true
                 AND occupied.last_heartbeat_at >= NOW() - INTERVAL '${PRESENCE_TTL_SECONDS} seconds'
             )
           )
         )
       RETURNING user_id, room_id, node_id, position_x, position_y,
                  instance_id, seat_id, presence_mode, last_heartbeat_at`,
      [
        req.user!.id, roomId, instanceId, clientSessionId,
        nodeId, position.x, position.y, seatId,
      ],
     );
     if (!result.rows[0]) {
       if (seatId) {
         const occupied = await db.query(
           `SELECT 1
            FROM study_room_presence
            WHERE user_id <> $1
              AND room_id = $2
              AND instance_id = $3
              AND seat_id = $4
              AND is_active = true
              AND last_heartbeat_at >= NOW() - INTERVAL '${PRESENCE_TTL_SECONDS} seconds'
            LIMIT 1`,
           [req.user!.id, roomId, instanceId, seatId],
         );
         if (occupied.rows[0]) return sendError(res, 'Seat already occupied', 409);
       }
       return sendError(res, 'Study room instance rejoin required', 409);
    }
    invalidateStudyPresenceCache(roomId, instanceId);
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

  const cacheKey = `${roomId}:${instanceId}`;
  const now = Date.now();
  const cached = chatCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return sendSuccess(res, cached.payload, 'Social messages fetched');
  }

  try {
    const result = await db.query(
      `SELECT * FROM (
         SELECT m.id, m.user_id, COALESCE(NULLIF(TRIM(u.username), ''), u.display_name) AS display_name, m.room_id, m.instance_id,
                m.message_text, m.created_at
         FROM study_world_chat_messages m
         JOIN users u ON u.id = m.user_id
         WHERE m.room_id = $1
           AND m.instance_id = $2
            AND m.created_at > NOW() - INTERVAL '6 hours'
         ORDER BY m.created_at DESC
         LIMIT 50
       ) recent
       ORDER BY created_at ASC`,
      [roomId, instanceId],
    );
    const messages = result.rows
      .filter((row: Record<string, unknown>) => (
        typeof row.message_text === 'string' && evaluateStudyChatText(row.message_text).allowed
      ))
      .map(mapChatMessage);
    const payload = { messages };
    // A cached response must never extend a message's six-hour lifetime.
    const expiresAt = Math.min(now + CHAT_CACHE_TTL_MS, ...messages.map((message) =>
      new Date(message.createdAt as string).getTime() + 6 * 60 * 60_000,
    ));
    chatCache.set(cacheKey, { payload, expiresAt });
    return sendSuccess(res, payload, 'Social messages fetched');
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
    return sendError(res, 'Invalid Social message', 400);
  }
  if (!evaluateStudyChatText(text).allowed) {
    return sendError(res, 'Message blocked by Social room safety rules.', 422, 'CHAT_CONTENT_BLOCKED');
  }

  try {
    const result = await db.query(
      `WITH locked_user AS (
         SELECT pg_try_advisory_xact_lock(hashtext($2::text)) AS acquired
       ), recent AS (
         SELECT locked_user.acquired, COUNT(messages.id) AS recent_count
         FROM locked_user
         LEFT JOIN study_world_chat_messages messages
           ON locked_user.acquired
          AND messages.user_id = $2::uuid
           AND messages.created_at >= NOW() - ($5::integer * INTERVAL '1 second')
         GROUP BY locked_user.acquired
       ), inserted AS (
         INSERT INTO study_world_chat_messages (room_id, instance_id, user_id, message_text, created_at)
         SELECT $1::text, $3::text, $2::uuid, $4::text, NOW()
         FROM recent
          WHERE acquired AND recent_count < $6::integer
            AND NOT EXISTS (
              SELECT 1
              FROM study_world_chat_messages duplicate
              WHERE duplicate.user_id = $2::uuid
                AND duplicate.message_text = $4::text
                AND duplicate.created_at >= NOW() - ($7::integer * INTERVAL '1 second')
            )
           AND EXISTS (
             SELECT 1
             FROM study_room_presence presence
             WHERE presence.user_id = $2::uuid
               AND presence.room_id = $1::text
               AND presence.instance_id = $3::text
               AND presence.is_active = true
               AND presence.last_heartbeat_at >= NOW() - INTERVAL '${PRESENCE_TTL_SECONDS} seconds'
           )
         RETURNING id, user_id, room_id, instance_id, message_text, created_at
       )
       SELECT i.id, i.user_id, COALESCE(NULLIF(TRIM(u.username), ''), u.display_name) AS display_name, i.room_id, i.instance_id,
              i.message_text, i.created_at,
              EXISTS (
                SELECT 1 FROM study_room_presence p
                WHERE p.user_id = $2::uuid AND p.room_id = $1::text AND p.instance_id = $3::text
                  AND p.is_active = true
                  AND p.last_heartbeat_at >= NOW() - INTERVAL '${PRESENCE_TTL_SECONDS} seconds'
              ) AS room_active
       FROM recent
       LEFT JOIN inserted i ON true
       LEFT JOIN users u ON u.id = i.user_id`,
       [
         roomId, req.user!.id, instanceId, text,
         CHAT_WINDOW_SECONDS, CHAT_WINDOW_LIMIT, CHAT_DUPLICATE_WINDOW_SECONDS,
       ],
    );
    if (result.rows[0]?.room_active === false && !result.rows[0]?.id) {
      return sendError(res, 'Rejoin this room before sending a message.', 409, 'CHAT_ROOM_NOT_JOINED');
    }
    if (!result.rows[0]?.id) {
      return sendError(res, 'Social chat rate limit exceeded', 429, 'CHAT_RATE_LIMITED');
    }
    invalidateStudyChatCache(roomId, instanceId);
    return sendSuccess(res, { message: mapChatMessage(result.rows[0]) }, 'Social message sent', undefined, 201);
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
    const [inventory, equipment, points, userRes] = await Promise.all([
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
      db.query('SELECT username, display_name FROM users WHERE id = $1', [req.user!.id]),
    ]);
    const userRow = userRes.rows[0];
    const username = typeof userRow?.username === 'string' && userRow.username.trim() ? userRow.username.trim() : null;
    return sendSuccess(res, {
      username,
      displayName: username || userRow?.display_name || 'RadioTEDU user',
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
    if (error?.message === 'GOLD_IDEMPOTENCY_PAYLOAD_MISMATCH') {
      return sendError(res, 'Idempotency key was already used for another avatar item', 409);
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

function normalizeSeatId(roomId: StudyPhysicalRoomId | null, value: unknown) {
  if (!roomId || typeof value !== 'string' || !/^[a-zA-Z0-9:_-]{1,120}$/.test(value)) return null;
  return VALID_STUDY_SEATS[roomId].has(value) ? value : null;
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
  // Image rooms send continuous percentage coordinates, not integer tile indices.
  return Math.max(0, Math.min(99, value));
}

function secondsSince(value: unknown, cap: number) {
  const date = value instanceof Date ? value : new Date(String(value));
  const elapsed = Number.isFinite(date.getTime()) ? Math.floor((Date.now() - date.getTime()) / 1000) : 0;
  if (elapsed < 0 || elapsed > cap) return 0;
  return elapsed;
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

export async function handleStudyHome(req: AuthRequest, res: Response) {
  if (!ensureRegisteredAccount(req, res)) return undefined;
  try {
    const [summaryResult, roomsResult, leaderboardResult] = await Promise.all([
      db.query(
        `SELECT
           COALESCE(SUM(eligible_seconds) FILTER (
             WHERE started_at >= date_trunc('day', timezone('Europe/Istanbul', NOW()))
           ), 0) AS today_seconds,
           COALESCE(SUM(eligible_seconds) FILTER (
             WHERE started_at >= date_trunc('month', timezone('Europe/Istanbul', NOW()))
           ), 0) AS month_seconds,
           COALESCE(SUM(eligible_seconds), 0) AS total_seconds
         FROM study_sessions
         WHERE user_id = $1 AND status IN ('active', 'finished', 'closed')`,
        [req.user!.id],
      ),
      db.query(
        `SELECT room_id, COUNT(*)::integer AS occupancy,
                COUNT(DISTINCT instance_id)::integer AS instance_count
         FROM study_room_presence
         WHERE room_id = ANY($1::text[])
           AND is_active = true
           AND last_heartbeat_at >= NOW() - ($2 * INTERVAL '1 second')
         GROUP BY room_id`,
        [STUDY_ROOM_IDS, PRESENCE_TTL_SECONDS],
      ),
      db.query(
        `SELECT u.id AS user_id, COALESCE(NULLIF(TRIM(u.username), ''), u.display_name) AS display_name,
                COALESCE(SUM(s.eligible_seconds) FILTER (
                  WHERE s.started_at >= NOW() - INTERVAL '7 days'
                ), 0) AS week_seconds,
                COALESCE(SUM(s.eligible_seconds) FILTER (
                  WHERE s.started_at >= date_trunc('month', timezone('Europe/Istanbul', NOW()))
                ), 0) AS month_seconds,
                COALESCE(SUM(s.eligible_seconds), 0) AS all_seconds,
                COUNT(DISTINCT (timezone('Europe/Istanbul', s.started_at))::date)
                  FILTER (WHERE s.started_at >= NOW() - INTERVAL '30 days') AS streak_days
         FROM users u
         JOIN study_sessions s ON s.user_id = u.id
         WHERE s.status IN ('active', 'finished', 'closed')
         GROUP BY u.id, COALESCE(NULLIF(TRIM(u.username), ''), u.display_name)
         ORDER BY all_seconds DESC, u.display_name ASC
         LIMIT 100`,
      ),
    ]);

    const roomRows = new Map<string, Record<string, unknown>>(
      roomsResult.rows.map((row: Record<string, unknown>) => [String(row.room_id), row]),
    );
    const rooms = STUDY_ROOM_IDS.map((roomId) => {
      const row = roomRows.get(roomId);
      return {
        roomId,
        occupancy: toNumber(row?.occupancy),
        capacity: STUDY_ROOM_CAPACITIES[roomId],
        instanceCount: Math.max(1, toNumber(row?.instance_count)),
      };
    });
    const leaderboardFor = (secondsKey: 'week_seconds' | 'month_seconds' | 'all_seconds') =>
      leaderboardResult.rows.map((row: Record<string, unknown>, index: number) => ({
        rank: index + 1,
        userId: row.user_id,
        displayName: typeof row.display_name === 'string' ? row.display_name.slice(0, 80) : 'RadioTEDU user',
        studySeconds: toNumber(row[secondsKey]),
        streakDays: Math.min(36_500, toNumber(row.streak_days)),
      }));
    const summary = summaryResult.rows[0] ?? {};
    return sendSuccess(res, {
      activePlayers: rooms.reduce((total, room) => total + room.occupancy, 0),
      summary: {
        todaySeconds: toNumber(summary.today_seconds),
        monthSeconds: toNumber(summary.month_seconds),
        totalSeconds: toNumber(summary.total_seconds),
      },
      rooms,
      leaderboard: {
        week: leaderboardFor('week_seconds'),
        month: leaderboardFor('month_seconds'),
        all: leaderboardFor('all_seconds'),
      },
      generatedAt: new Date().toISOString(),
    }, 'Study home fetched');
  } catch (error) {
    console.error('Study home error:', error);
    return sendError(res, 'Failed to fetch Study home', 500);
  }
}

export async function handleStudyPlayerReport(req: AuthRequest, res: Response) {
  if (!ensureRegisteredAccount(req, res)) return undefined;
  const targetUserId = typeof req.body?.targetUserId === 'string' ? req.body.targetUserId.trim() : '';
  const roomId = normalizeLocation(req.body?.roomId ?? req.body?.room_id) as StudyPhysicalRoomId | null;
  const instanceId = typeof (req.body?.instanceId ?? req.body?.instance_id) === 'string'
    ? String(req.body.instanceId ?? req.body.instance_id)
    : null;
  const reason = normalizeReportReason(req.body?.reason);
  const idempotencyKey = typeof req.body?.idempotencyKey === 'string'
    ? req.body.idempotencyKey.trim().slice(0, 180)
    : '';
  if (
    !isUuid(targetUserId) || targetUserId === req.user!.id || !roomId
    || !instanceId || !parseStudyRoomInstanceId(instanceId, roomId)
    || !reason || !idempotencyKey
  ) {
    return sendError(res, 'Invalid Study report payload', 400);
  }
  try {
    const presence = await db.query(
      `SELECT 1
       FROM study_room_presence
       WHERE user_id IN ($1, $2)
         AND room_id = $3
         AND instance_id = $4
         AND is_active = true
         AND last_heartbeat_at >= NOW() - ($5 * INTERVAL '1 second')
       GROUP BY room_id, instance_id
       HAVING COUNT(*) = 2`,
      [req.user!.id, targetUserId, roomId, instanceId, PRESENCE_TTL_SECONDS],
    );
    if (!presence.rows[0]) return sendError(res, 'Study report requires shared live room presence', 409);
    const result = await db.query(
      `INSERT INTO study_player_reports
         (reporter_user_id, target_user_id, room_id, instance_id, reason, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (reporter_user_id, idempotency_key) DO UPDATE
          SET idempotency_key = EXCLUDED.idempotency_key
          WHERE study_player_reports.target_user_id = EXCLUDED.target_user_id
            AND study_player_reports.room_id = EXCLUDED.room_id
            AND study_player_reports.instance_id = EXCLUDED.instance_id
            AND study_player_reports.reason = EXCLUDED.reason
        RETURNING id, created_at, status`,
      [req.user!.id, targetUserId, roomId, instanceId, reason, idempotencyKey],
    );
    if (!result.rows[0]) {
      return sendError(
        res,
        'That report request key was already used for different report details.',
        409,
        'STUDY_REPORT_IDEMPOTENCY_CONFLICT',
      );
    }
    return sendSuccess(res, { report: result.rows[0] }, 'Social report received', undefined, 201);
  } catch (error) {
    console.error('Study player report error:', error);
    return sendError(res, 'Failed to submit Study report', 500);
  }
}

function normalizeReportReason(value: unknown) {
  return typeof value === 'string' && ['harassment', 'spam', 'unsafe-profile', 'other'].includes(value)
    ? value
    : null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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
router.get('/home', handleStudyHome);
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
router.post('/profile/username', handleUpdateUsername);
router.post('/moderation/reports', studyReportLimiter, handleStudyPlayerReport);


export async function handleUpdateUsername(req: AuthRequest, res: Response) {
  if (!ensureRegisteredAccount(req, res)) {
    return undefined;
  }
  const raw = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  if (!raw) {
    return sendError(res, 'Username is required', 400, 'USERNAME_REQUIRED');
  }
  const usernameRegex = /^[a-zA-Z0-9_.-]{3,20}$/;
  if (!usernameRegex.test(raw)) {
    return sendError(
      res,
      'Username must be 3-20 characters and contain only letters, numbers, underscores, dots, or hyphens.',
      400,
      'INVALID_USERNAME'
    );
  }
  const safety = evaluateStudyChatText(raw);
  if (!safety.allowed) {
    return sendError(res, 'This username is not permitted.', 400, 'UNSAFE_USERNAME');
  }

  try {
    const existing = await db.query(
      'SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id != $2 LIMIT 1',
      [raw, req.user!.id],
    );
    if (existing.rows[0]) {
      return sendError(res, 'This username is already taken. Please choose another.', 409, 'USERNAME_TAKEN');
    }

    const result = await db.query(
      'UPDATE users SET username = $1, updated_at = NOW() WHERE id = $2 RETURNING id, username, display_name',
      [raw, req.user!.id],
    );
    if (!result.rows[0]) {
      return sendError(res, 'User not found', 404);
    }

    presenceCache.clear();
    chatCache.clear();

    return sendSuccess(res, {
      username: result.rows[0].username,
      displayName: result.rows[0].username,
    }, 'Username updated successfully');
  } catch (error: unknown) {
    const pgError = error as { code?: string };
    if (pgError.code === '23505') {
      return sendError(res, 'This username is already taken. Please choose another.', 409, 'USERNAME_TAKEN');
    }
    console.error('Update username error:', error);
    return sendError(res, 'Failed to update username', 500);
  }
}

export async function pruneExpiredStudyChatMessages(): Promise<number> {
  const result = await db.query(
    "DELETE FROM study_world_chat_messages WHERE created_at <= NOW() - INTERVAL '6 hours'"
  );
  return result.rowCount ?? 0;
}

export function startStudyChatCleanupJob(): void {
  void pruneExpiredStudyChatMessages().catch((error) => console.error('Initial study chat prune failed:', error));
  const timer = setInterval(() => {
    void pruneExpiredStudyChatMessages().catch((error) => console.error('Study chat prune job failed:', error));
  }, 60_000);
  timer.unref();
}

export default router;
