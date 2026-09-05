import { createHash } from 'crypto';
import { GAME_SCORE_MAXIMUM, GameSessionProofError } from './gameSessionProof';

/** Versioned, typed identity. Only its digest is persisted; never the nonce. */
export function gameScoreFingerprint(userId: string, gameId: string, body: any): string {
    if (typeof body?.session_id !== 'string' || !body.session_id
        || typeof body?.nonce !== 'string' || !body.nonce) {
        throw new GameSessionProofError('game_session_required', 400);
    }
    if (typeof body.client_round_id !== 'string' || !body.client_round_id
        || body.client_round_id.length > 120) {
        throw new GameSessionProofError('game_round_invalid', 400);
    }
    if (!Number.isSafeInteger(body.score) || body.score < 0 || body.score > GAME_SCORE_MAXIMUM) {
        throw new GameSessionProofError('game_score_invalid', 400);
    }
    if (!Number.isSafeInteger(body.play_duration_ms) || body.play_duration_ms < 0) {
        throw new GameSessionProofError('game_duration_invalid', 400);
    }
    return createHash('sha256').update(JSON.stringify([
        'mobile-game-score-v1', userId, gameId, body.client_round_id,
        body.session_id, body.nonce, body.score, body.play_duration_ms, body.submission_source,
    ]), 'utf8').digest('hex');
}
