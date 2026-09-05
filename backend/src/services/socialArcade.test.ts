import { describe, expect, it } from 'vitest';

import {
    advancePoolDiveState,
    choosePoolDivePrompt,
    createPoolDiveState,
    deriveArcadeNonce,
    hashArcadeNonce,
    nonceHashesMatch,
    normalizePoolDiveState,
    POOL_DIVE_TOTAL_ROUNDS,
    scorePoolDiveMove,
} from './socialArcade';

describe('Social Pool Dive engine', () => {
    it('never repeats the immediately previous prompt', () => {
        expect(choosePoolDivePrompt('left', () => 0)).toBe('center');
        expect(choosePoolDivePrompt('center', () => 1)).toBe('right');
    });

    it('scores only a correct response received in a plausible server-time window', () => {
        expect(scorePoolDiveMove('left', 'left', 140)).toMatchObject({ correct: true, validTiming: true, roundScore: 100 });
        expect(scorePoolDiveMove('left', 'left', 139)).toEqual({ correct: true, validTiming: false, roundScore: 0 });
        expect(scorePoolDiveMove('left', 'right', 500)).toEqual({ correct: false, validTiming: true, roundScore: 0 });
        expect(scorePoolDiveMove('left', 'left', 4_001)).toEqual({ correct: true, validTiming: false, roundScore: 0 });
    });

    it('advances exactly eight server-scored rounds', () => {
        let state = createPoolDiveState(new Date('2026-08-24T12:00:00.000Z'), 'left');
        for (let round = 0; round < POOL_DIVE_TOTAL_ROUNDS; round += 1) {
            const advanced = advancePoolDiveState(
                state,
                state.prompt,
                new Date(Date.parse(state.promptStartedAt) + 500),
                state.prompt === 'left' ? 'center' : 'left',
            );
            expect(advanced.final).toBe(round === POOL_DIVE_TOTAL_ROUNDS - 1);
            state = advanced.state;
        }
        expect(state.completedRounds).toBe(POOL_DIVE_TOTAL_ROUNDS);
        expect(state.score).toBeGreaterThan(0);
        expect(state.score).toBeLessThanOrEqual(800);
    });

    it('validates persisted state and compares nonces without plain-text storage', () => {
        const hash = hashArcadeNonce('nonce-value');
        expect(nonceHashesMatch(hash, hashArcadeNonce('nonce-value'))).toBe(true);
        expect(nonceHashesMatch(hash, hashArcadeNonce('different'))).toBe(false);
        expect(normalizePoolDiveState(createPoolDiveState(new Date('2026-08-24T12:00:00.000Z'), 'right'))).not.toBeNull();
        expect(normalizePoolDiveState({ version: 1, completedRounds: 99, score: 0, prompt: 'right', promptStartedAt: 'bad' })).toBeNull();
    });

    it('derives domain-separated round nonces without storing their plain text', () => {
        const secret = 's'.repeat(64);
        const first = deriveArcadeNonce(secret, 'session-1', 'round-1', 0);
        expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(deriveArcadeNonce(secret, 'session-1', 'round-1', 0)).toBe(first);
        expect(deriveArcadeNonce(secret, 'session-1', 'round-1', 1)).not.toBe(first);
        expect(() => deriveArcadeNonce('short', 'session-1', 'round-1', 0)).toThrow('SOCIAL_ARCADE_SECRET_UNAVAILABLE');
    });
});
