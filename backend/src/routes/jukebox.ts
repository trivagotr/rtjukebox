// Jukebox Routes - Updated for Metadata Sync
import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import { db } from '../db';
import { getIO } from '../socket';
import { MetadataService } from '../services/metadata';
import { calculatePriorityScore } from '../services/ranking';
import { authMiddleware, optionalAuth, AuthRequest } from '../middleware/auth';
import { sendSuccess, sendError } from '../utils/response';
import { ROLES } from '../middleware/rbac';
import { AudioService } from '../services/audio';
import { songUpload, normalizeUploadedSongFilename } from '../middleware/upload';
import path from 'path';
import { buildSongFileUrl, normalizeText } from '../utils/textNormalization';

export function normalizeDeviceAdminInput(input: { name: string; location?: string | null }) {
    return {
        name: normalizeText(input.name),
        location: input.location === undefined || input.location === null ? null : normalizeText(input.location)
    };
}

export function parseSongDetailsFromFilename(filename: string) {
    const normalizedFilename = normalizeUploadedSongFilename(filename);
    const rawBaseName = filename.replace(/\.(mp3|m4a|wav)$/i, '');
    let title = normalizeText(rawBaseName);
    let artist = 'Unknown';

    if (rawBaseName.includes(' - ')) {
        const firstDashIndex = rawBaseName.indexOf(' - ');
        artist = normalizeText(rawBaseName.substring(0, firstDashIndex).trim());
        title = normalizeText(rawBaseName.substring(firstDashIndex + 3).trim());
    }

    return {
        title,
        artist,
        fileUrl: buildSongFileUrl(normalizedFilename)
    };
}

type ScanFolderDbClient = {
    query: (sql: string, params: unknown[]) => Promise<{ rows: any[] }>;
};

type ScanFolderFsClient = {
    existsSync: (path: string) => boolean;
    renameSync: (from: string, to: string) => void;
};

function buildStoredSongFileUrl(filename: string) {
    return `/uploads/songs/${filename}`;
}

