import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { sendError } from '../utils/response';

export const rbacMiddleware = (allowedRoles: string[]) => {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.user) {
            return sendError(res, 'Unauthorized', 401);
        }

        const userRole = (req.user as any).role || 'guest';

        if (!allowedRoles.includes(userRole)) {
            return sendError(res, 'Forbidden: Insufficient permissions', 403);
        }

        next();
    };
};

export const ROLES = {
    GUEST: 'guest',
    USER: 'user',
    MODERATOR: 'moderator',
    ADMIN: 'admin'
};
