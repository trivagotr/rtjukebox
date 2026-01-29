import { Router, Request, Response } from 'express';
import { db } from '../db';
import { sendSuccess, sendError } from '../utils/response';

const router = Router();

// Get leaderboard (top users by rank_score, excluding guests)
router.get('/leaderboard', async (req: Request, res: Response) => {
    try {
        const result = await db.query(`
            SELECT id, display_name, avatar_url, rank_score, total_songs_added
            FROM users
            WHERE is_guest = false AND role != 'admin'
            ORDER BY rank_score DESC
            LIMIT 50
        `);

        return sendSuccess(res, { leaderboard: result.rows }, 'Leaderboard fetched');
    } catch (error) {
        console.error('Leaderboard fetch error:', error);
        return sendError(res, 'Failed to fetch leaderboard', 500);
    }
});

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
