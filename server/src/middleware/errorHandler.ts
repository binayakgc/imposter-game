// server/src/middleware/errorHandler.ts
// COMPLETE FIXED VERSION - Ensures AppError has all required properties

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Custom Application Error class
 */
export class AppError extends Error {
  public statusCode: number;
  public errorCode: string;
  public isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    errorCode: string = 'INTERNAL_ERROR',
    isOperational: boolean = true
  ) {
    super(message);
    
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = isOperational;
    
    // Maintain proper stack trace
    Error.captureStackTrace(this, this.constructor);
    
    // Set error name
    this.name = this.constructor.name;
  }
}

/**
 * Global error handler middleware
 */
export const errorHandler = (
  error: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Determine error properties
  const statusCode = error instanceof AppError ? error.statusCode : 500;
  const errorCode = error instanceof AppError ? error.errorCode : 'INTERNAL_ERROR';
  const message = error.message || 'Unknown error occurred';

  // Log error details
  logger.error('Global error handler triggered', {
    message,
    statusCode,
    errorCode,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: (req as any).user?.id,
    timestamp: new Date().toISOString(),
  });

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';

  // Construct error response
  const errorResponse = {
    success: false,
    error: error instanceof AppError 
      ? message 
      : (isDevelopment ? message : 'Internal server error'),
    code: errorCode,
    timestamp: new Date().toISOString(),
    ...(isDevelopment && { 
      stack: error.stack,
      details: error instanceof AppError ? undefined : error.toString()
    })
  };

  // Send error response
  res.status(statusCode).json(errorResponse);
};

/**
 * 404 Not Found handler
 */
export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const error = new AppError(
    `Route ${req.originalUrl} not found`,
    404,
    'ROUTE_NOT_FOUND'
  );

  logger.warn('Route not found', {
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString(),
  });

  res.status(404).json({
    success: false,
    error: error.message,
    code: error.errorCode,
    suggestion: 'Check the API documentation for available endpoints',
    timestamp: new Date().toISOString(),
  });
};

/**
 * Async error wrapper for route handlers
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Validation error helper
 */
export const createValidationError = (
  message: string,
  field?: string
): AppError => {
  return new AppError(
    `Validation error: ${message}${field ? ` (field: ${field})` : ''}`,
    400,
    'VALIDATION_ERROR'
  );
};

/**
 * Database error helper
 */
export const createDatabaseError = (
  operation: string,
  originalError?: Error
): AppError => {
  logger.error('Database operation failed', {
    operation,
    error: originalError?.message,
    stack: originalError?.stack,
    timestamp: new Date().toISOString(),
  });

  return new AppError(
    `Database operation failed: ${operation}`,
    500,
    'DATABASE_ERROR'
  );
};

/**
 * Authentication error helper
 */
export const createAuthError = (
  message: string = 'Authentication required'
): AppError => {
  return new AppError(
    message,
    401,
    'AUTHENTICATION_ERROR'
  );
};

/**
 * Authorization error helper
 */
export const createAuthorizationError = (
  message: string = 'Insufficient permissions'
): AppError => {
  return new AppError(
    message,
    403,
    'AUTHORIZATION_ERROR'
  );
};

/**
 * Rate limit error helper
 */
export const createRateLimitError = (
  retryAfter?: number
): AppError => {
  const error = new AppError(
    'Too many requests',
    429,
    'RATE_LIMIT_EXCEEDED'
  );
  
  // Add retry-after info if provided
  if (retryAfter) {
    (error as any).retryAfter = retryAfter;
  }
  
  return error;
};

/**
 * Conflict error helper
 */
export const createConflictError = (
  resource: string,
  reason: string = 'already exists'
): AppError => {
  return new AppError(
    `${resource} ${reason}`,
    409,
    'CONFLICT_ERROR'
  );
};

/**
 * Not found error helper
 */
export const createNotFoundError = (
  resource: string = 'Resource'
): AppError => {
  return new AppError(
    `${resource} not found`,
    404,
    'NOT_FOUND_ERROR'
  );
};

/**
 * Bad request error helper
 */
export const createBadRequestError = (
  message: string = 'Bad request'
): AppError => {
  return new AppError(
    message,
    400,
    'BAD_REQUEST_ERROR'
  );
};

export default {
  AppError,
  errorHandler,
  notFoundHandler,
  asyncHandler,
  createValidationError,
  createDatabaseError,
  createAuthError,
  createAuthorizationError,
  createRateLimitError,
  createConflictError,
  createNotFoundError,
  createBadRequestError,
};