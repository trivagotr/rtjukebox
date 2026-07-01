import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../db';
import { getIO } from '../socket';
import { optionalAuth, AuthRequest } from '../middleware/auth';
import { sendSuccess, sendError } from '../utils/response';

const router = Router();

const AGENT_TOKEN_ENV_NAMES = [
    'NEXT_SONG_VOTING_AGENT_TOKEN',
    'LOCAL_VOTING_AGENT_TOKEN'
];

const VOTE_REWARD_POINTS = Number.parseInt(process.env.NEXT_SONG_VOTING_VOTE_REWARD_POINTS || '1', 10);
const WINNER_REWARD_POINTS = Number.parseInt(process.env.NEXT_SONG_VOTING_WINNER_REWARD_POINTS || '3', 10);

const uuidSchema = z.string().uuid();
const stringOrNull = z.string().trim().min(1).max(1000).nullable().optional();
const disallowedPlaybackFieldPattern = /^(songId|song_id|album|durationSeconds|duration_seconds|coverUrl|cover_url|previewUrl|preview_url|streamUrl|stream_url|filePath|file_path|localPath|local_path|path|absolutePath|absolute_path)$/i;
const disallowedCandidateFieldPattern = /^(songId|song_id|album|durationSeconds|duration_seconds|coverUrl|cover_url|previewUrl|preview_url|streamUrl|stream_url|filePath|file_path|localPath|local_path|path|absolutePath|absolute_path|metadata)$/i;

const candidateSchema = z.object({
    externalId: stringOrNull,
    external_id: stringOrNull,
    title: z.string().trim().min(1).max(200),
    artist: z.string().trim().max(200).nullable().optional(),
    artworkUrl: stringOrNull,
    artwork_url: stringOrNull
}).passthrough();

const agentRoundSchema = z.object({
    action: z.enum(['start', 'update', 'lock', 'resolve', 'cancel']).optional(),
    roundId: uuidSchema.optional(),
    round_id: uuidSchema.optional(),
    deviceId: uuidSchema.nullable().optional(),
    device_id: uuidSchema.nullable().optional(),
    prompt: z.string().trim().max(300).nullable().optional(),
    expiresAt: z.string().trim().nullable().optional(),
    expires_at: z.string().trim().nullable().optional(),
    winningCandidateId: uuidSchema.optional(),
    winning_candidate_id: uuidSchema.optional(),
    agentId: z.string().trim().max(120).nullable().optional(),
    agent_id: z.string().trim().max(120).nullable().optional(),
    candidates: z.array(candidateSchema).min(2).max(5).optional(),
    metadata: z.record(z.unknown()).optional()
}).passthrough();

const voteSchema = z.object({
    candidateId: uuidSchema.optional(),
    candidate_id: uuidSchema.optional(),
    clientId: z.string().trim().min(8).max(200).optional(),
    client_id: z.string().trim().min(8).max(200).optional()
}).passthrough();

type CandidateInput = {
    externalId: string | null;
    title: string;
    artist: string | null;
    artworkUrl: string | null;
    position: number;
};

type AgentRoundBody = z.infer<typeof agentRoundSchema>;

function getAgentToken(): string | null {
    for (const name of AGENT_TOKEN_ENV_NAMES) {
        const token = process.env[name]?.trim();
        if (token) return token;
    }
    return null;
}

function timingSafeEquals(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function requireAgentAuth(req: Request, res: Response, next: NextFunction) {
    const expectedToken = getAgentToken();
    if (!expectedToken) {
        return sendError(res, 'Next song voting agent token is not configured', 503, 'NEXT_SONG_VOTING_AGENT_TOKEN_MISSING');
    }

    const authHeader = req.header('authorization') || '';
    const bearerToken = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    const providedToken = bearerToken || req.header('x-agent-token') || req.header('x-next-song-voting-agent-token');

    if (!providedToken || !timingSafeEquals(providedToken, expectedToken)) {
        return sendError(res, 'Invalid next song voting agent token', 401, 'INVALID_AGENT_TOKEN');
    }

    next();
}

function pickString(...values: Array<unknown>): string | null {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return null;
}

function pickNumber(...values: Array<unknown>): number | null {
    for (const value of values) {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
    }
    return null;
}

function parseDate(value: string | null | undefined): string | null {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new Error('INVALID_EXPIRES_AT');
    }
    return date.toISOString();
}

