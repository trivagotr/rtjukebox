import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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

beforeAll(async () => {
    usersRoutes = await import('./users');
    authRoutes = await import('./auth');
});

beforeEach(() => {
    mockDbQuery.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-04T10:00:00.000+03:00'));
});

describe('users leaderboard routes', () => {
    it('returns the total leaderboard view by default', async () => {
        const res = createMockRes();
        mockDbQuery.mockResolvedValueOnce({
            rows: [
                {
                    id: 'user-1',
                    display_name: 'Tuna',
                    avatar_url: null,
                    rank_score: 12,
                    total_rank_score: 12,
                    monthly_rank_score: 4,
                    total_songs_added: 3,
                },
            ],
        });

        await usersRoutes.handleLeaderboardRequest({ query: {} } as any, res);

        expect(mockDbQuery).toHaveBeenCalledWith(expect.stringContaining('ORDER BY u.rank_score DESC'), ['2026-04']);
        expect(mockDbQuery.mock.calls[0][0]).toContain("WHERE u.is_guest = false AND u.role != 'admin'");
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: true,
            data: expect.objectContaining({
                period: 'total',
                leaderboard: expect.any(Array),
            }),
        }));
    });

    it('returns the monthly leaderboard view when requested', async () => {
        const res = createMockRes();
        mockDbQuery.mockResolvedValueOnce({
            rows: [
                {
                    id: 'user-2',
                    display_name: 'Ayse',
                    avatar_url: null,
                    rank_score: 7,
                    total_rank_score: 21,
                    monthly_rank_score: 7,
                    total_songs_added: 5,
                },
            ],
        });

        await usersRoutes.handleLeaderboardRequest({ query: { period: 'monthly' } } as any, res);

        expect(mockDbQuery).toHaveBeenCalledWith(expect.stringContaining('user_monthly_rank_scores'), ['2026-04']);
        expect(mockDbQuery.mock.calls[0][0]).toContain("WHERE u.is_guest = false AND u.role != 'admin'");
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: true,
            data: expect.objectContaining({
                period: 'monthly',
            }),
        }));
    });

    it('returns monthly_rank_score from auth me', async () => {
        const res = createMockRes();
        mockDbQuery.mockResolvedValueOnce({
            rows: [
                {
                    id: 'user-1',
                    email: 'user@example.com',
                    display_name: 'Tuna',
                    avatar_url: null,
                    rank_score: 18,
                    total_songs_added: 4,
                    role: 'user',
                    last_super_vote_at: '2026-04-04T08:00:00.000+03:00',
                    monthly_rank_score: 6,
                },
            ],
        });

        await authRoutes.handleCurrentUserProfileRequest(
            { user: { id: 'user-1' } } as any,
            res,
        );

        expect(mockDbQuery).toHaveBeenCalledWith(expect.stringContaining('COALESCE(ums.score, 0) AS monthly_rank_score'), ['user-1', '2026-04']);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: true,
            data: expect.objectContaining({
                monthly_rank_score: 6,
                rank_score: 18,
            }),
        }));
    });
});
