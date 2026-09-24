import type { ErrorRequestHandler } from 'express';
import { AppError } from '../errors/app-error.js';
import { logger } from '../logging/logger.js';
import type { ApiErrorResponse } from '../types/dto.js';

export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, _next) => {
  const requestId = req.requestId ?? 'unknown';
  const isExpected = error instanceof AppError;
  const statusCode = isExpected ? error.statusCode : 500;
  const body: ApiErrorResponse = isExpected
    ? { code: error.code, message: error.message, requestId }
    : {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        requestId,
      };

  if (!isExpected) {
    logger.error({ err: error, requestId }, 'Unhandled request error');
  }

  res.status(statusCode).json(body);
};