function isUuid(value: string | null): boolean {
    return !value || uuidSchema.safeParse(value).success;
}

function looksLikeLocalPath(value: string): boolean {
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (/^https?:\/\//i.test(trimmed)) return false;
    if (/^\/api\/uploads\//i.test(trimmed)) return false;
    return /^file:\/\//i.test(trimmed)
        || /^[a-z]:[\\/]/i.test(trimmed)
        || /^\\\\/.test(trimmed)
        || /^\/(?:users|home|var|tmp|etc|mnt|volumes|inetpub|windows)\b/i.test(trimmed)
        || /\\/.test(trimmed);
}

function ensurePublicValue(value: string | null, fieldName: string): string | null {
    if (!value) return null;
    if (looksLikeLocalPath(value)) {
        throw new Error(`LOCAL_PATH_NOT_ALLOWED:${fieldName}`);
    }
    return value;
}

function assertNoPlaybackFields(value: unknown, fieldPath = 'candidate') {
    if (!value || typeof value !== 'object') return;

    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
        const nextPath = `${fieldPath}.${key}`;
        if (disallowedCandidateFieldPattern.test(key)) {
            throw new Error(`PLAYBACK_FIELD_NOT_ALLOWED:${nextPath}`);
        }
        if (typeof entry === 'string' && looksLikeLocalPath(entry)) {
            throw new Error(`LOCAL_PATH_NOT_ALLOWED:${nextPath}`);
        }
        if (entry && typeof entry === 'object') {
            assertNoPlaybackFields(entry, nextPath);
        }
    }
}

function assertNoLocalPlaybackPayload(value: unknown, fieldPath = 'payload') {
    if (!value || typeof value !== 'object') return;

    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
        const nextPath = `${fieldPath}.${key}`;
        if (disallowedPlaybackFieldPattern.test(key)) {
            throw new Error(`PLAYBACK_FIELD_NOT_ALLOWED:${nextPath}`);
        }
        if (typeof entry === 'string' && looksLikeLocalPath(entry)) {
            throw new Error(`LOCAL_PATH_NOT_ALLOWED:${nextPath}`);
        }
        if (entry && typeof entry === 'object') {
            assertNoLocalPlaybackPayload(entry, nextPath);
        }
    }
}

function sanitizeMetadata(value: unknown, depth = 0): unknown {
    if (depth > 4) return null;
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') return looksLikeLocalPath(value) ? null : value;
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value.map((entry) => sanitizeMetadata(entry, depth + 1)).filter((entry) => entry !== null);
    if (typeof value === 'object') {
        const output: Record<string, unknown> = {};
        for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
            if (/^(path|filePath|file_path|localPath|local_path|absolutePath|absolute_path)$/i.test(key)) continue;
            const sanitized = sanitizeMetadata(entry, depth + 1);
            if (sanitized !== null) output[key] = sanitized;
        }
        return output;
    }
    return null;
}

function normalizeCandidate(candidate: z.infer<typeof candidateSchema>, position: number): CandidateInput {
    assertNoPlaybackFields(candidate);
    const externalId = pickString(candidate.externalId, candidate.external_id);
    const artworkUrl = pickString(candidate.artworkUrl, candidate.artwork_url);

    return {
        externalId: ensurePublicValue(externalId, 'externalId'),
        title: candidate.title,
        artist: pickString(candidate.artist),
        artworkUrl: ensurePublicValue(artworkUrl, 'artworkUrl'),
        position
    };
}

function getRoundId(body: AgentRoundBody): string | null {
    return pickString(body.roundId, body.round_id);
}

function getDeviceId(body: AgentRoundBody): string | null {
    return pickString(body.deviceId, body.device_id);
}

function getAgentId(body: AgentRoundBody): string | null {
    return pickString(body.agentId, body.agent_id);
}

function getWinningCandidateId(body: AgentRoundBody): string | null {
    return pickString(body.winningCandidateId, body.winning_candidate_id);
}

