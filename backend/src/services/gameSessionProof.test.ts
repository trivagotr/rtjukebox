import { afterEach, describe, expect, it } from 'vitest';
import {
    claimGameSessionProof,
    completeGameSessionProof,
    GameSessionProofError,
    issueGameSessionProof,
    releaseGameSessionProof,
    resetGameSessionProofsForTests,
} from './gameSessionProof';

describe('game session proof', () => {
    afterEach(() => {
        resetGameSessionProofsForTests();
    });

    it('accepts one matching, server-timed submission and rejects replay', () => {
        const startedAt = Date.parse('2026-08-30T00:00:00Z');
        const proof = issueGameSessionProof({
            userId: 'user-1',
            gameId: 'game-1',
            clientRoundId: 'round-1',
            nowMs: startedAt,
        });
        const input = {
            sessionId: proof.session.id,
            nonce: proof.nonce,
            userId: 'user-1',
            gameId: 'game-1',
            clientRoundId: 'round-1',
            playDurationMs: 5_000,
            score: 120,
            nowMs: startedAt + 5_000,
        };
        expect(claimGameSessionProof(input)).toMatchObject({ sessionId: proof.session.id });
        completeGameSessionProof(proof.session.id);
        expect(() => claimGameSessionProof(input)).toThrowError(GameSessionProofError);
    });

    it('fails closed for a forged nonce, mismatched account, or implausible duration', () => {
        const startedAt = Date.parse('2026-08-30T00:00:00Z');
        const proof = issueGameSessionProof({
            userId: 'user-1',
            gameId: 'game-1',
            clientRoundId: 'round-1',
            nowMs: startedAt,
        });
        const base = {
            sessionId: proof.session.id,
            nonce: proof.nonce,
            userId: 'user-1',
            gameId: 'game-1',
            clientRoundId: 'round-1',
            score: 10,
            nowMs: startedAt + 4_000,
        };
        expect(() => claimGameSessionProof({ ...base, nonce: 'forged', playDurationMs: 4_000 }))
            .toThrowError('game_session_invalid');
        expect(() => claimGameSessionProof({ ...base, userId: 'user-2', playDurationMs: 4_000 }))
            .toThrowError('game_session_invalid');
        expect(() => claimGameSessionProof({ ...base, playDurationMs: 120_000 }))
            .toThrowError('game_duration_invalid');
    });

    it('can release a reservation after a transient server failure', () => {
        const startedAt = Date.parse('2026-08-30T00:00:00Z');
        const proof = issueGameSessionProof({
            userId: 'user-1',
            gameId: 'game-1',
            clientRoundId: 'round-1',
            nowMs: startedAt,
        });
        const input = {
            sessionId: proof.session.id,
            nonce: proof.nonce,
            userId: 'user-1',
            gameId: 'game-1',
            clientRoundId: 'round-1',
            playDurationMs: 5_000,
            score: 50,
            nowMs: startedAt + 5_000,
        };
        claimGameSessionProof(input);
        releaseGameSessionProof(proof.session.id);
        expect(claimGameSessionProof(input)).toMatchObject({ sessionId: proof.session.id });
    });
});
