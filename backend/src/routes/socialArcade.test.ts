import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createPoolDiveState, deriveArcadeNonce, hashArcadeNonce } from '../services/socialArcade';

const {
    clientQuery,
    clientRelease,
    poolConnect,
    sendSuccess,
    sendError,
    awardUserPoints,
} = vi.hoisted(() => ({
    clientQuery: vi.fn(),
    clientRelease: vi.fn(),
    poolConnect: vi.fn(),
    sendSuccess: vi.fn(),
    sendError: vi.fn(),
    awardUserPoints: vi.fn(),
}));

vi.mock('../db', () => ({
    db: { pool: { connect: poolConnect } },
}));

vi.mock('../utils/response', () => ({ sendSuccess, sendError }));

vi.mock('../services/gamification', async () => {
    const actual = await vi.importActual<typeof import('../services/gamification')>('../services/gamification');
    return { ...actual, awardUserPoints };
});

import { handlePoolDiveAction, handlePoolDiveStart } from './socialArcade';

const userId = '11111111-1111-4111-8111-111111111111';
const gameId = '22222222-2222-4222-8222-222222222222';
const sessionId = '33333333-3333-4333-8333-333333333333';
const clientRoundId = 'social-pool-dive:44444444-4444-4444-8444-444444444444';

function request(body: Record<string, unknown> = {}, params: Record<string, string> = {}) {
    return {
        user: { id: userId, role: 'user' },
        body,
        params,
        ip: '127.0.0.1',
        get: vi.fn((name: string) => name.toLowerCase() === 'user-agent' ? 'Social arcade test' : undefined),
    } as any;
}