function getClientId(req: Request): string | null {
    return pickString(
        req.body?.clientId,
        req.body?.client_id,
        req.header('x-client-id'),
        req.header('x-device-id'),
        req.query.clientId,
        req.query.client_id
    );
}

function getIpAddress(req: Request): string {
    const forwardedFor = req.header('x-forwarded-for');
    if (forwardedFor) return forwardedFor.split(',')[0].trim();
    return req.ip || req.socket.remoteAddress || 'unknown';
}

function hashValue(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function serializeCandidate(row: any) {
    return {
        id: row.id,
        externalId: row.external_id,
        title: row.title,
        artist: row.artist,
        artworkUrl: row.artwork_url,
        voteScore: Number(row.vote_score || 0),
        voteCount: Number(row.vote_count || 0),
        position: row.position
    };
}

function serializeRound(row: any, candidates: any[], userVoteCandidateId?: string | null) {
    return {
        id: row.id,
        deviceId: row.device_id,
        status: row.status,
        prompt: row.prompt,
        startedAt: row.started_at,
        lockedAt: row.locked_at,
        resolvedAt: row.resolved_at,
        cancelledAt: row.cancelled_at,
        expiresAt: row.expires_at,
        winningCandidateId: row.winning_candidate_id,
        voteCount: candidates.reduce((total, candidate) => total + Number(candidate.vote_count || 0), 0),
        candidates: candidates.map(serializeCandidate),
        userVoteCandidateId: userVoteCandidateId || null
    };
}

async function getRoundPayload(roundId: string, voter?: { userId?: string | null; guestFingerprint?: string | null }) {
    const roundResult = await db.query('SELECT * FROM next_song_vote_rounds WHERE id = $1', [roundId]);
    const round = roundResult.rows[0];
    if (!round) return null;

    const candidatesResult = await db.query(`
        SELECT
            c.*,
            COALESCE(SUM(v.vote_weight), 0) AS vote_score,
            COUNT(v.id) AS vote_count
        FROM next_song_vote_candidates c
        LEFT JOIN next_song_votes v ON v.candidate_id = c.id
        WHERE c.round_id = $1
        GROUP BY c.id
        ORDER BY c.position ASC, c.created_at ASC
    `, [roundId]);

    let userVoteCandidateId: string | null = null;
    if (voter?.userId) {
        const voteResult = await db.query(
            'SELECT candidate_id FROM next_song_votes WHERE round_id = $1 AND user_id = $2 LIMIT 1',
            [roundId, voter.userId]
        );
        userVoteCandidateId = voteResult.rows[0]?.candidate_id || null;
    } else if (voter?.guestFingerprint) {
        const voteResult = await db.query(
            'SELECT candidate_id FROM next_song_votes WHERE round_id = $1 AND guest_fingerprint = $2 LIMIT 1',
            [roundId, voter.guestFingerprint]
        );
        userVoteCandidateId = voteResult.rows[0]?.candidate_id || null;
    }

    return serializeRound(round, candidatesResult.rows, userVoteCandidateId);
}

function emitRoundEvent(eventName: string, payload: any) {
    const io = getIO();
    if (!io || !payload) return;
    if (payload.deviceId) {
        const roomName = `device:${payload.deviceId}`;
        io.to(roomName).emit(eventName, payload);
        io.except(roomName).emit(eventName, payload);
        return;
    }
    io.emit(eventName, payload);
}

async function awardWinnerRewards(roundId: string, winningCandidateId: string) {
    if (WINNER_REWARD_POINTS <= 0) return 0;

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        const rewardResult = await client.query(`
            INSERT INTO next_song_vote_rewards (round_id, user_id, reward_type, points)
            SELECT $1, user_id, 'winner', $3
            FROM next_song_votes
            WHERE round_id = $1
              AND candidate_id = $2
              AND user_id IS NOT NULL
            ON CONFLICT (round_id, user_id, reward_type) DO NOTHING
            RETURNING user_id
        `, [roundId, winningCandidateId, WINNER_REWARD_POINTS]);

        if (rewardResult.rows.length > 0) {
            const userIds = rewardResult.rows.map((row: { user_id: string }) => row.user_id);
            await client.query('UPDATE users SET rank_score = rank_score + $1 WHERE id = ANY($2::uuid[])', [WINNER_REWARD_POINTS, userIds]);
        }

        await client.query('COMMIT');
        return rewardResult.rows.length;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

router.get('/rounds/active', optionalAuth, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const deviceId = pickString(req.query.deviceId, req.query.device_id);
    const clientId = getClientId(req);
    const guestFingerprint = clientId ? hashValue(clientId) : null;

    if (!isUuid(deviceId)) {
        return sendError(res, 'deviceId must be a valid UUID', 400, 'INVALID_DEVICE_ID');
    }

    try {
        const roundResult = await db.query(`
            SELECT *
            FROM next_song_vote_rounds
            WHERE status = 'active'
              AND (expires_at IS NULL OR expires_at > NOW())
              AND ($1::uuid IS NULL OR device_id = $1::uuid)
            ORDER BY started_at DESC
            LIMIT 1
        `, [deviceId]);

        if (roundResult.rows.length === 0) {
            return sendSuccess(res, null, 'No active next song voting round');
        }

        const payload = await getRoundPayload(roundResult.rows[0].id, {
            userId: authReq.user?.id,
            guestFingerprint
        });

        return sendSuccess(res, payload);
    } catch (error) {
        console.error('Next song voting active round error:', error);
        return sendError(res, 'Failed to load active next song voting round', 500);
    }
});

router.post('/rounds/:roundId/votes', optionalAuth, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const parsed = voteSchema.safeParse(req.body || {});
    if (!parsed.success) {
        return sendError(res, 'Invalid vote payload', 400, 'INVALID_VOTE_PAYLOAD');
    }

    const roundId = req.params.roundId;
    const candidateId = pickString(parsed.data.candidateId, parsed.data.candidate_id);
    if (!isUuid(roundId)) {
        return sendError(res, 'roundId must be a valid UUID', 400, 'INVALID_ROUND_ID');
    }
    if (!candidateId) {
        return sendError(res, 'candidateId is required', 400, 'CANDIDATE_ID_REQUIRED');
    }

    const clientId = getClientId(req);
    const guestFingerprint = clientId ? hashValue(clientId) : null;
    const ipHash = hashValue(getIpAddress(req));
    const userAgentHash = hashValue(req.header('user-agent') || 'unknown');
    const userId = authReq.user?.id || null;

    if (!userId && !guestFingerprint) {
        return sendError(res, 'Authentication or clientId is required to vote', 401, 'VOTER_ID_REQUIRED');
    }

    const client = await db.pool.connect();
    let rewardPoints = 0;

    try {
        await client.query('BEGIN');

        const targetResult = await client.query(`
            SELECT r.status, r.expires_at, c.id AS candidate_id
            FROM next_song_vote_rounds r
            INNER JOIN next_song_vote_candidates c ON c.round_id = r.id
            WHERE r.id = $1 AND c.id = $2
            FOR UPDATE OF r
        `, [roundId, candidateId]);

        const target = targetResult.rows[0];
        if (!target) {
            await client.query('ROLLBACK');
            return sendError(res, 'Round or candidate not found', 404, 'ROUND_OR_CANDIDATE_NOT_FOUND');
        }

        if (target.status !== 'active') {
            await client.query('ROLLBACK');
            return sendError(res, 'Voting round is not active', 409, 'ROUND_NOT_ACTIVE');
        }

        if (target.expires_at && new Date(target.expires_at).getTime() <= Date.now()) {
            await client.query('ROLLBACK');
            return sendError(res, 'Voting round has expired', 409, 'ROUND_EXPIRED');
        }

        let voteWeight = 1;
        if (userId) {
            const userResult = await client.query('SELECT is_guest, is_banned, vote_weight FROM users WHERE id = $1', [userId]);
            const user = userResult.rows[0];
            if (!user || user.is_banned) {
                await client.query('ROLLBACK');
                return sendError(res, 'User is not allowed to vote', 403, 'USER_NOT_ALLOWED');
            }
            voteWeight = Number(user.vote_weight || 1);
        }

        const existingVoteResult = userId
            ? await client.query('SELECT id, candidate_id FROM next_song_votes WHERE round_id = $1 AND user_id = $2 LIMIT 1', [roundId, userId])
            : await client.query('SELECT id, candidate_id FROM next_song_votes WHERE round_id = $1 AND guest_fingerprint = $2 LIMIT 1', [roundId, guestFingerprint]);

        const existingVote = existingVoteResult.rows[0];
        if (existingVote) {
            if (existingVote.candidate_id !== candidateId) {
                await client.query(
                    'UPDATE next_song_votes SET candidate_id = $1, vote_weight = $2, updated_at = NOW() WHERE id = $3',
                    [candidateId, voteWeight, existingVote.id]
                );
            }
        } else {
            if (!userId) {
                const guestCollision = await client.query(`
                    SELECT id
                    FROM next_song_votes
                    WHERE round_id = $1
                      AND user_id IS NULL
                      AND ip_hash = $2
                      AND user_agent_hash = $3
                    LIMIT 1
                `, [roundId, ipHash, userAgentHash]);

                if (guestCollision.rows.length > 0) {
                    await client.query('ROLLBACK');
                    return sendError(res, 'A vote was already cast from this browser for this round', 409, 'GUEST_VOTE_ALREADY_EXISTS');
                }
            }

            await client.query(`
                INSERT INTO next_song_votes (round_id, candidate_id, user_id, guest_fingerprint, ip_hash, user_agent_hash, vote_weight)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [roundId, candidateId, userId, guestFingerprint, ipHash, userAgentHash, voteWeight]);
        }

        if (userId && VOTE_REWARD_POINTS > 0) {
            const rewardResult = await client.query(`
                INSERT INTO next_song_vote_rewards (round_id, user_id, reward_type, points)
                VALUES ($1, $2, 'vote', $3)
                ON CONFLICT (round_id, user_id, reward_type) DO NOTHING
                RETURNING id
            `, [roundId, userId, VOTE_REWARD_POINTS]);

            if (rewardResult.rows.length > 0) {
                await client.query('UPDATE users SET rank_score = rank_score + $1 WHERE id = $2', [VOTE_REWARD_POINTS, userId]);
                rewardPoints = VOTE_REWARD_POINTS;
            }
        }

        await client.query('COMMIT');

        const payload = await getRoundPayload(roundId, { userId, guestFingerprint });
        emitRoundEvent('next_vote_round_updated', payload);

        return sendSuccess(res, {
            round: payload,
            reward: {
                points: rewardPoints,
                idempotent: rewardPoints === 0
            }
        }, 'Vote saved');
    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('Next song voting vote error:', error);
        if (error?.code === '23505') {
            return sendError(res, 'Vote already exists for this round', 409, 'VOTE_ALREADY_EXISTS');
        }
        return sendError(res, 'Failed to save vote', 500);
    } finally {
        client.release();
    }
});

router.post('/agent/rounds', requireAgentAuth, async (req: Request, res: Response) => {
    const parsed = agentRoundSchema.safeParse(req.body || {});
    if (!parsed.success) {
        return sendError(res, 'Invalid agent round payload', 400, 'INVALID_AGENT_ROUND_PAYLOAD');
    }

    const body = parsed.data;
    const action = body.action || (getRoundId(body) ? 'update' : 'start');

    try {
        assertNoLocalPlaybackPayload(body);

        if (action === 'start') {
            if (!body.candidates || body.candidates.length < 2) {
                return sendError(res, 'At least two candidates are required to start a round', 400, 'CANDIDATES_REQUIRED');
            }

            const deviceId = getDeviceId(body);
            const expiresAt = parseDate(pickString(body.expiresAt, body.expires_at));
            const candidates = body.candidates.map((candidate, index) => normalizeCandidate(candidate, index + 1));
            const client = await db.pool.connect();
            let roundId: string;

            try {
                await client.query('BEGIN');

                const previousRounds = await client.query(`
                    SELECT id
                    FROM next_song_vote_rounds
                    WHERE status = 'active'
                      AND device_id IS NOT DISTINCT FROM $1::uuid
                `, [deviceId]);

                const roundResult = await client.query(`
                    INSERT INTO next_song_vote_rounds (device_id, prompt, expires_at, agent_id, metadata)
                    VALUES ($1, $2, $3, $4, $5)
                    RETURNING id
                `, [
                    deviceId,
                    pickString(body.prompt),
                    expiresAt,
                    getAgentId(body),
                    JSON.stringify({})
                ]);
                roundId = roundResult.rows[0].id;

                for (const candidate of candidates) {
                    await client.query(`
                        INSERT INTO next_song_vote_candidates (
                            round_id, external_id, song_id, title, artist, album, duration_seconds,
                            artwork_url, preview_url, stream_url, metadata, position
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                    `, [
                        roundId,
                        candidate.externalId,
                        null,
                        candidate.title,
                        candidate.artist,
                        null,
                        null,
                        candidate.artworkUrl,
                        null,
                        null,
                        JSON.stringify({}),
                        candidate.position
                    ]);
                }

                if (previousRounds.rows.length > 0) {
                    const previousIds = previousRounds.rows.map((row: { id: string }) => row.id);
                    await client.query(`
                        UPDATE next_song_vote_rounds
                        SET status = 'cancelled',
                            cancelled_at = NOW(),
                            updated_at = NOW(),
                            metadata = COALESCE(metadata, '{}'::jsonb) || '{"cancel_reason":"superseded_by_new_round"}'::jsonb
                        WHERE id = ANY($1::uuid[])
                    `, [previousIds]);
                }

                await client.query('COMMIT');
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }

            const payload = await getRoundPayload(roundId!);
            emitRoundEvent('next_vote_round_started', payload);
            return sendSuccess(res, payload, 'Next song voting round started', null, 201);
        }

        const roundId = getRoundId(body);
        if (!roundId) {
            return sendError(res, 'roundId is required', 400, 'ROUND_ID_REQUIRED');
        }

        if (action === 'update') {
            const expiresAt = parseDate(pickString(body.expiresAt, body.expires_at));
            const updateResult = await db.query(`
                UPDATE next_song_vote_rounds
                SET prompt = COALESCE($2, prompt),
                    expires_at = COALESCE($3, expires_at),
                    updated_at = NOW()
                WHERE id = $1 AND status = 'active'
                RETURNING id
            `, [
                roundId,
                pickString(body.prompt),
                expiresAt
            ]);

            if (updateResult.rows.length === 0) {
                return sendError(res, 'Active round not found', 404, 'ACTIVE_ROUND_NOT_FOUND');
            }

            const payload = await getRoundPayload(roundId);
            if (!payload) return sendError(res, 'Round not found', 404, 'ROUND_NOT_FOUND');
            emitRoundEvent('next_vote_round_updated', payload);
            return sendSuccess(res, payload, 'Next song voting round updated');
        }

        if (action === 'lock') {
            const result = await db.query(`
                UPDATE next_song_vote_rounds
                SET status = 'locked', locked_at = NOW(), updated_at = NOW()
                WHERE id = $1 AND status = 'active'
                RETURNING id
            `, [roundId]);

            if (result.rows.length === 0) {
                return sendError(res, 'Active round not found', 404, 'ACTIVE_ROUND_NOT_FOUND');
            }

            const payload = await getRoundPayload(roundId);
            emitRoundEvent('next_vote_round_locked', payload);
            return sendSuccess(res, payload, 'Next song voting round locked');
        }

        if (action === 'resolve') {
            let winningCandidateId = getWinningCandidateId(body);
            if (!winningCandidateId) {
                const winnerResult = await db.query(`
                    SELECT c.id
                    FROM next_song_vote_candidates c
                    LEFT JOIN next_song_votes v ON v.candidate_id = c.id
                    WHERE c.round_id = $1
                    GROUP BY c.id
                    ORDER BY COALESCE(SUM(v.vote_weight), 0) DESC, c.position ASC, c.created_at ASC
                    LIMIT 1
                `, [roundId]);
                winningCandidateId = winnerResult.rows[0]?.id || null;
            }

            if (!winningCandidateId) {
                return sendError(res, 'Winning candidate could not be resolved', 409, 'WINNER_NOT_FOUND');
            }

            const roundStateResult = await db.query(
                'SELECT status, winning_candidate_id FROM next_song_vote_rounds WHERE id = $1',
                [roundId]
            );
            const roundState = roundStateResult.rows[0];
            if (!roundState) {
                return sendError(res, 'Round not found', 404, 'ROUND_NOT_FOUND');
            }
            if (roundState.status === 'cancelled') {
                return sendError(res, 'Cancelled round cannot be resolved', 409, 'ROUND_CANCELLED');
            }
            if (roundState.status === 'resolved') {
                if (roundState.winning_candidate_id !== winningCandidateId) {
                    return sendError(res, 'Round was already resolved with a different winner', 409, 'ROUND_ALREADY_RESOLVED');
                }
                const payload = await getRoundPayload(roundId);
                return sendSuccess(res, {
                    round: payload,
                    winnerRewardedUsers: 0
                }, 'Next song voting round already resolved');
            }

            const candidateResult = await db.query(
                'SELECT id FROM next_song_vote_candidates WHERE id = $1 AND round_id = $2',
                [winningCandidateId, roundId]
            );
            if (candidateResult.rows.length === 0) {
                return sendError(res, 'Winning candidate does not belong to this round', 400, 'INVALID_WINNING_CANDIDATE');
            }

            const result = await db.query(`
                UPDATE next_song_vote_rounds
                SET status = 'resolved',
                    resolved_at = COALESCE(resolved_at, NOW()),
                    winning_candidate_id = $2,
                    updated_at = NOW()
                WHERE id = $1 AND status IN ('active', 'locked')
                RETURNING id
            `, [roundId, winningCandidateId]);

            if (result.rows.length === 0) {
                return sendError(res, 'Round not found or cannot be resolved', 404, 'ROUND_NOT_RESOLVABLE');
            }

            const awardedWinnerCount = await awardWinnerRewards(roundId, winningCandidateId);
            const payload = await getRoundPayload(roundId);
            emitRoundEvent('next_vote_round_resolved', payload);
            return sendSuccess(res, {
                round: payload,
                winnerRewardedUsers: awardedWinnerCount
            }, 'Next song voting round resolved');
        }

        if (action === 'cancel') {
            const result = await db.query(`
                UPDATE next_song_vote_rounds
                SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
                WHERE id = $1 AND status IN ('active', 'locked')
                RETURNING id
            `, [roundId]);

            if (result.rows.length === 0) {
                return sendError(res, 'Round not found or cannot be cancelled', 404, 'ROUND_NOT_CANCELLABLE');
            }

            const payload = await getRoundPayload(roundId);
            emitRoundEvent('next_vote_round_cancelled', payload);
            return sendSuccess(res, payload, 'Next song voting round cancelled');
        }

        return sendError(res, 'Unsupported action', 400, 'UNSUPPORTED_ACTION');
    } catch (error: any) {
        console.error('Next song voting agent error:', error);
        if (error?.message === 'INVALID_EXPIRES_AT') {
            return sendError(res, 'expiresAt must be a valid date string', 400, 'INVALID_EXPIRES_AT');
        }
        if (typeof error?.message === 'string' && error.message.startsWith('LOCAL_PATH_NOT_ALLOWED:')) {
            return sendError(res, 'Local filesystem paths are not allowed in voting payloads', 400, 'LOCAL_PATH_NOT_ALLOWED');
        }
        if (typeof error?.message === 'string' && error.message.startsWith('PLAYBACK_FIELD_NOT_ALLOWED:')) {
            return sendError(res, 'Playback/local file fields are not allowed in next song voting candidates', 400, 'PLAYBACK_FIELD_NOT_ALLOWED');
        }
        return sendError(res, 'Failed to process next song voting round', 500);
    }
});

export const __nextSongVotingTest = {
    agentRoundSchema,
    assertNoPlaybackFields,
    assertNoLocalPlaybackPayload,
    looksLikeLocalPath,
    normalizeCandidate,
    serializeCandidate
};

export default router;
