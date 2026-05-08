import { Router, Request, Response } from 'express';
import { db } from '../db';
import { sendSuccess, sendError } from '../utils/response';
import { getIstanbulYearMonth } from '../services/jukeboxScoring';
import { normalizeGamificationCategory, type GamificationCategory } from '../services/gamification';

const router = Router();
export type LeaderboardPeriod = 'total' | 'monthly';
export type LeaderboardCategory = GamificationCategory;

export function normalizeLeaderboardPeriod(period: unknown): LeaderboardPeriod {
    return period === 'monthly' ? 'monthly' : 'total';
}

export function normalizeLeaderboardCategory(category: unknown): LeaderboardCategory {
    return normalizeGamificationCategory(category);
}

function getCategoryScoreColumn(category: LeaderboardCategory) {
    switch (category) {
        case 'listening':
            return 'listening_points';
        case 'events':
            return 'events_points';
        case 'games':
            return 'games_points';
        case 'social':
            return 'social_points';
        case 'jukebox':
            return 'jukebox_points';
        case 'total':
        default:
            return 'lifetime_points';
    }
}

export function buildLeaderboardQueryConfig(
    period: LeaderboardPeriod,
    yearMonth: string,
    category: LeaderboardCategory = 'total',
) {
    if (period === 'monthly' && category !== 'total') {
        return {
            text: `SELECT u.id,
                          u.display_name,
                          u.avatar_url,
                          COALESCE(SUM(pl.amount), 0) AS score,
                          u.rank_score AS total_rank_score,
                          COALESCE(umrs.score, 0) AS monthly_rank_score,
                          u.total_songs_added
                   FROM users u
                   LEFT JOIN points_ledger pl
                     ON pl.user_id = u.id
                    AND TO_CHAR(pl.created_at AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM') = $1
                    AND pl.category = $2
                   LEFT JOIN user_monthly_rank_scores umrs
                     ON umrs.user_id = u.id AND umrs.year_month = $1
                   WHERE u.is_guest = false AND u.role != 'admin'
                   GROUP BY u.id, umrs.score
                   ORDER BY score DESC, u.rank_score DESC, u.display_name ASC
                   LIMIT 50`,
            values: [yearMonth, category],
        };
    }

    if (category !== 'total') {
        const categoryColumn = getCategoryScoreColumn(category);

        return {
            text: `SELECT u.id,
                          u.display_name,
                          u.avatar_url,
                          COALESCE(up.${categoryColumn}, 0) AS score,
                          u.rank_score AS total_rank_score,
                          COALESCE(umrs.score, 0) AS monthly_rank_score,
                          u.total_songs_added
                   FROM users u
                   LEFT JOIN user_points up
                     ON up.user_id = u.id
                   LEFT JOIN user_monthly_rank_scores umrs
                     ON umrs.user_id = u.id AND umrs.year_month = $1
                   WHERE u.is_guest = false AND u.role != 'admin'
                   ORDER BY score DESC, u.rank_score DESC, u.display_name ASC
                   LIMIT 50`,
            values: [yearMonth],
        };
    }

    if (period === 'monthly') {
        return {
            text: `SELECT u.id,
                          u.display_name,
                          u.avatar_url,
                          COALESCE(umrs.score, 0) AS score,
                          u.rank_score AS total_rank_score,
                          COALESCE(umrs.score, 0) AS monthly_rank_score,
                          u.total_songs_added
                   FROM users u
                   LEFT JOIN user_monthly_rank_scores umrs
                     ON umrs.user_id = u.id AND umrs.year_month = $1
                   WHERE u.is_guest = false AND u.role != 'admin'
                   ORDER BY score DESC, u.rank_score DESC, u.display_name ASC
                   LIMIT 50`,
            values: [yearMonth],
        };
    }

    return {
        text: `SELECT u.id,
                      u.display_name,
                      u.avatar_url,
                      u.rank_score AS score,
                      u.rank_score AS total_rank_score,
                      COALESCE(umrs.score, 0) AS monthly_rank_score,
                      u.total_songs_added
               FROM users u
               LEFT JOIN user_monthly_rank_scores umrs
                 ON umrs.user_id = u.id AND umrs.year_month = $1
               WHERE u.is_guest = false AND u.role != 'admin'
               ORDER BY score DESC, u.display_name ASC
               LIMIT 50`,
        values: [yearMonth],
    };
}

export async function handleLeaderboardRequest(req: Request, res: Response) {
    try {
        const period = normalizeLeaderboardPeriod(req.query.period);
        const category = normalizeLeaderboardCategory(req.query.category);
        const currentYearMonth = getIstanbulYearMonth(new Date());
        const query = buildLeaderboardQueryConfig(period, currentYearMonth, category);
        const result = await db.query(query.text, query.values);

        return sendSuccess(res, { leaderboard: result.rows, period, category }, 'Leaderboard fetched');
    } catch (error) {
        console.error('Leaderboard fetch error:', error);
        return sendError(res, 'Failed to fetch leaderboard', 500);
    }
}

// Get leaderboard (top users by rank_score, excluding guests)
router.get('/leaderboard', handleLeaderboardRequest);

// Get user profile points/rank (publicly reachable for any registered user)
router.get('/:id/stats', async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const result = await db.query(`
            SELECT id, display_name, avatar_url, rank_score, total_songs_added, total_upvotes_received, total_downvotes_received
            FROM users
            WHERE id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return sendError(res, 'User not found', 404);
        }

        return sendSuccess(res, { user: result.rows[0] }, 'User stats fetched');
    } catch (error) {
        console.error('User stats fetch error:', error);
        return sendError(res, 'Failed to fetch user stats', 500);
    }
});

export default router;
