import pino, { type LoggerOptions } from 'pino';
import { pinoHttp } from 'pino-http';

export function createLogger(options: LoggerOptions = {}) {
  return pino({ redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers.x-kiosk-credential'], ...options });
}

export const logger = createLogger();
export const requestLogger = pinoHttp({ logger });
