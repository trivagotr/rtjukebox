import { randomUUID } from 'crypto';
import { RequestHandler } from 'express';

declare global {
    namespace Express {
        interface Request {
            requestId: string;
        }
    }
}

export const requestIdMiddleware: RequestHandler = (req, res, next) => {
    req.requestId = randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    next();
};
