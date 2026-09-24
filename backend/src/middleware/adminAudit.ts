import { RequestHandler } from 'express';
import { db } from '../db';
import { AuthRequest } from './auth';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Record authenticated admin mutations without persisting request bodies, query strings, or IPs. */
export const adminAuditLog: RequestHandler = (req, res, next) => {
    const authReq = req as AuthRequest;
    if (!WRITE_METHODS.has(req.method) || !authReq.user?.id) return next();

    res.once('finish', () => {
        const route = req.route?.path;
        const path = `${req.baseUrl}${typeof route === 'string' ? route : req.path}`.slice(0, 500);
        const requestId = (req as unknown as { requestId?: string }).requestId ?? null;
        void db.query(
            `INSERT INTO audit_logs (user_id, action, entity_type, metadata)
             VALUES ($1, $2, $3, $4::jsonb)`,
            [
                authReq.user!.id,
                `admin_http_${req.method.toLowerCase()}`,
                'http_route',
                JSON.stringify({ path, status: res.statusCode, request_id: requestId }),
            ],
        ).catch((error: unknown) => {
            console.error('Admin audit record failed', {
                requestId,
                method: req.method,
                path,
                errorName: error instanceof Error ? error.name : 'Error',
            });
        });
    });

    next();
};
