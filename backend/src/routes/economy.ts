import crypto from 'crypto';
import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { db } from '../db';
import type { AuthRequest } from '../middleware/auth';
import { requireWebCsrf, webAuthMiddleware } from '../services/webSession';
import {
    awardEconomyReward,
    getEconomyRule,
    getGoldBalance,
    listEconomyRules,
    spendEconomyCost,
} from '../services/economy';
import { spendUserPoints } from '../services/gamification';
import { sendError, sendSuccess } from '../utils/response';
import { normalizeClientIp } from '../utils/networkAddress';

const router = Router();
const HEARTBEAT_MIN_SECONDS = 8;
const HEARTBEAT_MAX_SECONDS = 75;
const HEARTBEAT_CREDIT_MAX_SECONDS = 45;
const RADIO_REWARD_UNIT_SECONDS = 60 * 60;
const FOCUS_TARGET_SECONDS = 25 * 60;
const VALID_CHANNELS = new Set([
    'mosaic',
    'jazz',
    'lofi',
    'classical',
    'classic',
    'energize',
    'rock',
    'spark',
    'en',
    'fr',
    'it',
    'ru',
    'ar',
    'de',
    'tr',
    'jp',
    'ai',
    'radio',
]);

export function isValidListeningChannel(value: unknown): boolean {
    const channelId = cleanId(value, 40)?.toLowerCase();
    return Boolean(channelId && VALID_CHANNELS.has(channelId));
}

export function classifyHeartbeat(elapsedSeconds: number): { accepted: boolean; expired: boolean; creditedSeconds: number } {
    const elapsed = Math.floor(Number(elapsedSeconds));
    if (!Number.isFinite(elapsed) || elapsed < HEARTBEAT_MIN_SECONDS) {
        return { accepted: false, expired: false, creditedSeconds: 0 };
    }
    if (elapsed > HEARTBEAT_MAX_SECONDS) {
        return { accepted: false, expired: true, creditedSeconds: 0 };
    }
    return { accepted: true, expired: false, creditedSeconds: Math.min(elapsed, HEARTBEAT_CREDIT_MAX_SECONDS) };
}

const mutationLimiter = rateLimit({
    windowMs: 60_000,
    max: process.env.NODE_ENV === 'test' ? 1000 : 90,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req as AuthRequest).user?.id ?? 'unauthenticated-economy',
});

function hashNonce(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function nonce(): string {
    return crypto.randomBytes(32).toString('base64url');
}

function cleanId(value: unknown, max = 128): string | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    return /^[A-Za-z0-9:_-]+$/.test(normalized) && normalized.length <= max ? normalized : null;
}

function normalizeSessionUserAgent(value: unknown): string {
    return typeof value === 'string' ? value.trim().slice(0, 500) : '';
}

export function sessionUserAgentMatches(stored: unknown, current: unknown): boolean {
    const expected = normalizeSessionUserAgent(stored);
    const actual = normalizeSessionUserAgent(current);
    if (!expected || !actual || expected.length !== actual.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

function idempotencyKey(req: AuthRequest): string | null {
    return cleanId(req.get('Idempotency-Key') ?? req.body?.idempotency_key, 180);
}

function ensureAccount(req: AuthRequest, res: Response): boolean {
    if (!req.user?.id || req.user.role === 'guest') {
        sendError(res, 'RadioTEDU account required', 403);
        return false;
    }
    return true;
}

function mapEconomyError(res: Response, error: unknown) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'INSUFFICIENT_GOLD') return sendError(res, 'Insufficient Gold', 409);
    if (code === 'ECONOMY_RULE_DISABLED') return sendError(res, 'This Gold action is disabled', 409);
    if (code === 'ECONOMY_RULE_NOT_FOUND') return sendError(res, 'Gold rule not found', 404);
    if (code === 'GOLD_IDEMPOTENCY_KEY_REQUIRED') return sendError(res, 'Idempotency key required', 400);
    if (code === 'GOLD_IDEMPOTENCY_PAYLOAD_MISMATCH') {
        return sendError(res, 'Idempotency key was already used for another Gold action', 409);
    }
    console.error('Economy request failed:', error);
    return sendError(res, 'Gold service is temporarily unavailable', 500);
}

