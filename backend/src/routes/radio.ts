import { Router, Request, Response } from 'express';

const router = Router();

// Get live radio status
router.get('/status', async (req: Request, res: Response) => {
    try {
        // In a real scenario, you might check an Icecast/Shoutcast stats URL
        // For now, we return config-based status
        res.json({
            is_live: true,
            stream_url: process.env.RADIO_STREAM_URL || 'https://stream.radiotedu.com/live',
            current_show: 'Non-stop Müzik',
            listeners_count: Math.floor(Math.random() * 50) + 10 // Mock data
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch radio status' });
    }
});

export default router;
