export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, message: string, code = 'APP_ERROR', details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function notFound(message: string, details?: unknown): AppError {
  return new AppError(404, message, 'NOT_FOUND', details);
}

export function badRequest(message: string, details?: unknown): AppError {
  return new AppError(400, message, 'BAD_REQUEST', details);
}

export function unauthorized(message: string, details?: unknown): AppError {
  return new AppError(401, message, 'UNAUTHORIZED', details);
}

export function conflict(message: string, details?: unknown): AppError {
  return new AppError(409, message, 'CONFLICT', details);
}

export function subscriptionInactive(message: string, details?: unknown): AppError {
  return new AppError(409, message, 'subscription_inactive', details);
}

export function planLimitExceeded(message: string, details?: unknown): AppError {
  return new AppError(409, message, 'plan_limit_exceeded', details);
}

export function streamerInactive(message: string, details?: unknown): AppError {
  return new AppError(409, message, 'streamer_inactive', details);
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