export async function processScanFolderSongFile(params: {
    file: string;
    uploadsPath: string;
    dbClient?: ScanFolderDbClient;
    fsImpl?: ScanFolderFsClient;
}) {
    const dbClient = params.dbClient ?? db;
    const fsImpl = params.fsImpl ?? fs;
    const normalizedFilename = normalizeUploadedSongFilename(params.file);
    const originalFileUrl = buildStoredSongFileUrl(params.file);
    const normalizedFileUrl = buildSongFileUrl(normalizedFilename);
    const originalFilePath = path.join(params.uploadsPath, params.file);
    const normalizedFilePath = path.join(params.uploadsPath, normalizedFilename);
    const rawBaseName = params.file.replace(/\.(mp3|m4a|wav)$/i, '');

    let title = normalizeText(rawBaseName);
    let artist = 'Unknown';
    if (rawBaseName.includes(' - ')) {
        const firstDashIndex = rawBaseName.indexOf(' - ');
        artist = normalizeText(rawBaseName.substring(0, firstDashIndex).trim());
        title = normalizeText(rawBaseName.substring(firstDashIndex + 3).trim());
    }

    const shouldRename = normalizedFilename !== params.file
        && fsImpl.existsSync(originalFilePath)
        && !fsImpl.existsSync(normalizedFilePath);

    const [originalExisting, normalizedExisting] = await Promise.all([
        dbClient.query(
            'SELECT id, is_active, file_url FROM songs WHERE file_url = $1',
            [originalFileUrl]
        ),
        normalizedFilename === params.file
            ? Promise.resolve({ rows: [] as any[] })
            : dbClient.query(
                'SELECT id, is_active, file_url FROM songs WHERE file_url = $1',
                [normalizedFileUrl]
            ),
    ]);

    const originalRow = originalExisting.rows[0] ?? null;
    const normalizedRow = normalizedExisting.rows[0] ?? null;
    const mutations: Array<() => Promise<{ rows: any[] }>> = [];
    let renamed = false;

    const rollbackRename = () => {
        if (!renamed) return;
        try {
            fsImpl.renameSync(normalizedFilePath, originalFilePath);
            renamed = false;
        } catch (rollbackError) {
            console.error('[scan-folder] Failed to roll back rename after DB error:', rollbackError);
        }
    };

    try {
        if (shouldRename) {
            fsImpl.renameSync(originalFilePath, normalizedFilePath);
            renamed = true;
        }

        if (originalRow && normalizedRow) {
            if (!normalizedRow.is_active) {
                mutations.push(() =>
                    dbClient.query(
                        'UPDATE songs SET is_active = true WHERE id = $1 RETURNING *',
                        [normalizedRow.id]
                    )
                );
            }

            if (originalRow.is_active) {
                mutations.push(() =>
                    dbClient.query(
                        'UPDATE songs SET is_active = false WHERE id = $1 RETURNING *',
                        [originalRow.id]
                    )
                );
            }

            const transactionRows = await runScanFolderMutations(dbClient, mutations, rollbackRename);
            return {
                action: 'reconciled' as const,
                fileUrl: normalizedFileUrl,
                song: normalizedRow ? { ...normalizedRow, is_active: true } : transactionRows[0] ?? originalRow,
                title,
                artist,
            };
        }

        if (normalizedRow) {
            if (!normalizedRow.is_active) {
                const updatedRows = await runScanFolderMutations(dbClient, [
                    () => dbClient.query(
                        'UPDATE songs SET is_active = true WHERE id = $1 RETURNING *',
                        [normalizedRow.id]
                    ),
                ], rollbackRename);

                return {
                    action: 'reactivated' as const,
                    fileUrl: normalizedFileUrl,
                    song: updatedRows[0] ?? normalizedRow,
                    title,
                    artist,
                };
            }

            return {
                action: 'skipped' as const,
                fileUrl: normalizedFileUrl,
                song: normalizedRow,
                title,
                artist,
            };
        }

        if (originalRow) {
            if (shouldRename) {
                const updatedRows = await runScanFolderMutations(dbClient, [
                    () => dbClient.query(
                        'UPDATE songs SET file_url = $1, is_active = true WHERE id = $2 RETURNING *',
                        [normalizedFileUrl, originalRow.id]
                    ),
                ], rollbackRename);

                return {
                    action: 'updated' as const,
                    fileUrl: normalizedFileUrl,
                    song: updatedRows[0] ?? originalRow,
                    title,
                    artist,
                };
            }

            if (!originalRow.is_active) {
                const updatedRows = await runScanFolderMutations(dbClient, [
                    () => dbClient.query(
                        'UPDATE songs SET is_active = true WHERE id = $1 RETURNING *',
                        [originalRow.id]
                    ),
                ], rollbackRename);

                return {
                    action: 'reactivated' as const,
                    fileUrl: originalFileUrl,
                    song: updatedRows[0] ?? originalRow,
                    title,
                    artist,
                };
            }

            return {
                action: 'skipped' as const,
                fileUrl: originalFileUrl,
                song: originalRow,
                title,
                artist,
            };
        }

        const insertFileUrl = shouldRename ? normalizedFileUrl : originalFileUrl;
        const insertedRows = await runScanFolderMutations(dbClient, [
            () => dbClient.query(
                'INSERT INTO songs (title, artist, duration_seconds, file_url) VALUES ($1, $2, $3, $4) RETURNING *',
                [title, artist, 180, insertFileUrl]
            ),
        ], rollbackRename);

        return {
            action: 'inserted' as const,
            fileUrl: insertFileUrl,
            song: insertedRows[0],
            title,
            artist,
        };
    } catch (error) {
        rollbackRename();
        throw error;
    }
}

async function runScanFolderMutations(
    dbClient: ScanFolderDbClient,
    mutations: Array<() => Promise<{ rows: any[] }>>,
    rollbackRename: () => void,
) {
    if (mutations.length === 0) {
        return [];
    }

    try {
        await dbClient.query('BEGIN', []);
        const rows: any[] = [];

        for (const mutation of mutations) {
            const result = await mutation();
            rows.push(...result.rows);
        }

        await dbClient.query('COMMIT', []);
        return rows;
    } catch (error) {
        try {
            await dbClient.query('ROLLBACK', []);
        } catch (rollbackError) {
            console.error('[scan-folder] Failed to roll back transaction:', rollbackError);
        }
        rollbackRename();
        throw error;
    }
}

// --- Helper Middlewares ---
async function checkDeviceSession(req: AuthRequest, res: Response, next: NextFunction) {
    const { device_id } = req.body;
    const user_id = req.user?.id;

    if (!device_id) {
        console.warn(`[SECURITY] Missing device_id in request to ${req.path} from user ${user_id}`);
        return sendError(res, 'Device ID required', 400);
    }

    if (!user_id) return sendError(res, 'Unauthorized', 401);

    // Admins have bypass
    if (req.user?.role === ROLES.ADMIN) return next();

    try {
        const sessionRes = await db.query(
            'SELECT 1 FROM device_sessions WHERE user_id = $1 AND device_id = $2',
            [user_id, device_id]
        );

        if (sessionRes.rows.length === 0) {
            console.warn(`[SECURITY] No session found for user ${user_id} on device ${device_id}`);
            return sendError(res, 'Session required for this device', 403, 'SESSION_REQUIRED');
        }

        next();
    } catch (error) {
        console.error('Session check error:', error);
        return sendError(res, 'Internal server error during session check', 500);
    }
}

const router = Router();
console.log('--- Jukebox Routes Initializing ---');
console.log('🚀 Jukebox Routes Registry Initializing...');

