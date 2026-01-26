import { Router, Request, Response } from 'express';
import { sendSuccess, sendError } from '../utils/response';
import { db } from '../db';

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

export default router;
