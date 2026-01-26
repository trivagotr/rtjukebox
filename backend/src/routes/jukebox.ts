import { Router, Request, Response } from 'express';
import { db } from '../db';
import { io } from '../server';
import { calculatePriorityScore } from '../services/ranking';
import { AuthRequest } from '../middleware/auth';
import { sendSuccess, sendError } from '../utils/response';
import { ROLES } from '../middleware/rbac';

const router = Router();

// --- User Endpoints ---

// Connect to device via QR code
router.post('/connect', async (req: Request, res: Response) => {
    try {
        const { device_code } = req.body;
        const device = await db.query(
            'SELECT * FROM devices WHERE device_code = $1 AND is_active = true',
            [device_code]
        );

        if (!device.rows[0]) {
            return sendError(res, 'Device not found', 404);
        }

        const queue = await getQueueForDevice(device.rows[0].id);
        return sendSuccess(res, { device: device.rows[0], queue }, 'Connected to device');
    } catch (error) {
        return sendError(res, 'Connection failed', 500);
    }
});

// Get song catalog
router.get('/songs', async (req: Request, res: Response) => {
    const { search, page = 1 } = req.query;
    const limit = 20;
    const offset = (Number(page) - 1) * limit;

    let query = 'SELECT * FROM songs WHERE is_active = true';
    const params: any[] = [];

    if (search) {
        query += ` AND (title ILIKE $1 OR artist ILIKE $1)`;
        params.push(`%${search}%`);
    }

    query += ` ORDER BY play_count DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    try {
        const result = await db.query(query, params);
        return sendSuccess(res, { items: result.rows });
    } catch (error) {
        return sendError(res, 'Search failed', 500);
    }
});

// Add song to queue
router.post('/queue', async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const { device_id, song_id } = req.body;
    const userId = authReq.user?.id;

    if (!userId) {
        return res.status(401).json({ error: 'Authentication required to add songs' });
    }

    try {
        // Check user and role
        const userResult = await db.query('SELECT role, total_songs_added, is_guest FROM users WHERE id = $1', [userId]);
        const dbUser = userResult.rows[0];

        if (!dbUser) return sendError(res, 'User not found', 404);

        // Per-user queue limit (to ensure fairness)
        const activeUserSongs = await db.query(
            "SELECT COUNT(id) FROM queue_items WHERE device_id = $1 AND added_by = $2 AND status = 'pending'",
            [device_id, userId]
        );
        const songCount = parseInt(activeUserSongs.rows[0].count);

        const GUEST_LIMIT = 1;
        const USER_LIMIT = 5;

        if (dbUser.role === ROLES.GUEST && songCount >= GUEST_LIMIT) {
            return sendError(res, `Guest limit reached (${GUEST_LIMIT} song)`, 403, 'Misafir olarak sadece 1 aktif şarkınız olabilir.');
        }

        if (dbUser.role === ROLES.USER && songCount >= USER_LIMIT) {
            return sendError(res, `Queue limit reached (${USER_LIMIT} songs)`, 403, `Kuyrukta en fazla ${USER_LIMIT} aktif şarkınız olabilir.`);
        }

        // Check if song is already in pending queue for this device
        const existing = await db.query(
            "SELECT id FROM queue_items WHERE device_id = $1 AND song_id = $2 AND status = 'pending'",
            [device_id, song_id]
        );

        if (existing.rows.length > 0) {
            return sendError(res, 'Song is already in queue', 400);
        }

        // Get user rank for priority calculation
        const user = await db.query('SELECT rank_score FROM users WHERE id = $1', [userId]);
        const userRank = user.rows[0]?.rank_score || 0;

        const priorityScore = calculatePriorityScore(0, 0, userRank);

        const result = await db.query(
            `INSERT INTO queue_items (device_id, song_id, added_by, priority_score, status)
        VALUES ($1, $2, $3, $4, 'pending') RETURNING *`,
            [device_id, song_id, userId, priorityScore]
        );

        // Update user stats
        await db.query('UPDATE users SET total_songs_added = total_songs_added + 1 WHERE id = $1', [userId]);

        // Broadcast to all connected clients
        io.to(`device:${device_id}`).emit('queue_updated', await getQueueForDevice(device_id));

        return sendSuccess(res, result.rows[0], 'Song added to queue', null, 201);
    } catch (error) {
        console.error(error);
        return sendError(res, 'Failed to add song', 500);
    }
});

// Vote on queue item
router.post('/vote', async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const { queue_item_id, vote } = req.body; // vote: 1 or -1
    const userId = authReq.user?.id;

    if (!userId) {
        return res.status(401).json({ error: 'Authentication required to vote' });
    }

    try {
        // Insert or update vote
        await db.query(
            `INSERT INTO votes (queue_item_id, user_id, vote_type) VALUES ($1, $2, $3)
       ON CONFLICT (queue_item_id, user_id) DO UPDATE SET vote_type = $3`,
            [queue_item_id, userId, vote]
        );

        // Recalculate vote counts
        const votes = await db.query(
            `SELECT 
         SUM(CASE WHEN vote_type = 1 THEN 1 ELSE 0 END) as upvotes,
         SUM(CASE WHEN vote_type = -1 THEN 1 ELSE 0 END) as downvotes
       FROM votes WHERE queue_item_id = $1`,
            [queue_item_id]
        );

        const { upvotes, downvotes } = votes.rows[0] || { upvotes: 0, downvotes: 0 };

        // Update queue item and recalculate priority
        const queueItem = await db.query('SELECT * FROM queue_items WHERE id = $1', [queue_item_id]);
        if (!queueItem.rows[0]) return sendError(res, 'Item not found', 404);

        const user = await db.query('SELECT rank_score FROM users WHERE id = $1', [queueItem.rows[0].added_by]);

        const newPriority = calculatePriorityScore(
            (parseInt(upvotes) || 0) - (parseInt(downvotes) || 0),
            queueItem.rows[0].added_at,
            user.rows[0]?.rank_score || 0
        );

        await db.query(
            'UPDATE queue_items SET upvotes = $1, downvotes = $2, priority_score = $3 WHERE id = $4',
            [upvotes || 0, downvotes || 0, newPriority, queue_item_id]
        );

        // Check auto-skip
        if ((downvotes || 0) >= 5 && (downvotes || 0) > (upvotes || 0) * 2) {
            await db.query("UPDATE queue_items SET status = 'skipped' WHERE id = $1", [queue_item_id]);
            // Penalize user
            await db.query('UPDATE users SET rank_score = GREATEST(0, rank_score - 10) WHERE id = $1', [queueItem.rows[0].added_by]);
        }

        // Broadcast update
        io.to(`device:${queueItem.rows[0].device_id}`).emit('queue_updated',
            await getQueueForDevice(queueItem.rows[0].device_id)
        );

        return sendSuccess(res, { upvotes, downvotes, priority_score: newPriority }, 'Vote cast successfully');
    } catch (error) {
        console.error(error);
        return sendError(res, 'Vote failed', 500);
    }
});

// Get queue for device
router.get('/queue/:deviceId', async (req: Request, res: Response) => {
    const queue = await getQueueForDevice(req.params.deviceId);
    res.json(queue);
});

// --- Kiosk Endpoints ---

router.post('/kiosk/register', async (req: Request, res: Response) => {
    // In production, secure this with a secret key
    const { device_code } = req.body;

    // Find or create logic could go here, or just update status
    const device = await db.query(
        'UPDATE devices SET is_active = true, last_heartbeat = NOW() WHERE device_code = $1 RETURNING *',
        [device_code]
    );

    if (device.rows.length === 0) {
        return sendError(res, 'Device code invalid', 404);
    }

    return sendSuccess(res, { device: device.rows[0] }, 'Kiosk registered');
});

router.post('/kiosk/now-playing', async (req: Request, res: Response) => {
    const { device_id, song_id } = req.body;

    try {
        // Check if song_id is null (stopped)
        if (!song_id) {
            await db.query('UPDATE devices SET current_song_id = NULL WHERE id = $1', [device_id]);
            return res.json({ success: true });
        }

        // Mark previous playing song as played
        await db.query(
            "UPDATE queue_items SET status = 'played', played_at = NOW() WHERE device_id = $1 AND status = 'playing'",
            [device_id]
        );

        // Mark new song as playing queue item
        // We look for pending item with this song_id OR just pick top 1 if we trust the kiosk's choice
        await db.query(
            "UPDATE queue_items SET status = 'playing' WHERE device_id = $1 AND song_id = $2 AND status = 'pending' ORDER BY priority_score DESC LIMIT 1",
            [device_id, song_id]
        );

        // Update device current song state
        await db.query(
            'UPDATE devices SET current_song_id = $2, last_heartbeat = NOW() WHERE id = $1',
            [device_id, song_id]
        );

        // Broadcast
        io.to(`device:${device_id}`).emit('queue_updated', await getQueueForDevice(device_id));

        return sendSuccess(res, null, 'Now playing updated');
    } catch (error) {
        console.error(error);
        return sendError(res, 'Update failed', 500);
    }
});

async function getQueueForDevice(deviceId: string) {
    const result = await db.query(
        `SELECT qi.*, s.title, s.artist, s.cover_url, s.duration_seconds, s.file_url,
            u.display_name as added_by_name
     FROM queue_items qi
     JOIN songs s ON qi.song_id = s.id
     JOIN users u ON qi.added_by = u.id
     WHERE qi.device_id = $1 AND qi.status IN ('pending', 'playing')
     ORDER BY 
        CASE WHEN qi.status = 'playing' THEN 1 ELSE 2 END,
        qi.priority_score DESC`,
        [deviceId]
    );

    const nowPlaying = result.rows.find((r: any) => r.status === 'playing');
    const queue = result.rows.filter((r: any) => r.status === 'pending');

    return { now_playing: nowPlaying || null, queue };
}

export default router;
