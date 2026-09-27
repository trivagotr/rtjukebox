export class AppError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Invalid credentials') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super(message, 409, 'CONFLICT');
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many attempts. Try again later.') {
    super(message, 429, 'LOGIN_TEMPORARILY_LOCKED');
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service unavailable', code = 'SERVICE_UNAVAILABLE', options?: ErrorOptions) {
    super(message, 503, code, options);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Request validation failed') {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class NotImplementedError extends AppError {
  constructor(message = 'This operation is not implemented yet') {
    super(message, 501, 'NOT_IMPLEMENTED');
  }
}
