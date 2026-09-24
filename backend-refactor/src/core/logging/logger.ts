import pino, { type LoggerOptions } from 'pino';
import { pinoHttp } from 'pino-http';

export function createLogger(options: LoggerOptions = {}) {
  return pino(options);
}

export const logger = createLogger();
export const requestLogger = pinoHttp({ logger });