async function handleSummary(req: AuthRequest, res: Response) {
    if (!ensureAccount(req, res)) return;
    try {
        const [balance, rules, ledger, profile, inventory] = await Promise.all([
            getGoldBalance(req.user!.id),
            listEconomyRules(),
            db.query(
                `SELECT id, amount, category, source_type, source_id, balance_after, metadata, created_at
                 FROM points_ledger WHERE user_id = $1
                 ORDER BY created_at DESC LIMIT 30`,
                [req.user!.id],
            ),
            db.query(
                `SELECT u.display_name, upc.department, upc.profile_completed_at
                 FROM users u LEFT JOIN user_profile_customization upc ON upc.user_id = u.id
                 WHERE u.id = $1`,
                [req.user!.id],
            ),
            db.query(
                `SELECT sui.item_id, ssi.title, ssi.kind, ssi.asset_key,
                        (sue.item_id = sui.item_id) AS equipped
                 FROM study_user_items sui
                 JOIN study_shop_items ssi ON ssi.item_id = sui.item_id
                 LEFT JOIN study_user_equipment sue ON sue.user_id = sui.user_id AND sue.kind = ssi.kind
                 WHERE sui.user_id = $1 ORDER BY sui.purchased_at DESC`,
                [req.user!.id],
            ),
        ]);
        return sendSuccess(res, {
            gold_balance: balance,
            rules,
            ledger: ledger.rows,
            profile: profile.rows[0] ?? null,
            study_inventory: inventory.rows,
            legal: {
                terms_url: 'https://radiotedu.com/kullanim-kosullari/',
                privacy_url: 'https://radiotedu.com/gizlilik-politikasi/',
                economy_notice: 'Gold is a virtual in-service balance with no cash value. RadioTEDU records reward, purchase and security events to prevent abuse and explain balance changes.',
            },
        });
    } catch (error) {
        return mapEconomyError(res, error);
    }
}

async function startListening(req: AuthRequest, res: Response) {
    if (!ensureAccount(req, res)) return;
    const clientSessionId = cleanId(req.body?.client_session_id);
    const channelId = cleanId(req.body?.channel_id, 40)?.toLowerCase();
    const userAgent = normalizeSessionUserAgent(req.get('user-agent'));
    if (!clientSessionId || !channelId || !isValidListeningChannel(channelId)) {
        return sendError(res, 'Valid client session and RadioTEDU channel required', 400);
    }
    if (!userAgent) return sendError(res, 'Client identity required', 400);
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [req.user!.id]);
        await client.query(
            `UPDATE verified_listening_sessions SET status = 'expired', finished_at = NOW()
             WHERE user_id = $1 AND status = 'active'`,
            [req.user!.id],
        );
        const nextNonce = nonce();
        const result = await client.query(
            `INSERT INTO verified_listening_sessions (
                user_id, channel_id, client_session_id, current_nonce_hash, last_ip, user_agent
             ) VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (user_id, client_session_id) DO UPDATE SET
                channel_id = EXCLUDED.channel_id,
                status = 'active',
                current_nonce_hash = EXCLUDED.current_nonce_hash,
                started_at = NOW(),
                last_heartbeat_at = NOW(),
                finished_at = NULL,
                eligible_seconds = 0,
                valid_heartbeat_count = 0,
                last_ip = EXCLUDED.last_ip,
                user_agent = EXCLUDED.user_agent
             RETURNING id, channel_id, started_at`,
            [req.user!.id, channelId, clientSessionId, hashNonce(nextNonce), normalizeClientIp(req.ip), userAgent],
        );
        await client.query('COMMIT');
        return sendSuccess(res, { session: result.rows[0], nonce: nextNonce, heartbeat_after_seconds: 25 }, 'Verified listening started', null, 201);
    } catch (error) {
        await client.query('ROLLBACK');
        return mapEconomyError(res, error);
    } finally {
        client.release();
    }
}

