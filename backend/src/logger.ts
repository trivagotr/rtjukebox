import { randomUUID } from 'node:crypto';
import pino from 'pino';
import pinoHttp from 'pino-http';

export const logger = pino({
  level: process.env.LOG_LEVEL?.trim() || 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers.x-kiosk-credential',
      'refresh_token',
      'client_secret',
      'device_pwd',
    ],
    censor: '[Redacted]',
  },
});

export const requestLogger = pinoHttp({
  logger,
  genReqId(req, res) {
    const requestId = (req as typeof req & { requestId?: string }).requestId;
    if (requestId) return requestId;
    const generatedId = randomUUID();
    res.setHeader('X-Request-Id', generatedId);
    return generatedId;
  },
  serializers: {
    req(req) {
      const request = req as typeof req & { requestId?: string };
      return {
        id: request.requestId ?? request.id,
        method: req.method,
        path: new URL(req.url ?? '/', 'http://localhost').pathname,
      };
    },
    res(res) {
      return { statusCode: res.statusCode };
    },
  },
  customProps(req) {
    return { requestId: (req as typeof req & { requestId?: string }).requestId ?? req.id };
  },
  customLogLevel(_req, res, error) {
    if (error || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
});
