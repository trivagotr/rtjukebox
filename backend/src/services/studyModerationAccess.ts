import type { NextFunction, Response } from 'express';
import { db } from '../db';
import type { AuthRequest } from '../middleware/auth';
import { sendError } from '../utils/response';

export async function enforceStudyAccess(req: AuthRequest, res: Response, next: NextFunction) {
    if (!req.user?.id) return next();
    try {
        const result = await db.query(
            `SELECT 1 FROM study_bans
             WHERE target_user_id=$1 AND status='active'
               AND (expires_at IS NULL OR expires_at > NOW())
             LIMIT 1`,
            [req.user.id],
        );
    if (result.rows[0]) return sendError(res, 'Social access is suspended.', 403, 'STUDY_BANNED');
        next();
    } catch (error) {
        console.error('Study ban gate error:', error);
    return sendError(res, 'Social access could not be verified.', 503, 'STUDY_ACCESS_UNAVAILABLE');
    }
}
