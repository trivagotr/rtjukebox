import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';

export const GAME_SESSION_MINIMUM_SECONDS = 3;
export const GAME_SESSION_EXPIRES_SECONDS = 20 * 60;
export const GAME_SCORE_MAXIMUM = 1_000_000;

type GameSessionState = 'active' | 'submitting' | 'used';

interface GameSessionRecord {
    id: string;
    nonceHash: Buffer;
    userId: string;
    gameId: string;
    clientRoundId: string;
    startedAtMs: number;
    expiresAtMs: number;
    state: GameSessionState;
}

export interface GameSessionClaim {
    sessionId: string;
    userId: string;
    gameId: string;
    clientRoundId: string;
    startedAtMs: number;
}

export class GameSessionProofError extends Error {
    constructor(public readonly code: string, public readonly status: number) {
        super(code);
    }
}

const sessions = new Map<string, GameSessionRecord>();

function hashNonce(nonce: string) {
    return createHash('sha256').update(nonce, 'utf8').digest();
}

function cleanup(nowMs: number) {
    for (const [id, session] of sessions) {
        if (session.expiresAtMs <= nowMs) sessions.delete(id);
    }
}

export function issueGameSessionProof(input: {
    userId: string;
    gameId: string;
    clientRoundId: string;
    nowMs?: number;
}) {
    const nowMs = input.nowMs ?? Date.now();
    cleanup(nowMs);
    const nonce = randomBytes(32).toString('base64url');
    const session: GameSessionRecord = {
        id: randomUUID(),
        nonceHash: hashNonce(nonce),
        userId: input.userId,
        gameId: input.gameId,
        clientRoundId: input.clientRoundId,
        startedAtMs: nowMs,
        expiresAtMs: nowMs + GAME_SESSION_EXPIRES_SECONDS * 1_000,
        state: 'active',
    };
    sessions.set(session.id, session);
    return {
        session: {
            id: session.id,
            game_id: session.gameId,
            client_round_id: session.clientRoundId,
            started_at: new Date(session.startedAtMs).toISOString(),
        },
        nonce,
        minimum_play_seconds: GAME_SESSION_MINIMUM_SECONDS,
        expires_after_seconds: GAME_SESSION_EXPIRES_SECONDS,
    };
}

export function claimGameSessionProof(input: {
    sessionId: unknown;
    nonce: unknown;
    userId: string;
    gameId: string;
    clientRoundId: unknown;
    playDurationMs: unknown;
    score: unknown;
    nowMs?: number;
}): GameSessionClaim {
    const nowMs = input.nowMs ?? Date.now();
    cleanup(nowMs);
    if (typeof input.sessionId !== 'string' || typeof input.nonce !== 'string') {
        throw new GameSessionProofError('game_session_required', 400);
    }
    const session = sessions.get(input.sessionId);
    if (!session || session.expiresAtMs <= nowMs) {
        throw new GameSessionProofError('game_session_expired', 409);
    }
    if (session.state !== 'active') {
        throw new GameSessionProofError('game_session_already_used', 409);
    }
    const suppliedNonceHash = hashNonce(input.nonce);
    if (!timingSafeEqual(session.nonceHash, suppliedNonceHash)
        || session.userId !== input.userId
        || session.gameId !== input.gameId
        || session.clientRoundId !== input.clientRoundId) {
        throw new GameSessionProofError('game_session_invalid', 403);
    }
    const durationMs = Number(input.playDurationMs);
    const score = Number(input.score);
    const elapsedMs = nowMs - session.startedAtMs;
    if (!Number.isSafeInteger(durationMs)
        || durationMs < GAME_SESSION_MINIMUM_SECONDS * 1_000
        || durationMs > elapsedMs + 15_000
        || elapsedMs < GAME_SESSION_MINIMUM_SECONDS * 1_000) {
        throw new GameSessionProofError('game_duration_invalid', 400);
    }
    if (!Number.isSafeInteger(score) || score < 0 || score > GAME_SCORE_MAXIMUM) {
        throw new GameSessionProofError('game_score_invalid', 400);
    }
    session.state = 'submitting';
    return {
        sessionId: session.id,
        userId: session.userId,
        gameId: session.gameId,
        clientRoundId: session.clientRoundId,
        startedAtMs: session.startedAtMs,
    };
}

export function completeGameSessionProof(sessionId: string) {
    const session = sessions.get(sessionId);
    if (session?.state === 'submitting') session.state = 'used';
}

export function releaseGameSessionProof(sessionId: string) {
    const session = sessions.get(sessionId);
    if (session?.state === 'submitting') session.state = 'active';
}

export function resetGameSessionProofsForTests() {
    sessions.clear();
}