describe('Social Pool Dive routes', () => {
    beforeEach(() => {
        process.env.JWT_SECRET = 'server-secret-for-social-arcade-tests-'.repeat(2);
        process.env.SOCIAL_ARCADE_NONCE_SECRET = 'dedicated-social-arcade-secret-for-tests-'.repeat(2);
        clientQuery.mockReset();
        clientRelease.mockReset();
        poolConnect.mockReset().mockResolvedValue({ query: clientQuery, release: clientRelease });
        sendSuccess.mockReset();
        sendError.mockReset();
        awardUserPoints.mockReset().mockResolvedValue({ spendablePoints: 321 });
    });

    it('starts with a derived nonce while persisting only its hash', async () => {
        clientQuery.mockImplementation(async (sql: string) => {
            if (sql.includes('FROM arcade_games')) return {
                rows: [{ id: gameId, slug: 'pool-dive', title: 'Pool Dive', point_rate: 0.02, daily_point_limit: 10 }],
            };
            if (sql.includes('INSERT INTO arcade_game_sessions')) return {
                rows: [{ id: sessionId, started_at: new Date(), expires_at: new Date(Date.now() + 120_000) }],
            };
            return { rows: [] };
        });

        const req = request();
        req.ip = '178.233.16.223:37530';
        await handlePoolDiveStart(req, {} as any);

        const insert = clientQuery.mock.calls.find((call) => String(call[0]).includes('INSERT INTO arcade_game_sessions'))!;
        const response = sendSuccess.mock.calls[0][1];
        expect(response.session.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(response.session.nonce).toBe(deriveArcadeNonce(
            process.env.SOCIAL_ARCADE_NONCE_SECRET!,
            insert[1][0],
            insert[1][3],
            0,
        ));
        expect(insert[1][4]).toBe(hashArcadeNonce(response.session.nonce));
        expect(insert[1][6]).toBe('178.233.16.223');
        expect(insert[1][8]).not.toContain(response.session.nonce);
        expect(response.session).toMatchObject({ round: 1, totalRounds: 8, score: 0, final: false });
        expect(clientQuery.mock.calls.at(-1)?.[0]).toBe('COMMIT');
        expect(clientRelease).toHaveBeenCalledOnce();
    });

    it('rolls back without creating a session when the arcade nonce secret is too short', async () => {
        process.env.SOCIAL_ARCADE_NONCE_SECRET = 'too-short';
        clientQuery.mockImplementation(async (sql: string) => {
            if (sql.includes('FROM arcade_games')) return {
                rows: [{ id: gameId, slug: 'pool-dive', title: 'Pool Dive', point_rate: 0.02, daily_point_limit: 10 }],
            };
            return { rows: [] };
        });

        await handlePoolDiveStart(request(), {} as any);

        expect(clientQuery.mock.calls.some((call) => String(call[0]).includes('INSERT INTO arcade_game_sessions'))).toBe(false);
        expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
        expect(clientQuery).not.toHaveBeenCalledWith('COMMIT');
        expect(sendError).toHaveBeenCalledWith({}, 'Pool Dive could not start.', 500, 'SOCIAL_ARCADE_START_FAILED');
        expect(clientRelease).toHaveBeenCalledOnce();
    });

    it('rejects malformed actions without opening a database transaction', async () => {
        await handlePoolDiveAction(request({ nonce: 'short', choice: 'left' }, { sessionId: 'bad' }), {} as any);
        expect(poolConnect).not.toHaveBeenCalled();
        expect(sendError).toHaveBeenCalledWith({}, 'Invalid Pool Dive action.', 400, 'SOCIAL_ARCADE_INVALID_ACTION');
    });

    it('uses server receipt time and rotates a non-plaintext nonce after a valid round', async () => {
        const state = createPoolDiveState(new Date(Date.now() - 500), 'left');
        const nonce = deriveArcadeNonce(process.env.JWT_SECRET!, sessionId, clientRoundId, 0);
        clientQuery.mockImplementation(async (sql: string) => {
            if (sql.includes('FROM arcade_game_sessions s')) return {
                rows: [{
                    id: sessionId,
                    status: 'active',
                    current_nonce_hash: hashArcadeNonce(nonce),
                    started_at: new Date(Date.now() - 1_000),
                    expires_at: new Date(Date.now() + 120_000),
                    client_round_id: clientRoundId,
                    game_state: state,
                    server_score: 0,
                    game_id: gameId,
                    point_rate: 0.02,
                    daily_point_limit: 10,
                }],
            };
            return { rows: [] };
        });

        await handlePoolDiveAction(request({ nonce, choice: 'left', score: 9_999_999 }, { sessionId }), {} as any);

        const response = sendSuccess.mock.calls[0][1];
        const update = clientQuery.mock.calls.find((call) => String(call[0]).includes('SET current_nonce_hash'))!;
        const persistedState = JSON.parse(update[1][2]);
        expect(response.result.roundScore).toBeGreaterThan(0);
        expect(response.session.score).toBe(response.result.roundScore);
        expect(response.session.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(update[1][1]).toBe(hashArcadeNonce(response.session.nonce));
        expect(persistedState.lastResponse.session.nonce).toBeNull();
        expect(JSON.stringify(persistedState)).not.toContain(response.session.nonce);
        expect(awardUserPoints).not.toHaveBeenCalled();
    });

    it('awards only the final server-computed score and records its verification status', async () => {
        const state = {
            ...createPoolDiveState(new Date(Date.now() - 500), 'center'),
            completedRounds: 7,
            score: 500,
        };
        const nonce = deriveArcadeNonce(process.env.JWT_SECRET!, sessionId, clientRoundId, 7);
        clientQuery.mockImplementation(async (sql: string) => {
            if (sql.includes('FROM arcade_game_sessions s')) return {
                rows: [{
                    id: sessionId,
                    status: 'active',
                    current_nonce_hash: hashArcadeNonce(nonce),
                    started_at: new Date(Date.now() - 10_000),
                    expires_at: new Date(Date.now() + 120_000),
                    client_round_id: clientRoundId,
                    game_state: state,
                    server_score: 500,
                    game_id: gameId,
                    point_rate: 0.02,
                    daily_point_limit: 10,
                }],
            };
            if (sql.includes('awarded_today')) return { rows: [{ awarded_today: 0 }] };
            return { rows: [] };
        });

        await handlePoolDiveAction(request({ nonce, choice: 'center', score: 9_999_999 }, { sessionId }), {} as any);

        const response = sendSuccess.mock.calls[0][1];
        const submission = clientQuery.mock.calls.find((call) => String(call[0]).includes('INSERT INTO game_score_submissions'))!;
        expect(response.session).toMatchObject({ final: true, round: 8 });
        expect(response.verification).toBe('server-authoritative');
        expect(response.session.score).toBeGreaterThan(500);
        expect(submission[1][2]).toBe(response.session.score);
        expect(submission[1]).not.toContain(9_999_999);
        expect(String(submission[0])).toContain("'server-authoritative'");
        expect(awardUserPoints).toHaveBeenCalledWith(expect.objectContaining({
            amount: 10,
            sourceType: 'social_arcade_pool_dive',
            idempotencyKey: `social-arcade:${sessionId}`,
        }), expect.anything());
    });
});
