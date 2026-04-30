import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDbQuery } = vi.hoisted(() => ({
    mockDbQuery: vi.fn(),
}));

vi.mock('../db', () => ({
    db: {
        query: mockDbQuery,
        pool: {},
    },
}));

let usersRoutes: typeof import('./users');
let authRoutes: typeof import('./auth');

function createMockRes() {
    return {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    } as any;
}

describe('users leaderboard routes', () => {
    beforeAll(async () => {
        usersRoutes = await import('./users');
        authRoutes = await import('./auth');
    });

    beforeEach(() => {
        mockDbQuery.mockReset();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-04T10:00:00.000+03:00'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns the total leaderboard view by default', async () => {
        const res = createMockRes();
        mockDbQuery.mockResolvedValueOnce({
            rows: [
                {
                    id: 'user-1',
                    display_name: 'Tuna',
                    avatar_url: null,
                    score: 12,
                    total_rank_score: 12,
                    monthly_rank_score: 4,
                    total_songs_added: 3,
                },
            ],
        });

        await usersRoutes.handleLeaderboardRequest({ query: {} } as any, res);

        expect(mockDbQuery).toHaveBeenCalledWith(
            expect.stringContaining("WHERE u.is_guest = false AND u.role != 'admin'"),
            ['2026-04']
        );
        expect(mockDbQuery.mock.calls[0][0]).toContain('u.rank_score AS score');
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: true,
                data: expect.objectContaining({
                    period: 'total',
                    leaderboard: expect.any(Array),
                }),
            })
        );
    });

    it('returns the monthly leaderboard view when requested', async () => {
        const res = createMockRes();
        mockDbQuery.mockResolvedValueOnce({
            rows: [
                {
                    id: 'user-2',
                    display_name: 'Ayse',
                    avatar_url: null,
                    score: 7,
                    total_rank_score: 21,
                    monthly_rank_score: 7,
                    total_songs_added: 5,
                },
            ],
        });

        await usersRoutes.handleLeaderboardRequest({ query: { period: 'monthly' } } as any, res);

        expect(mockDbQuery).toHaveBeenCalledWith(
            expect.stringContaining('LEFT JOIN user_monthly_rank_scores umrs'),
            ['2026-04']
        );
        expect(mockDbQuery.mock.calls[0][0]).toContain('COALESCE(umrs.score, 0) AS score');
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: true,
                data: expect.objectContaining({
                    period: 'monthly',
                }),
            })
        );
    });

    it('returns category leaderboard views from user point balances', async () => {
        const res = createMockRes();
        mockDbQuery.mockResolvedValueOnce({
            rows: [
                {
                    id: 'user-3',
                    display_name: 'Defne',
                    avatar_url: null,
                    score: 44,
                    total_rank_score: 100,
                    monthly_rank_score: 15,
                    total_songs_added: 6,
                },
            ],
        });

        await usersRoutes.handleLeaderboardRequest({ query: { category: 'games' } } as any, res);

        expect(mockDbQuery).toHaveBeenCalledWith(
            expect.stringContaining('COALESCE(up.games_points, 0) AS score'),
            ['2026-04']
        );
        expect(mockDbQuery.mock.calls[0][0]).toContain('LEFT JOIN user_points up');
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: true,
                data: expect.objectContaining({
                    category: 'games',
                }),
            })
        );
    });

    it('returns monthly category leaderboard views from the points ledger', async () => {
        const res = createMockRes();
        mockDbQuery.mockResolvedValueOnce({
            rows: [
                {
                    id: 'user-4',
                    display_name: 'Ece',
                    avatar_url: null,
                    score: 12,
                    total_rank_score: 30,
                    monthly_rank_score: 12,
                    total_songs_added: 1,
                },
            ],
        });

        await usersRoutes.handleLeaderboardRequest({ query: { period: 'monthly', category: 'games' } } as any, res);

        expect(mockDbQuery).toHaveBeenCalledWith(
            expect.stringContaining('LEFT JOIN points_ledger pl'),
            ['2026-04', 'games']
        );
        expect(mockDbQuery.mock.calls[0][0]).toContain("TO_CHAR(pl.created_at AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM') = $1");
        expect(mockDbQuery.mock.calls[0][0]).toContain('COALESCE(SUM(pl.amount), 0) AS score');
    });

    it('maps auth/me responses with monthly rank score', async () => {
        const res = createMockRes();
        mockDbQuery.mockResolvedValueOnce({
            rows: [
                {
                    id: 'user-1',
                    email: 'user@example.com',
                    display_name: 'User One',
                    avatar_url: null,
                    rank_score: '18',
                    total_songs_added: '4',
                    role: 'user',
                    last_super_vote_at: null,
                    monthly_rank_score: '6',
                },
            ],
        });

        await authRoutes.handleCurrentUserProfileRequest(
            { user: { id: 'user-1' } } as any,
            res,
        );

        expect(mockDbQuery).toHaveBeenCalledWith(
            expect.stringContaining('COALESCE(ums.score, 0) AS monthly_rank_score'),
            ['user-1', '2026-04']
        );
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: true,
                data: expect.objectContaining({
                    rank_score: 18,
                    monthly_rank_score: 6,
                }),
            })
        );
    });

    it('normalizes invalid leaderboard periods back to total', () => {
        expect(usersRoutes.normalizeLeaderboardPeriod('unexpected')).toBe('total');
    });

    it('normalizes invalid leaderboard categories back to total', () => {
        expect(usersRoutes.normalizeLeaderboardCategory('unexpected')).toBe('total');
    });

    it('allows common mail providers and school domains for registration', () => {
        expect(authRoutes.isAllowedRegistrationEmail('student@gmail.com')).toBe(true);
        expect(authRoutes.isAllowedRegistrationEmail('student@tedu.edu.tr')).toBe(true);
        expect(authRoutes.isAllowedRegistrationEmail('student@mailinator.com')).toBe(false);
    });
});
