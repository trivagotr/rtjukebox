import { Router, Request, Response } from 'express';
import { sendSuccess, sendError } from '../utils/response';
import { db } from '../db';
import { recordNowPlaying } from '../services/radioHistory';

const router = Router();

// Get live radio status
router.get('/status', async (req: Request, res: Response) => {
    try {
        // In a real scenario, you might check an Icecast/Shoutcast stats URL
        // For now, we return config-based status
        return sendSuccess(res, {
            is_live: true,
            stream_url: process.env.RADIO_STREAM_URL || 'https://stream.radiotedu.com/live',
            current_show: 'Non-stop Müzik',
            listeners_count: Math.floor(Math.random() * 50) + 10 // Mock data
        });
    } catch (error) {
        return sendError(res, 'Failed to fetch radio status', 500);
    }
});

// Get radio schedule
router.get('/schedule', async (req: Request, res: Response) => {
    try {
        const result = await db.query(
            'SELECT * FROM radio_schedule WHERE is_active = true ORDER BY day_of_week, start_time'
        );
        return sendSuccess(res, result.rows);
    } catch (error) {
        return sendError(res, 'Failed to fetch schedule', 500);
    }
});

// Get recent song history for a channel (last 15 minutes)
router.get('/history/:channelId', async (req: Request, res: Response) => {
    try {
        const result = await db.query(
            `SELECT title, artist, cover_url, played_at
             FROM song_history
             WHERE channel_id = $1
               AND played_at > now() - interval '15 minutes'
             ORDER BY played_at DESC`,
            [req.params.channelId]
        );
        return sendSuccess(res, result.rows);
    } catch (error) {
        return sendError(res, 'Failed to fetch song history', 500);
    }
});

// Record a now-playing song for a channel (watcher / trusted callers)
router.post('/history/:channelId', async (req: Request, res: Response) => {
    try {
        const { title, artist, cover_url } = req.body ?? {};
        if (!title || !String(title).trim()) {
            return sendError(res, 'title is required', 400);
        }

        const recorded = await recordNowPlaying(req.params.channelId, {
            title,
            artist,
            coverUrl: cover_url,
        });

        return sendSuccess(res, { recorded }, recorded ? 'Song recorded' : 'Duplicate skipped', null, 201);
    } catch (error) {
        return sendError(res, 'Failed to record song history', 500);
    }
});

export default router;