async function listeningHeartbeat(req: AuthRequest, res: Response) {
    if (!ensureAccount(req, res)) return;
    const sessionId = cleanId(req.body?.session_id, 80);
    const currentNonce = typeof req.body?.nonce === 'string' ? req.body.nonce : '';
    if (!sessionId || !currentNonce || req.body?.is_playing !== true) {
        return sendError(res, 'Active playback proof required', 400);
    }
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        const locked = await client.query(
            `SELECT *, EXTRACT(EPOCH FROM (NOW() - last_heartbeat_at)) AS elapsed_seconds
             FROM verified_listening_sessions
             WHERE id = $1 AND user_id = $2 FOR UPDATE`,
            [sessionId, req.user!.id],
        );
        const session = locked.rows[0];
        if (!session || session.status !== 'active') {
            await client.query('ROLLBACK');
            return sendError(res, 'Listening session is not active', 409);
        }
        if (!sessionUserAgentMatches(session.user_agent, req.get('user-agent'))) {
            await client.query(
                `UPDATE verified_listening_sessions SET status = 'expired', finished_at = NOW() WHERE id = $1`,
                [sessionId],
            );
            await client.query('COMMIT');
            return sendError(res, 'Listening session client changed', 409);
        }
        if (session.current_nonce_hash !== hashNonce(currentNonce)) {
            await client.query('ROLLBACK');
            return sendError(res, 'Listening nonce is invalid or already used', 409);
        }
        const elapsed = Math.floor(Number(session.elapsed_seconds ?? 0));
        const heartbeat = classifyHeartbeat(elapsed);
        if (heartbeat.expired) {
            await client.query(
                `UPDATE verified_listening_sessions SET status = 'expired', finished_at = NOW() WHERE id = $1`,
                [sessionId],
            );
            await client.query('COMMIT');
            return sendError(res, 'Listening session expired', 409);
        }
        if (!heartbeat.accepted) {
            await client.query('ROLLBACK');
            return sendError(res, 'Listening heartbeat arrived too quickly', 429);
        }
        const credited = heartbeat.creditedSeconds;
        const nextNonce = nonce();
        const updated = await client.query(
            `UPDATE verified_listening_sessions SET
                current_nonce_hash = $1,
                last_heartbeat_at = NOW(),
                eligible_seconds = eligible_seconds + $2,
                valid_heartbeat_count = valid_heartbeat_count + 1
             WHERE id = $3
             RETURNING eligible_seconds, valid_heartbeat_count`,
            [hashNonce(nextNonce), credited, sessionId],
        );
        const progress = await client.query(
            `INSERT INTO gold_activity_progress (user_id, activity_key, eligible_seconds, updated_at)
             VALUES ($1, 'radio_hour', $2, NOW())
             ON CONFLICT (user_id, activity_key) DO UPDATE SET
                eligible_seconds = gold_activity_progress.eligible_seconds + EXCLUDED.eligible_seconds,
                updated_at = NOW()
             RETURNING eligible_seconds, completed_units, rewarded_units`,
            [req.user!.id, credited],
        );
        const totalSeconds = Number(progress.rows[0].eligible_seconds ?? 0);
        const previousCompleted = Number(progress.rows[0].completed_units ?? 0);
        const completedUnits = Math.floor(totalSeconds / RADIO_REWARD_UNIT_SECONDS);
        let reward = null;
        if (completedUnits > previousCompleted) {
            await client.query(
                `UPDATE gold_activity_progress SET completed_units = $1, updated_at = NOW()
                 WHERE user_id = $2 AND activity_key = 'radio_hour'`,
                [completedUnits, req.user!.id],
            );
            reward = await awardEconomyReward({
                userId: req.user!.id,
                ruleKey: 'radio_hour',
                sourceId: sessionId,
                idempotencyKey: `economy:radio-hour:${req.user!.id}:${completedUnits}`,
                metadata: { channel_id: session.channel_id, completed_unit: completedUnits },
            }, client);
            if (reward.applied) {
                await client.query(
                    `UPDATE gold_activity_progress SET rewarded_units = rewarded_units + 1, updated_at = NOW()
                     WHERE user_id = $1 AND activity_key = 'radio_hour'`,
                    [req.user!.id],
                );
            }
        }
        await client.query('COMMIT');
        return sendSuccess(res, {
            session_id: sessionId,
            nonce: nextNonce,
            session_eligible_seconds: Number(updated.rows[0].eligible_seconds),
            total_eligible_seconds: totalSeconds,
            seconds_until_reward: RADIO_REWARD_UNIT_SECONDS - (totalSeconds % RADIO_REWARD_UNIT_SECONDS || RADIO_REWARD_UNIT_SECONDS),
            reward,
        }, 'Verified listening heartbeat accepted');
    } catch (error) {
        await client.query('ROLLBACK');
        return mapEconomyError(res, error);
    } finally {
        client.release();
    }
}

