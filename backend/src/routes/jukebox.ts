import { Router, Request, Response } from 'express';
import { db } from '../db';
import { io } from '../server';
import { calculatePriorityScore } from '../services/ranking';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { sendSuccess, sendError } from '../utils/response';
import { ROLES } from '../middleware/rbac';
import { AudioService } from '../services/audio';
import path from 'path';

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
        console.log('Connect Response for', device_code, ':', JSON.stringify(queue.now_playing?.title));
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
router.post('/queue', authMiddleware, async (req: Request, res: Response) => {
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

        // Repeat Protection (Anti-Loop)
        // Check if song was played in the last 15 minutes
        const recentlyPlayed = await db.query(
            `SELECT id FROM queue_items 
             WHERE device_id = $1 AND song_id = $2 AND status = 'played' 
             AND played_at > NOW() - INTERVAL '15 minutes'`,
            [device_id, song_id]
        );

        if (recentlyPlayed.rows.length > 0) {
            return sendError(res, 'Song played recently', 400, 'Bu şarkı yakın zamanda çaldı. Lütfen biraz bekleyin.');
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

// Vote on queue item or active song
router.post('/vote', authMiddleware, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const { queue_item_id, song_id, vote } = req.body; // vote: 1 or -1
    const userId = authReq.user?.id;

    if (!userId) return res.status(401).json({ error: 'Authentication required to vote' });

    try {
        let targetQueueId = queue_item_id;

        // If voting on active song (which might be autoplay/virtual), find/create context
        if (!targetQueueId && song_id) {
            // Find current playing item for this song (even if autoplay)
            // For simplicity in this iteration, we focus on real queue items. 
            // If it's an autoplay item, we can track votes on the SONG directly for the algorithm.

            // Update SONG score directly
            await db.query(`UPDATE songs SET score = score + $1 WHERE id = $2`, [vote, song_id]);
            return sendSuccess(res, { score_updated: true }, 'Vote cast on song');
        }

        // Standard Queue Item Logic
        await db.query(
            `INSERT INTO votes (queue_item_id, user_id, vote_type) VALUES ($1, $2, $3)
             ON CONFLICT (queue_item_id, user_id) DO UPDATE SET vote_type = $3`,
            [targetQueueId, userId, vote]
        );

        // ... (Recalculate votes logic same as before) ...
        const votes = await db.query(
            `SELECT 
         SUM(CASE WHEN vote_type = 1 THEN 1 ELSE 0 END) as upvotes,
         SUM(CASE WHEN vote_type = -1 THEN 1 ELSE 0 END) as downvotes
       FROM votes WHERE queue_item_id = $1`,
            [targetQueueId]
        );

        const { upvotes, downvotes } = votes.rows[0] || { upvotes: 0, downvotes: 0 };

        // Fetch queue item details
        const queueItem = await db.query('SELECT * FROM queue_items WHERE id = $1', [targetQueueId]);
        if (!queueItem.rows[0]) return sendError(res, 'Item not found', 404);

        // Update Reputation Score of the Song
        await db.query(`UPDATE songs SET score = score + $1 WHERE id = $2`, [vote, queueItem.rows[0].song_id]);

        // Auto-Skip Logic
        const SKIP_THRESHOLD = 3; // Lowered for testing
        if ((parseInt(downvotes) || 0) >= SKIP_THRESHOLD && (parseInt(downvotes) > parseInt(upvotes) + 1)) {
            await db.query("UPDATE queue_items SET status = 'skipped' WHERE id = $1", [targetQueueId]);

            // Penalize User
            await db.query('UPDATE users SET rank_score = GREATEST(0, rank_score - 5) WHERE id = $1', [queueItem.rows[0].added_by]);

            // Heavy Penalty to Song
            await db.query('UPDATE songs SET score = score - 10 WHERE id = $1', [queueItem.rows[0].song_id]);

            io.to(`device:${queueItem.rows[0].device_id}`).emit('song_skipped');
            return sendSuccess(res, { skipped: true }, 'Song skipped due to community vote');
        }

        // Update Priority if still pending
        if (queueItem.rows[0].status === 'pending') {
            const user = await db.query('SELECT rank_score FROM users WHERE id = $1', [queueItem.rows[0].added_by]);
            const newPriority = calculatePriorityScore(
                (parseInt(upvotes) || 0) - (parseInt(downvotes) || 0),
                queueItem.rows[0].added_at,
                user.rows[0]?.rank_score || 0
            );
            await db.query('UPDATE queue_items SET priority_score = $1, upvotes = $2, downvotes = $3 WHERE id = $4',
                [newPriority, upvotes, downvotes, targetQueueId]);
        } else {
            // Just update vote counts if playing
            await db.query('UPDATE queue_items SET upvotes = $1, downvotes = $2 WHERE id = $3',
                [upvotes, downvotes, targetQueueId]);
        }

        io.to(`device:${queueItem.rows[0].device_id}`).emit('queue_updated',
            await getQueueForDevice(queueItem.rows[0].device_id)
        );

        return sendSuccess(res, { upvotes, downvotes }, 'Vote cast successfully');
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

// --- Admin Endpoints ---

// Force Skip Song
router.post('/admin/skip', authMiddleware, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    if (authReq.user?.role !== ROLES.ADMIN) return sendError(res, 'Unauthorized', 403);

    const { device_id } = req.body;
    try {
        // Find current playing
        const current = await db.query("SELECT * FROM queue_items WHERE device_id = $1 AND status = 'playing'", [device_id]);

        if (current.rows.length > 0) {
            await db.query("UPDATE queue_items SET status = 'skipped' WHERE id = $1", [current.rows[0].id]);
        } else {
            // If no queue item is playing, it might be an autoplay song. Clear the device's current_song_id.
            await db.query("UPDATE devices SET current_song_id = NULL WHERE id = $1", [device_id]);
        }

        io.to(`device:${device_id}`).emit('song_skipped');
        // Kiosk will auto-fetch next

        return sendSuccess(res, null, 'Song skipped by admin');
    } catch (error) {
        return sendError(res, 'Skip failed', 500);
    }
});

// Manually trigger audio processing (e.g. after upload)
router.post('/admin/process-song', authMiddleware, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    if (authReq.user?.role !== ROLES.ADMIN) return sendError(res, 'Unauthorized', 403);

    const { song_id } = req.body;

    try {
        const song = await db.query('SELECT * FROM songs WHERE id = $1', [song_id]);
        if (!song.rows[0]) return sendError(res, 'Song not found', 404);

        const absolutePath = path.join('/app', song.rows[0].file_url); // Docker path

        let targetPath = path.join(__dirname, '../../', song.rows[0].file_url);

        const newPath = await AudioService.processTrack(targetPath);

        const webPath = song.rows[0].file_url.replace(/(\.[\w\d]+)$/, '_trimmed$1');

        await db.query('UPDATE songs SET file_url = $1 WHERE id = $2', [webPath, song_id]);

        return sendSuccess(res, { new_path: webPath }, 'Audio processed successfully');

    } catch (error: any) {
        console.error(error);
        return sendError(res, 'Processing failed: ' + error.message, 500);
    }
});

// --- Kiosk Endpoints ---

router.post('/kiosk/register', async (req: Request, res: Response) => {
    try {
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
    } catch (error) {
        console.error('Kiosk registration error:', error);
        return sendError(res, 'Internal server error during registration', 500);
    }
});

router.post('/kiosk/now-playing', async (req: Request, res: Response) => {
    const { device_id, song_id } = req.body;

    try {
        // Check if song_id is null (stopped)
        if (!song_id) {
            await db.query('UPDATE devices SET current_song_id = NULL WHERE id = $1', [device_id]);
            // Also mark current playing item as played
            await db.query("UPDATE queue_items SET status = 'played', played_at = NOW() WHERE device_id = $1 AND status = 'playing'", [device_id]);
            return res.json({ success: true });
        }

        // Try to find if this song is in the queue
        const queueItem = await db.query(
            "SELECT id FROM queue_items WHERE device_id = $1 AND song_id = $2 AND status = 'pending' ORDER BY priority_score DESC LIMIT 1",
            [device_id, song_id]
        );

        if (queueItem.rows.length > 0) {
            // Mark previous playing song as played
            await db.query(
                "UPDATE queue_items SET status = 'played', played_at = NOW() WHERE device_id = $1 AND status = 'playing'",
                [device_id]
            );

            // Mark new song as playing
            await db.query(
                "UPDATE queue_items SET status = 'playing' WHERE id = $1",
                [queueItem.rows[0].id]
            );
        }

        // Update device current song state (always, even for autoplay)
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

// Trigger Autoplay Pre-emptively (80% rule)
router.post('/autoplay/trigger', async (req: Request, res: Response) => {
    const { device_id } = req.body;

    try {
        // Double check if queue is empty
        const queueCheck = await db.query(
            "SELECT id FROM queue_items WHERE device_id = $1 AND status = 'pending'",
            [device_id]
        );

        if (queueCheck.rows.length > 0) {
            return sendError(res, 'Queue not empty', 400);
        }

        // Pick smart random song
        const randomSong = await db.query(
            `SELECT * FROM songs 
             WHERE is_active = true 
             AND score > -5
             AND id NOT IN (SELECT current_song_id FROM devices WHERE id = $1 AND current_song_id IS NOT NULL)
             ORDER BY score DESC, RANDOM() LIMIT 20`,
            [device_id]
        );

        if (randomSong.rows.length === 0) return sendError(res, 'No songs available', 404);

        // Pick rand from top 20
        const randomIndex = Math.floor(Math.random() * randomSong.rows.length);
        const song = randomSong.rows[randomIndex];

        const systemUser = await db.query("SELECT id FROM users ORDER BY id LIMIT 1");
        const addedBy = systemUser.rows[0]?.id;

        const priorityScore = calculatePriorityScore(0, 0, 0); // Base priority

        await db.query(
            `INSERT INTO queue_items (device_id, song_id, added_by, priority_score, status)
             VALUES ($1, $2, $3, $4, 'pending')`,
            [device_id, song.id, addedBy, priorityScore]
        );

        // Broadcast
        io.to(`device:${device_id}`).emit('queue_updated', await getQueueForDevice(device_id));

        return sendSuccess(res, { song_title: song.title }, 'Autoplay song added to pending');

    } catch (error) {
        console.error("Autoplay trigger failed", error);
        return sendError(res, 'Autoplay trigger failed', 500);
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

    let nowPlaying = result.rows.find((r: any) => r.status === 'playing');
    const queue = result.rows.filter((r: any) => r.status === 'pending');

    // Autoplay / Persistent State Logic
    if (!nowPlaying) {
        // 1. Check if device has a recorded current_song_id (from previous autoplay or manual)
        const deviceResult = await db.query('SELECT current_song_id FROM devices WHERE id = $1', [deviceId]);
        const currentSongId = deviceResult.rows[0]?.current_song_id;

        if (currentSongId) {
            // Fetch the details of the song currently assigned to the device
            const songResult = await db.query('SELECT * FROM songs WHERE id = $1', [currentSongId]);
            if (songResult.rows[0]) {
                const song = songResult.rows[0];
                nowPlaying = {
                    id: 'current-' + song.id,
                    song_id: song.id,
                    title: song.title,
                    artist: song.artist,
                    cover_url: song.cover_url,
                    duration_seconds: song.duration_seconds,
                    file_url: song.file_url,
                    added_by_name: 'Radio TEDU (Otomatik)',
                    status: 'playing',
                    is_autoplay: true
                };
            }
        }
    }

    return { now_playing: nowPlaying || null, queue };
}

export default router;