// --- Admin Endpoints (High Priority) ---

// Force logout all clients from a device
router.post('/admin/devices/:id/logout-all', authMiddleware, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    if (authReq.user?.role !== ROLES.ADMIN) return sendError(res, 'Unauthorized', 403);

    const { id } = req.params;

    try {
        console.log(`[Admin] Force logout all for device: ${id}`);

        // Clear server-side sessions
        await db.query('DELETE FROM device_sessions WHERE device_id = $1', [id]);

        getIO()?.to(`device:${id}`).emit('force_logout');
        return sendSuccess(res, null, 'Force logout signal sent and sessions cleared');
    } catch (error) {
        console.error('Logout all error:', error);
        return sendError(res, 'Failed to trigger logout all', 500);
    }
});

// --- User Endpoints ---

// Connect to device via QR code
router.post('/connect', optionalAuth, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const isAdmin = authReq.user?.role === ROLES.ADMIN;

    try {
        const { device_code, password } = req.body;
        const deviceRes = await db.query(
            'SELECT * FROM devices WHERE device_code = $1 AND is_active = true',
            [device_code]
        );

        const device = deviceRes.rows[0];

        if (!device) {
            return sendError(res, 'Device not found', 404);
        }

        const queue = await getQueueForDevice(device.id, authReq.user?.id);
        console.log('Connect Response for', device_code, ':', JSON.stringify(queue.now_playing?.title));

        // Create session
        if (authReq.user?.id) {
            await db.query(
                `INSERT INTO device_sessions (user_id, device_id) 
                 VALUES ($1, $2) 
                 ON CONFLICT (user_id, device_id) DO NOTHING`,
                [authReq.user.id, device.id]
            );
        }

        return sendSuccess(res, { device, queue }, 'Connected to device');
    } catch (error) {
        return sendError(res, 'Connection failed', 500);
    }
});

// Disconnect from device (delete session, require password on reconnect)
router.post('/disconnect', authMiddleware, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const { device_id } = req.body;

    if (!device_id) return sendError(res, 'Device ID required', 400);
    if (!authReq.user?.id) return sendError(res, 'Unauthorized', 401);

    try {
        await db.query(
            'DELETE FROM device_sessions WHERE user_id = $1 AND device_id = $2',
            [authReq.user.id, device_id]
        );
        console.log(`[SESSION] User ${authReq.user.id} disconnected from device ${device_id}`);
        return sendSuccess(res, null, 'Disconnected from device');
    } catch (error) {
        console.error('Disconnect error:', error);
        return sendError(res, 'Failed to disconnect', 500);
    }
});