async function startFocus(req: AuthRequest, res: Response) {
    if (!ensureAccount(req, res)) return;
    const clientSessionId = cleanId(req.body?.client_session_id);
    const userAgent = normalizeSessionUserAgent(req.get('user-agent'));
    if (!clientSessionId) return sendError(res, 'Valid client session required', 400);
    if (!userAgent) return sendError(res, 'Client identity required', 400);
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [req.user!.id]);
        await client.query(
            `UPDATE focus_sessions SET status = 'expired'
             WHERE user_id = $1 AND status = 'active'`,
            [req.user!.id],
        );
        const nextNonce = nonce();
        const result = await client.query(
            `INSERT INTO focus_sessions (
                user_id, client_session_id, target_seconds, current_nonce_hash, last_ip, user_agent
             ) VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (user_id, client_session_id) DO UPDATE SET
                target_seconds = EXCLUDED.target_seconds,
                status = 'active',
                current_nonce_hash = EXCLUDED.current_nonce_hash,
                started_at = NOW(),
                last_heartbeat_at = NOW(),
                completed_at = NULL,
                eligible_seconds = 0,
                valid_heartbeat_count = 0,
                awarded_points = 0,
                last_ip = EXCLUDED.last_ip,
                user_agent = EXCLUDED.user_agent
             RETURNING id, target_seconds, started_at`,
            [req.user!.id, clientSessionId, FOCUS_TARGET_SECONDS, hashNonce(nextNonce), normalizeClientIp(req.ip), userAgent],
        );
        await client.query('COMMIT');
        return sendSuccess(res, { session: result.rows[0], nonce: nextNonce, heartbeat_after_seconds: 25 }, 'Focus session started', null, 201);
    } catch (error) {
        await client.query('ROLLBACK');
        return mapEconomyError(res, error);
    } finally {
        client.release();
    }
}

async function focusHeartbeat(req: AuthRequest, res: Response) {
    if (!ensureAccount(req, res)) return;
    const sessionId = cleanId(req.body?.session_id, 80);
    const currentNonce = typeof req.body?.nonce === 'string' ? req.body.nonce : '';
    if (!sessionId || !currentNonce || req.body?.is_focused !== true) return sendError(res, 'Active Focus proof required', 400);
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        const locked = await client.query(
            `SELECT *, EXTRACT(EPOCH FROM (NOW() - last_heartbeat_at)) AS elapsed_seconds
             FROM focus_sessions WHERE id = $1 AND user_id = $2 FOR UPDATE`,
            [sessionId, req.user!.id],
        );
        const session = locked.rows[0];
        if (!session || session.status !== 'active') {
            await client.query('ROLLBACK');
            return sendError(res, 'Focus session is not active', 409);
        }
        if (!sessionUserAgentMatches(session.user_agent, req.get('user-agent'))) {
            await client.query(`UPDATE focus_sessions SET status = 'expired' WHERE id = $1`, [sessionId]);
            await client.query('COMMIT');
            return sendError(res, 'Focus session client changed', 409);
        }
        if (session.current_nonce_hash !== hashNonce(currentNonce)) {
            await client.query('ROLLBACK');
            return sendError(res, 'Focus nonce is invalid or already used', 409);
        }
        const elapsed = Math.floor(Number(session.elapsed_seconds ?? 0));
        const heartbeat = classifyHeartbeat(elapsed);
        if (heartbeat.expired) {
            await client.query(`UPDATE focus_sessions SET status = 'expired' WHERE id = $1`, [sessionId]);
            await client.query('COMMIT');
            return sendError(res, 'Focus session expired', 409);
        }
        if (!heartbeat.accepted) {
            await client.query('ROLLBACK');
            return sendError(res, 'Focus heartbeat arrived too quickly', 429);
        }
        const nextNonce = nonce();
        const credited = heartbeat.creditedSeconds;
        const updated = await client.query(
            `UPDATE focus_sessions SET
                current_nonce_hash = $1,
                last_heartbeat_at = NOW(),
                eligible_seconds = LEAST(target_seconds, eligible_seconds + $2),
                valid_heartbeat_count = valid_heartbeat_count + 1
             WHERE id = $3
             RETURNING eligible_seconds, target_seconds, valid_heartbeat_count`,
            [hashNonce(nextNonce), credited, sessionId],
        );
        await client.query('COMMIT');
        return sendSuccess(res, { session_id: sessionId, nonce: nextNonce, ...updated.rows[0] }, 'Focus heartbeat accepted');
    } catch (error) {
        await client.query('ROLLBACK');
        return mapEconomyError(res, error);
    } finally {
        client.release();
    }
}

