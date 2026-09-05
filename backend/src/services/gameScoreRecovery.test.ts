import { describe, expect, it } from 'vitest';
import { gameScoreFingerprint } from './gameScoreRecovery';

const body = { session_id: 'session', nonce: 'secret-nonce', client_round_id: 'round',
    score: 7, play_duration_ms: 5000, submission_source: 'mobile_game' };
describe('canonical game request identity', () => {
    it('is stable under object key ordering and does not persist a raw nonce', () => {
        const hash = gameScoreFingerprint('user', 'game', body);
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
        expect(hash).not.toContain(body.nonce);
        expect(gameScoreFingerprint('user', 'game', Object.fromEntries(Object.entries(body).reverse()))).toBe(hash);
    });
    it.each(['score', 'play_duration_ms', 'session_id', 'nonce', 'client_round_id', 'submission_source'])('binds %s', field => {
        const changed = { ...body, [field]: typeof body[field as keyof typeof body] === 'number' ? 9 : 'changed' };
        expect(gameScoreFingerprint('user', 'game', changed)).not.toBe(gameScoreFingerprint('user', 'game', body));
    });
    it('binds both authenticated user and game', () => {
        expect(gameScoreFingerprint('other', 'game', body)).not.toBe(gameScoreFingerprint('user', 'game', body));
        expect(gameScoreFingerprint('user', 'other', body)).not.toBe(gameScoreFingerprint('user', 'game', body));
    });
    it.each([undefined, null, {}, { ...body, session_id: undefined }, { ...body, nonce: '' },
        { ...body, score: '7' }, { ...body, score: 1.2 }, { ...body, score: -1 },
        { ...body, play_duration_ms: NaN }, { ...body, client_round_id: 'a'.repeat(121) }])('rejects malformed proof payload %#', value => {
        expect(() => gameScoreFingerprint('user', 'game', value)).toThrow();
    });
});