// Get active devices for selection (public)
router.get('/devices', async (req: Request, res: Response) => {
    try {
        const devices = await db.query(
            'SELECT id, device_code, name, location FROM devices WHERE is_active = true ORDER BY name'
        );
        return sendSuccess(res, { devices: devices.rows }, 'Devices fetched');
    } catch (error) {
        console.error('Fetch devices error:', error);
        return sendError(res, 'Failed to fetch devices', 500);
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
router.post('/queue', authMiddleware, checkDeviceSession, async (req: Request, res: Response) => {
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

        if (dbUser.role === ROLES.ADMIN) {
            // Admins have no limits
        } else if (dbUser.role === ROLES.GUEST) {
            // GUEST LIMIT: 1 song TOTAL (ever) per account OR (IP + UA)
            if (dbUser.total_songs_added >= 1) {
                return sendError(res, 'Guest limit reached', 403, 'GUEST_LIMIT_REACHED');
            }

            // IP + User-Agent Based Check (to prevent clearing cache to bypass while allowing different devices on same wifi)
            const ua = req.headers['user-agent'];
            const ipUA_Check = await db.query(
                "SELECT id FROM users WHERE last_ip = $1 AND user_agent = $2 AND is_guest = TRUE AND total_songs_added >= 1 AND id != $3",
                [req.ip, ua, userId]
            );
            if (ipUA_Check.rows.length > 0) {
                return sendError(res, 'Guest limit reached (Identity Check)', 403, 'GUEST_LIMIT_REACHED');
            }
        } else if (dbUser.role === ROLES.USER) {
            const USER_LIMIT = 5;
            if (songCount >= USER_LIMIT) {
                return sendError(res, `Queue limit reached (${USER_LIMIT} songs)`, 403, `Kuyrukta en fazla ${USER_LIMIT} aktif şarkınız olabilir.`);
            }
        }

        // Check if song is already in pending queue for this device
        const existing = await db.query(
            "SELECT id FROM queue_items WHERE device_id = $1 AND song_id = $2 AND status = 'pending'",
            [device_id, song_id]
        );

        if (existing.rows.length > 0 && dbUser.role !== ROLES.ADMIN) {
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

        if (recentlyPlayed.rows.length > 0 && dbUser.role !== ROLES.ADMIN) {
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

        // Update user stats and award points (only for non-guests)
        if (!dbUser.is_guest) {
            await db.query('UPDATE users SET total_songs_added = total_songs_added + 1, rank_score = rank_score + 5 WHERE id = $1', [userId]);
        } else {
            await db.query('UPDATE users SET total_songs_added = total_songs_added + 1 WHERE id = $1', [userId]);
        }

        // Broadcast to all connected clients
        getIO()?.to(`device:${device_id}`).emit('queue_updated', await getQueueForDevice(device_id));

        return sendSuccess(res, result.rows[0], 'Song added to queue', null, 201);
    } catch (error) {
        console.error(error);
        return sendError(res, 'Failed to add song', 500);
    }
});

// Vote on queue item or active song
router.post('/vote', authMiddleware, checkDeviceSession, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const { queue_item_id, song_id, vote } = req.body; // vote: 1 or -1
    const userId = authReq.user?.id;

    if (!userId) return res.status(401).json({ error: 'Authentication required to vote' });

    try {
        const userRes = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
        const dbUser = userRes.rows[0];
        if (!dbUser) return sendError(res, 'User not found', 404);

        let targetQueueId = queue_item_id;

        // If voting on active song (which might be autoplay/virtual), find/create context
        if (!targetQueueId && song_id) {
            // Update SONG score directly
            await db.query(`UPDATE songs SET score = score + $1 WHERE id = $2`, [vote, song_id]);
            return sendSuccess(res, { score_updated: true }, 'Vote cast on song');
        }

        // Standard Queue Item Logic
        const existingVote = await db.query('SELECT vote_type FROM votes WHERE queue_item_id = $1 AND user_id = $2', [targetQueueId, userId]);
        const oldVote = existingVote.rows[0]?.vote_type || 0;
        let finalVoteValue = vote;

        // Super Upvote Logic
        const isSuper = req.body.is_super === true;
        if (isSuper) {
            // Check if guest
            if (dbUser.is_guest) {
                return sendError(res, 'Süper oy için üye olmalısın!', 403);
            }
            // Check if used today
            const lastSuper = dbUser.last_super_vote_at;
            const today = new Date().toISOString().split('T')[0];
            const lastSuperDate = lastSuper ? new Date(lastSuper).toISOString().split('T')[0] : null;

            if (lastSuperDate === today) {
                return sendError(res, 'Bugün süper oy hakkını zaten kullandın!', 403, 'SUPER_VOTE_COOLDOWN');
            }
            finalVoteValue = 4; // Super Upvote value
            await db.query('UPDATE users SET last_super_vote_at = NOW() WHERE id = $1', [userId]);
        }

        if (oldVote === finalVoteValue && !isSuper) {
            // TOGGLE OFF (Basic Up/Down only)
            await db.query('DELETE FROM votes WHERE queue_item_id = $1 AND user_id = $2', [targetQueueId, userId]);
            finalVoteValue = 0;
        } else {
            // UPDATE or NEW VOTE
            await db.query(
                `INSERT INTO votes (queue_item_id, user_id, vote_type) VALUES ($1, $2, $3)
                 ON CONFLICT (queue_item_id, user_id) DO UPDATE SET vote_type = $3`,
                [targetQueueId, userId, finalVoteValue]
            );
        }

        const votesRes = await db.query(
            `SELECT 
                SUM(CASE WHEN vote_type > 0 THEN vote_type ELSE 0 END) as upvotes,
                SUM(CASE WHEN vote_type < 0 THEN ABS(vote_type) ELSE 0 END) as downvotes
             FROM votes WHERE queue_item_id = $1`,
            [targetQueueId]
        );

        const { upvotes = 0, downvotes = 0 } = votesRes.rows[0];

        // Fetch queue item details
        const queueItemRes = await db.query('SELECT * FROM queue_items WHERE id = $1', [targetQueueId]);
        const queueItem = queueItemRes.rows[0];
        if (!queueItem) return sendError(res, 'Item not found', 404);

        // Update Reputation Score of the Song
        await db.query(`UPDATE songs SET score = score + $1 WHERE id = $2`, [finalVoteValue - oldVote, queueItem.song_id]);

        // Award/Deduct points to the REQUESTER (if not guest)
        const requesterRes = await db.query('SELECT is_guest FROM users WHERE id = $1', [queueItem.added_by]);
        if (requesterRes.rows[0] && !requesterRes.rows[0].is_guest) {
            if (oldVote !== finalVoteValue) {
                let pointChange = 0;

                // Regular Up (+2), Super Up (+10), Down (-2)
                if (finalVoteValue === 1) pointChange = oldVote === -1 ? 4 : 2;
                else if (finalVoteValue === 4) pointChange = 10;
                else if (finalVoteValue === -1) pointChange = oldVote === 1 ? -4 : -2;
                else if (finalVoteValue === 0) pointChange = oldVote === 1 ? -2 : (oldVote === 4 ? -10 : 2);

                if (pointChange !== 0) {
                    await db.query('UPDATE users SET rank_score = rank_score + $1 WHERE id = $2', [pointChange, queueItem.added_by]);
                }
            }
        }

        // Award points to the VOTER for using Super Upvote
        if (isSuper) {
            await db.query('UPDATE users SET rank_score = rank_score + 10 WHERE id = $1', [userId]);
        }

        // Auto-Skip Logic (Community Rejection)
        const SKIP_THRESHOLD = 3;
        if (parseInt(downvotes) >= SKIP_THRESHOLD && (parseInt(downvotes) > parseInt(upvotes) + 1)) {
            await db.query("UPDATE queue_items SET status = 'skipped' WHERE id = $1", [targetQueueId]);

            // Penalize User (-10 for skip)
            if (requesterRes.rows[0] && !requesterRes.rows[0].is_guest) {
                await db.query('UPDATE users SET rank_score = rank_score - 10 WHERE id = $1', [queueItem.added_by]);
            }

            await db.query('UPDATE songs SET score = score - 10 WHERE id = $1', [queueItem.song_id]);

            // Emit song_rejected to trigger the "DJ Spin" effect on Kiosk
            getIO()?.to(`device:${queueItem.device_id}`).emit('song_rejected');
            return sendSuccess(res, { skipped: true }, 'Song rejected by community vote');
        }

        // Update Priority if still pending
        if (queueItem.status === 'pending') {
            const user = await db.query('SELECT rank_score FROM users WHERE id = $1', [queueItem.added_by]);
            const newPriority = calculatePriorityScore(
                (parseInt(upvotes) || 0) - (parseInt(downvotes) || 0),
                queueItem.added_at,
                user.rows[0]?.rank_score || 0
            );
            await db.query('UPDATE queue_items SET priority_score = $1, upvotes = $2, downvotes = $3 WHERE id = $4',
                [newPriority, upvotes, downvotes, targetQueueId]);
        } else {
            await db.query('UPDATE queue_items SET upvotes = $1, downvotes = $2 WHERE id = $3',
                [upvotes, downvotes, targetQueueId]);
        }

        getIO()?.to(`device:${queueItem.device_id}`).emit('queue_updated', await getQueueForDevice(queueItem.device_id));
        return sendSuccess(res, { upvotes, downvotes, user_vote: finalVoteValue }, 'Vote cast successfully');
    } catch (error) {
        console.error('Vote error:', error);
        return sendError(res, 'Vote failed', 500);
    }
});

// Get queue for device
router.get('/queue/:deviceId', optionalAuth, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const queue = await getQueueForDevice(req.params.deviceId, authReq.user?.id);
    res.json(queue);
});

// --- Admin Endpoints ---



// Force Skip Song
router.post('/admin/skip', authMiddleware, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    if (authReq.user?.role !== ROLES.ADMIN) return sendError(res, 'Unauthorized', 403);

    const { device_id } = req.body;
    if (!device_id) return sendError(res, 'Missing device_id', 400);

    try {
        console.log('Admin force skip triggered for device:', device_id);

        // Find current playing
        const current = await db.query("SELECT id FROM queue_items WHERE device_id = $1 AND status = 'playing'", [device_id]);

        if (current.rows.length > 0) {
            console.log('Marking queue item as skipped:', current.rows[0].id);
            await db.query("UPDATE queue_items SET status = 'skipped' WHERE id = $1", [current.rows[0].id]);
        }

        // ALWAYS clear the device's current_song_id
        await db.query("UPDATE devices SET current_song_id = NULL WHERE id = $1", [device_id]);

        const updatedQueue = await getQueueForDevice(device_id);

        const io = getIO();
        if (io) {
            io.to(`device:${device_id}`).emit('song_skipped');
            io.to(`device:${device_id}`).emit('queue_updated', updatedQueue);
        }

        return sendSuccess(res, null, 'Song skipped by admin');
    } catch (error) {
        console.error('Admin skip error detail:', error);
        return sendError(res, 'Skip failed', 500);
    }
});

// Sync Song Metadata
router.post('/admin/sync-metadata', authMiddleware, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    if (authReq.user?.role !== ROLES.ADMIN) return sendError(res, 'Unauthorized', 403);

    const { song_id } = req.body;

    try {
        if (song_id) {
            const updated = await MetadataService.syncSongMetadata(song_id);
            if (!updated) return sendError(res, 'Song not found or no metadata found', 404);
            return sendSuccess(res, updated, 'Metadata synced successfully');
        } else {
            const stats = await MetadataService.syncAllSongs();
            return sendSuccess(res, stats, 'Full library sync initiated');
        }
    } catch (error) {
        console.error('Metadata sync error:', error);
        return sendError(res, 'Metadata sync failed', 500);
    }
});

