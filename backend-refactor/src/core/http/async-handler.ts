import type { NextFunction, Request, RequestHandler, Response } from 'express';

export type AsyncController = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

export function asyncHandler(controller: AsyncController): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(controller(req, res, next)).catch(next);
  };
}
