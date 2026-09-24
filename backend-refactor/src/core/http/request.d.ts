import type { RequestPart } from '../validation/validation.middleware.js';
import type { AuthPrincipal } from '../auth/auth.types.js';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      validated?: Partial<Record<RequestPart, unknown>>;
      user?: AuthPrincipal;
    }
  }
}

export {};