// Get all songs for admin
router.get('/admin/songs', authMiddleware, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    if (authReq.user?.role !== ROLES.ADMIN) return sendError(res, 'Unauthorized', 403);

    try {
        const songs = await db.query(`
            SELECT s.*, 
                   (SELECT COUNT(*) FROM queue_items WHERE song_id = s.id AND status = 'played') as total_plays
            FROM songs s
            WHERE s.is_active = true
            ORDER BY s.created_at DESC
        `);
        return sendSuccess(res, { songs: songs.rows }, 'Songs fetched');
    } catch (error) {
        console.error('Fetch songs error:', error);
        return sendError(res, 'Failed to fetch songs', 500);
    }
});

// Scan uploads folder for new songs
router.post('/admin/scan-folder', authMiddleware, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    if (authReq.user?.role !== ROLES.ADMIN) return sendError(res, 'Unauthorized', 403);

    const uploadsPath = path.join(__dirname, '../../uploads/songs');

    try {
        if (!fs.existsSync(uploadsPath)) {
            fs.mkdirSync(uploadsPath, { recursive: true });
        }

        const files = fs.readdirSync(uploadsPath).filter((f: string) =>
            f.endsWith('.mp3') || f.endsWith('.m4a') || f.endsWith('.wav')
        );

        let added = 0;
        let skipped = 0;

        for (const file of files) {
            const result = await processScanFolderSongFile({
                file,
                uploadsPath,
            });

            if (result.action === 'skipped') {
                skipped++;
            } else {
                added++;
            }
        }

        // Sync metadata for ALL songs in library
        let syncStats: any = { success: 0, failed: 0, failedSongs: [] };
        try {
            syncStats = await MetadataService.syncAllSongs();
        } catch (syncErr) {
            console.log('Full metadata sync failed:', syncErr);
        }

        return sendSuccess(res, {
            added,
            skipped,
            total: files.length,
            synced: syncStats.success,
            syncFailed: syncStats.failed,
            failedSongs: syncStats.failedSongs
        }, 'Folder scanned and all metadata synced');
    } catch (error) {
        console.error('Folder scan error:', error);
        return sendError(res, 'Folder scan failed', 500);
    }
});

