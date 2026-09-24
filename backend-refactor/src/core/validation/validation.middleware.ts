import type { RequestHandler } from 'express';
import { z } from 'zod';
import { ValidationError } from '../errors/app-error.js';

export type RequestPart = 'body' | 'query' | 'params';

function validatePart(part: RequestPart, schema: z.ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[part]);

    if (!result.success) {
      next(new ValidationError());
      return;
    }

    req.validated = { ...req.validated, [part]: result.data };
    next();
  };
}

export const strictObject = <TShape extends z.ZodRawShape>(shape: TShape) => z.strictObject(shape);

export const validateBody = (shape: z.ZodRawShape): RequestHandler =>
  validatePart('body', strictObject(shape));

export const validateQuery = (shape: z.ZodRawShape): RequestHandler =>
  validatePart('query', strictObject(shape));

export const validateParams = (shape: z.ZodRawShape): RequestHandler =>
  validatePart('params', strictObject(shape));