async function completeFocus(req: AuthRequest, res: Response) {
    if (!ensureAccount(req, res)) return;
    const sessionId = cleanId(req.body?.session_id, 80);
    const currentNonce = typeof req.body?.nonce === 'string' ? req.body.nonce : '';
    if (!sessionId || !currentNonce) return sendError(res, 'Focus session proof required', 400);
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        const locked = await client.query(
            `SELECT * FROM focus_sessions WHERE id = $1 AND user_id = $2 FOR UPDATE`,
            [sessionId, req.user!.id],
        );
        const session = locked.rows[0];
        if (!session) {
            await client.query('ROLLBACK');
            return sendError(res, 'Focus session not found', 404);
        }
        if (!sessionUserAgentMatches(session.user_agent, req.get('user-agent'))) {
            if (session.status === 'active') {
                await client.query(`UPDATE focus_sessions SET status = 'expired' WHERE id = $1`, [sessionId]);
            }
            await client.query('COMMIT');
            return sendError(res, 'Focus session client changed', 409);
        }
        if (session.status === 'completed') {
            await client.query('COMMIT');
            return sendSuccess(res, { awarded_points: Number(session.awarded_points), already_completed: true });
        }
        if (session.status !== 'active' || session.current_nonce_hash !== hashNonce(currentNonce)) {
            await client.query('ROLLBACK');
            return sendError(res, 'Focus session proof is invalid', 409);
        }
        if (Number(session.eligible_seconds) < Number(session.target_seconds) || Number(session.valid_heartbeat_count) < 20) {
            await client.query('ROLLBACK');
            return sendError(res, 'Focus session is not yet eligible', 409);
        }
        const reward = await awardEconomyReward({
            userId: req.user!.id,
            ruleKey: 'focus_25',
            sourceId: sessionId,
            idempotencyKey: `economy:focus:${sessionId}`,
            metadata: { target_seconds: Number(session.target_seconds), eligible_seconds: Number(session.eligible_seconds) },
        }, client);
        await client.query(
            `UPDATE focus_sessions SET status = 'completed', completed_at = NOW(), awarded_points = $1 WHERE id = $2`,
            [reward.awarded, sessionId],
        );
        await client.query('COMMIT');
        return sendSuccess(res, { reward, gold_balance: reward.spendablePoints }, 'Focus session completed');
    } catch (error) {
        await client.query('ROLLBACK');
        return mapEconomyError(res, error);
    } finally {
        client.release();
    }
}

async function listStudyShop(req: AuthRequest, res: Response) {
    if (!ensureAccount(req, res)) return;
    try {
        const result = await db.query(
            `SELECT ssi.item_id, ssi.title, ssi.description, ssi.kind, ssi.cost_points, ssi.rarity, ssi.asset_key,
                    (sui.user_id IS NOT NULL) AS owned,
                    (sue.item_id = ssi.item_id) AS equipped
             FROM study_shop_items ssi
             LEFT JOIN study_user_items sui ON sui.item_id = ssi.item_id AND sui.user_id = $1
             LEFT JOIN study_user_equipment sue ON sue.kind = ssi.kind AND sue.user_id = $1
             WHERE ssi.enabled = true ORDER BY ssi.cost_points, ssi.item_id`,
            [req.user!.id],
        );
        return sendSuccess(res, { items: result.rows, gold_balance: await getGoldBalance(req.user!.id) });
    } catch (error) {
        return mapEconomyError(res, error);
    }
}