// Upload song file
router.post('/admin/upload-song', authMiddleware, songUpload.single('song'), async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    if (authReq.user?.role !== ROLES.ADMIN) return sendError(res, 'Unauthorized', 403);

    const file = req.file;
    if (!file) {
        return sendError(res, 'No file uploaded', 400);
    }

    try {
        const normalizedFilename = normalizeUploadedSongFilename(file.filename);
        const fileUrl = buildSongFileUrl(normalizedFilename);

        // Check if already exists
        const existing = await db.query('SELECT id, is_active FROM songs WHERE file_url = $1', [fileUrl]);
        if (existing.rows.length > 0) {
            // If soft-deleted, reactivate and sync
            if (!existing.rows[0].is_active) {
                await db.query('UPDATE songs SET is_active = true WHERE id = $1', [existing.rows[0].id]);
                try {
                    const synced = await MetadataService.syncSongMetadata(existing.rows[0].id);
                    if (synced) {
                        return sendSuccess(res, { song: synced, filename: file.filename }, 'Song reactivated and synced');
                    }
                } catch (e) { }
                const reactivated = await db.query('SELECT * FROM songs WHERE id = $1', [existing.rows[0].id]);
                return sendSuccess(res, { song: reactivated.rows[0], filename: file.filename }, 'Song reactivated');
            }
            return sendError(res, 'Song file already exists', 409);
        }

        // Extract info from filename
        const { title, artist } = parseSongDetailsFromFilename(file.filename);

        const result = await db.query(
            'INSERT INTO songs (title, artist, duration_seconds, file_url) VALUES ($1, $2, $3, $4) RETURNING *',
            [title, artist, 180, fileUrl]
        );

        const newSong = result.rows[0];

        // Auto-sync metadata from iTunes
        try {
            const synced = await MetadataService.syncSongMetadata(newSong.id);
            if (synced) {
                return sendSuccess(res, { song: synced, filename: file.filename }, 'Song uploaded and synced');
            }
        } catch (syncError) {
            console.log('Metadata sync failed, using filename data:', syncError);
        }

        return sendSuccess(res, { song: newSong, filename: file.filename }, 'Song uploaded');
    } catch (error) {
        console.error('Upload song error:', error);
        return sendError(res, 'Upload failed', 500);
    }
});

