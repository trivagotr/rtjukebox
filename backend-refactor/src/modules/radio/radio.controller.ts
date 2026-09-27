import type { RequestHandler } from 'express';
import { ValidationError } from '../../core/errors/app-error.js';
import { toRadioHistoryDto } from './radio.dto.js';
import { emptyQuerySchema, historyParamsSchema } from './radio.schema.js';
import type { RadioService } from './radio.service.js';

export function createRadioController(service: RadioService) {
  const status: RequestHandler = (req, res, next) => {
    if (!emptyQuerySchema.safeParse(req.query).success) return next(new ValidationError('Unexpected radio status query parameters'));
    return res.json({ success: true, data: service.getStatus() });
  };

  const schedule: RequestHandler = async (req, res, next) => {
    if (!emptyQuerySchema.safeParse(req.query).success) return next(new ValidationError('Unexpected radio schedule query parameters'));
    try {
      return res.json({ success: true, data: await service.getSchedule() });
    } catch (error) { return next(error); }
  };

  const history: RequestHandler = async (req, res, next) => {
    const params = historyParamsSchema.safeParse(req.params);
    if (!params.success || !emptyQuerySchema.safeParse(req.query).success) {
      return next(new ValidationError('Invalid radio history request'));
    }
    try {
      const items = await service.getHistory(params.data.channelId);
      return res.json({ success: true, data: items.map(toRadioHistoryDto) });
    } catch (error) { return next(error); }
  };

  return { status, schedule, history };
}