async function purchaseStudyItem(req: AuthRequest, res: Response) {
    if (!ensureAccount(req, res)) return;
    const itemId = cleanId(req.params.itemId, 80);
    const idem = idempotencyKey(req);
    if (!itemId || !idem) return sendError(res, 'Valid item and Idempotency-Key required', 400);
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [req.user!.id]);
        const itemResult = await client.query(
            `SELECT * FROM study_shop_items WHERE item_id = $1 AND enabled = true FOR UPDATE`,
            [itemId],
        );
        const item = itemResult.rows[0];
        if (!item) {
            await client.query('ROLLBACK');
            return sendError(res, 'Study item not found', 404);
        }
        const owned = await client.query(
            `SELECT 1 FROM study_user_items WHERE user_id = $1 AND item_id = $2`,
            [req.user!.id, itemId],
        );
        if (owned.rows[0]) {
            await client.query('COMMIT');
            return sendSuccess(res, { item, already_owned: true, gold_balance: await getGoldBalance(req.user!.id) });
        }
        const spend = await spendUserPoints({
            userId: req.user!.id,
            amount: Number(item.cost_points),
            category: 'study',
            sourceType: 'study_shop_purchase',
            sourceId: itemId,
            idempotencyKey: `study-shop:${idem}`,
            metadata: { item_id: itemId, server_price: Number(item.cost_points) },
        }, client);
        await client.query(
            `INSERT INTO study_user_items (user_id, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [req.user!.id, itemId],
        );
        await client.query('COMMIT');
        return sendSuccess(res, { item, spend, gold_balance: spend.spendablePoints }, 'Study item purchased', null, 201);
    } catch (error) {
        await client.query('ROLLBACK');
        return mapEconomyError(res, error);
    } finally {
        client.release();
    }
}

async function equipStudyItem(req: AuthRequest, res: Response) {
    if (!ensureAccount(req, res)) return;
    const itemId = cleanId(req.params.itemId, 80);
    if (!itemId) return sendError(res, 'Valid item required', 400);
    try {
        const result = await db.query(
            `INSERT INTO study_user_equipment (user_id, kind, item_id, updated_at)
             SELECT $1, ssi.kind, ssi.item_id, NOW()
             FROM study_shop_items ssi
             JOIN study_user_items sui ON sui.item_id = ssi.item_id AND sui.user_id = $1
             WHERE ssi.item_id = $2 AND ssi.enabled = true
             ON CONFLICT (user_id, kind) DO UPDATE SET item_id = EXCLUDED.item_id, updated_at = NOW()
             RETURNING *`,
            [req.user!.id, itemId],
        );
        if (!result.rows[0]) return sendError(res, 'Purchase this Study item first', 409);
        return sendSuccess(res, { equipment: result.rows[0] }, 'Study item equipped');
    } catch (error) {
        return mapEconomyError(res, error);
    }
}

async function createAiMessage(req: AuthRequest, res: Response) {
    if (!ensureAccount(req, res)) return;
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    const idem = idempotencyKey(req);
    if (!idem || !message || message.length > 800 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(message)) {
        return sendError(res, 'A 1–800 character message and Idempotency-Key are required', 400);
    }
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        const existing = await client.query(
            `SELECT id, status, cost_points, created_at FROM ai_listener_messages
             WHERE user_id = $1 AND idempotency_key = $2`,
            [req.user!.id, idem],
        );
        if (existing.rows[0]) {
            await client.query('COMMIT');
            return sendSuccess(res, { message: existing.rows[0], duplicate: true, gold_balance: await getGoldBalance(req.user!.id) });
        }
        const messageId = crypto.randomUUID();
        const spend = await spendEconomyCost({
            userId: req.user!.id,
            ruleKey: 'ai_message',
            sourceId: messageId,
            idempotencyKey: `economy:ai-message:${idem}`,
            metadata: { message_id: messageId },
        }, client);
        const created = await client.query(
            `INSERT INTO ai_listener_messages (id, user_id, message, cost_points, ledger_id, idempotency_key)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, status, cost_points, created_at`,
            [messageId, req.user!.id, message, spend.rule.amount, spend.ledgerId, idem],
        );
        await client.query('COMMIT');
        return sendSuccess(res, { message: created.rows[0], gold_balance: spend.spendablePoints }, 'Message queued for RTAI', null, 201);
    } catch (error) {
        await client.query('ROLLBACK');
        return mapEconomyError(res, error);
    } finally {
        client.release();
    }
}

async function listAiMessages(req: AuthRequest, res: Response) {
    if (!ensureAccount(req, res)) return;
    try {
        const result = await db.query(
            `SELECT id, message, status, cost_points, moderation_reason, created_at, updated_at
             FROM ai_listener_messages WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
            [req.user!.id],
        );
        const rule = await getEconomyRule('ai_message');
        return sendSuccess(res, { messages: result.rows, message_cost: rule.amount, gold_balance: await getGoldBalance(req.user!.id) });
    } catch (error) {
        return mapEconomyError(res, error);
    }
}

router.use(webAuthMiddleware);
router.use(requireWebCsrf);
router.use(mutationLimiter);
router.get('/summary', handleSummary);
router.get('/rules', async (_req, res) => sendSuccess(res, { rules: await listEconomyRules() }));
router.post('/listening/start', startListening);
router.post('/listening/heartbeat', listeningHeartbeat);
router.post('/focus/start', startFocus);
router.post('/focus/heartbeat', focusHeartbeat);
router.post('/focus/complete', completeFocus);
router.get('/study/shop', listStudyShop);
router.post('/study/shop/:itemId/purchase', purchaseStudyItem);
router.post('/study/shop/:itemId/equip', equipStudyItem);
router.get('/ai/messages', listAiMessages);
router.post('/ai/messages', createAiMessage);

export default router;