// Delete song
router.delete('/admin/songs/:id', authMiddleware, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    if (authReq.user?.role !== ROLES.ADMIN) return sendError(res, 'Unauthorized', 403);

    const { id } = req.params;

    try {
        // Get file path first
        const songRes = await db.query('SELECT file_url FROM songs WHERE id = $1', [id]);
        if (songRes.rows.length > 0) {
            const fileUrl = songRes.rows[0].file_url;
            // Remove leading slash if exists for path.join
            const relativePath = fileUrl.startsWith('/') ? fileUrl.substring(1) : fileUrl;
            const filePath = path.join(__dirname, '../../', relativePath);

            console.log(`[Admin] Deleting song: ${id}, Path: ${filePath}`);

            // Delete physical file
            if (fs.existsSync(filePath)) {
                try {
                    fs.unlinkSync(filePath);
                    console.log(`[Admin] File deleted: ${filePath}`);
                } catch (unlinkErr) {
                    console.error(`[Admin] Failed to delete file: ${filePath}`, unlinkErr);
                }
            } else {
                console.warn(`[Admin] File not found for deletion: ${filePath}`);
            }

            // Mark as inactive in DB (keeping for queue history)
            await db.query('UPDATE songs SET is_active = false WHERE id = $1', [id]);
        }

        return sendSuccess(res, null, 'Song deleted from database and disk');
    } catch (error) {
        console.error('Delete song error:', error);
        return sendError(res, 'Delete failed', 500);
    }
});

// --- Device Management ---

// Get all devices
router.get('/admin/devices', authMiddleware, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    if (authReq.user?.role !== ROLES.ADMIN) return sendError(res, 'Unauthorized', 403);

    try {
        const devices = await db.query(`
            SELECT d.*, 
                   (SELECT COUNT(*) FROM queue_items WHERE device_id = d.id AND status = 'pending') as queue_count,
                   s.title as current_song_title, s.artist as current_song_artist
            FROM devices d
            LEFT JOIN songs s ON d.current_song_id = s.id
            ORDER BY d.created_at DESC
        `);
        return sendSuccess(res, { devices: devices.rows }, 'Devices fetched');
    } catch (error) {
        console.error('Fetch devices error:', error);
        return sendError(res, 'Failed to fetch devices', 500);
    }
});

// Create new device
router.post('/admin/devices', authMiddleware, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    if (authReq.user?.role !== ROLES.ADMIN) return sendError(res, 'Unauthorized', 403);

    const { device_code, name, location, password } = req.body;

    if (!device_code || !name) {
        return sendError(res, 'device_code and name are required', 400);
    }

    try {
        const existing = await db.query('SELECT id FROM devices WHERE device_code = $1', [device_code]);
        if (existing.rows.length > 0) {
            return sendError(res, 'Device code already exists', 409);
        }

        const normalizedDevice = normalizeDeviceAdminInput({ name, location });

        const result = await db.query(
            'INSERT INTO devices (device_code, name, location, password) VALUES ($1, $2, $3, $4) RETURNING *',
            [device_code.toUpperCase(), normalizedDevice.name, normalizedDevice.location, password || null]
        );
        return sendSuccess(res, { device: result.rows[0] }, 'Device created');
    } catch (error) {
        console.error('Create device error:', error);
        return sendError(res, 'Failed to create device', 500);
    }
});



