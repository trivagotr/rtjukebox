import { Response } from 'express';

export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
    meta?: any;
}

export const sendSuccess = <T>(res: Response, data: T, message?: string, meta?: any, status = 200) => {
    return res.status(status).json({
        success: true,
        data,
        message,
        meta
    });
};

export const sendError = (res: Response, error: string, status = 400, message?: string) => {
    return res.status(status).json({
        success: false,
        error,
        message
    });
};