// Update device
router.put('/admin/devices/:id', authMiddleware, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    if (authReq.user?.role !== ROLES.ADMIN) return sendError(res, 'Unauthorized', 403);

    const { id } = req.params;
    const { name, location, is_active, password } = req.body;

    try {
        const normalizedDevice = normalizeDeviceAdminInput({ name, location });
        const result = await db.query(
            `UPDATE devices SET 
                name = COALESCE($1, name),
                location = COALESCE($2, location),
                is_active = COALESCE($3, is_active),
                password = COALESCE($4, password)
             WHERE id = $5 RETURNING *`,
            [normalizedDevice.name, normalizedDevice.location, is_active, password, id]
        );

        if (result.rows.length === 0) {
            return sendError(res, 'Device not found', 404);
        }

        return sendSuccess(res, { device: result.rows[0] }, 'Device updated');
    } catch (error) {
        console.error('Update device error:', error);
        return sendError(res, 'Failed to update device', 500);
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
        const { device_code, password } = req.body;
        console.log(`[KIOSK REGISTER] device_code="${device_code}" password="${password}"`);

        const deviceCheck = await db.query('SELECT password FROM devices WHERE device_code = $1', [device_code]);
        if (deviceCheck.rows.length === 0) {
            console.log(`[KIOSK REGISTER] Device not found: ${device_code}`);
            return sendError(res, 'Device code invalid', 404);
        }

        const device = deviceCheck.rows[0];
        console.log(`[KIOSK REGISTER] DB password="${device.password}" received="${password}"`);

        if (device.password && device.password !== password) {
            console.log(`[KIOSK REGISTER] Password mismatch!`);
            return sendError(res, 'Invalid device password for registration', 403, 'INVALID_PASSWORD');
        }

        const updatedDevice = await db.query(
            'UPDATE devices SET is_active = true, last_heartbeat = NOW() WHERE device_code = $1 RETURNING *',
            [device_code]
        );

        return sendSuccess(res, { device: updatedDevice.rows[0] }, 'Kiosk registered');
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
            // Also mark current playing item as played and award points (+10)
            const prevPlaying = await db.query("SELECT id, added_by FROM queue_items WHERE device_id = $1 AND status = 'playing'", [device_id]);
            if (prevPlaying.rows.length > 0) {
                const requesterId = prevPlaying.rows[0].added_by;
                await db.query("UPDATE queue_items SET status = 'played', played_at = NOW() WHERE id = $1", [prevPlaying.rows[0].id]);

                // Award points if not guest
                const requesterRes = await db.query('SELECT is_guest FROM users WHERE id = $1', [requesterId]);
                if (requesterRes.rows[0] && !requesterRes.rows[0].is_guest) {
                    await db.query('UPDATE users SET rank_score = rank_score + 10 WHERE id = $1', [requesterId]);
                    console.log(`[POINTS] Requester ${requesterId} awarded +10 for played song (stop event)`);
                }
            }

            // Broadcast the stop event immediately
            getIO()?.to(`device:${device_id}`).emit('queue_updated', await getQueueForDevice(device_id));
            return res.json({ success: true });
        }

        // Try to find if this song is in the queue
        const queueItem = await db.query(
            "SELECT id FROM queue_items WHERE device_id = $1 AND song_id = $2 AND status = 'pending' ORDER BY priority_score DESC LIMIT 1",
            [device_id, song_id]
        );

        if (queueItem.rows.length > 0) {
            // Mark previous playing song as played and award points (+10)
            const prevPlaying = await db.query("SELECT id, added_by FROM queue_items WHERE device_id = $1 AND status = 'playing'", [device_id]);
            if (prevPlaying.rows.length > 0) {
                const requesterId = prevPlaying.rows[0].added_by;
                await db.query("UPDATE queue_items SET status = 'played', played_at = NOW() WHERE id = $1", [prevPlaying.rows[0].id]);

                // Award points if not guest
                const requesterRes = await db.query('SELECT is_guest FROM users WHERE id = $1', [requesterId]);
                if (requesterRes.rows[0] && !requesterRes.rows[0].is_guest) {
                    await db.query('UPDATE users SET rank_score = rank_score + 10 WHERE id = $1', [requesterId]);
                    console.log(`[POINTS] Requester ${requesterId} awarded +10 for played song`);
                }
            }

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

        // Broadcast update to all clients (always trigger so Web UI stays in sync)
        getIO()?.to(`device:${device_id}`).emit('queue_updated', await getQueueForDevice(device_id));

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

        let systemUser = await db.query("SELECT id FROM users WHERE email = $1", ['system@radiotedu.com']);
        let addedBy;
        if (systemUser.rows.length === 0) {
            const newUser = await db.query(
                "INSERT INTO users (email, display_name, role) VALUES ($1, $2, $3) RETURNING id",
                ['system@radiotedu.com', 'Radio TEDU', 'user']
            );
            addedBy = newUser.rows[0].id;
        } else {
            addedBy = systemUser.rows[0].id;
        }

        const priorityScore = calculatePriorityScore(0, 0, 0); // Base priority

        await db.query(
            `INSERT INTO queue_items (device_id, song_id, added_by, priority_score, status)
             VALUES ($1, $2, $3, $4, 'pending')`,
            [device_id, song.id, addedBy, priorityScore]
        );

        // Broadcast
        getIO()?.to(`device:${device_id}`).emit('queue_updated', await getQueueForDevice(device_id));

        return sendSuccess(res, { song_title: song.title }, 'Autoplay song added to pending');

    } catch (error) {
        console.error("Autoplay trigger failed:", error);
        return sendError(res, 'Autoplay trigger failed', 500);
    }
});

async function getQueueForDevice(deviceId: string, userId?: string) {
    const result = await db.query(
        `SELECT qi.*, s.title, s.artist, s.cover_url, s.duration_seconds, s.file_url,
            u.display_name as added_by_name
            ${userId ? ', (SELECT vote_type FROM votes v WHERE v.queue_item_id = qi.id AND v.user_id = $2) as user_vote' : ''}
     FROM queue_items qi
     JOIN songs s ON qi.song_id = s.id
     JOIN users u ON qi.added_by = u.id
     WHERE qi.device_id = $1 AND qi.status IN ('pending', 'playing')
     ORDER BY 
        CASE WHEN qi.status = 'playing' THEN 1 ELSE 2 END,
        qi.priority_score DESC`,
        userId ? [deviceId, userId] : [deviceId]
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
