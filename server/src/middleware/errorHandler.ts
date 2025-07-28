// server/src/middleware/errorHandler.ts
// Professional error handling middleware (FIXED VERSION)

import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';
import { isDevelopment } from '../config/environment';

// Import shared constants with correct path
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
} as const;

const ERROR_CODES = {
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_FULL: 'ROOM_FULL',
  ROOM_INACTIVE: 'ROOM_INACTIVE',
  INVALID_ROOM_CODE: 'INVALID_ROOM_CODE',
  PLAYER_NOT_FOUND: 'PLAYER_NOT_FOUND',
  PLAYER_NAME_TAKEN: 'PLAYER_NAME_TAKEN',
  INVALID_PLAYER_NAME: 'INVALID_PLAYER_NAME',
  PLAYER_NOT_IN_ROOM: 'PLAYER_NOT_IN_ROOM',
  GAME_NOT_FOUND: 'GAME_NOT_FOUND',
  GAME_NOT_STARTED: 'GAME_NOT_STARTED',
  GAME_ALREADY_STARTED: 'GAME_ALREADY_STARTED',
  NOT_ENOUGH_PLAYERS: 'NOT_ENOUGH_PLAYERS',
  INVALID_GAME_STATE: 'INVALID_GAME_STATE',
  WORD_ALREADY_SUBMITTED: 'WORD_ALREADY_SUBMITTED',
  VOTE_ALREADY_SUBMITTED: 'VOTE_ALREADY_SUBMITTED',
  NOT_WORD_GIVER: 'NOT_WORD_GIVER',
  INVALID_VOTE_TARGET: 'INVALID_VOTE_TARGET',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

// Custom error class
export class AppError extends Error {
  public statusCode: number;
  public errorCode: string;
  public isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = HTTP_STATUS.INTERNAL_SERVER_ERROR,
    errorCode: string = ERROR_CODES.INTERNAL_ERROR,
    isOperational: boolean = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Error response interface
interface ErrorResponse {
  success: false;
  error: string;
  code: string;
  timestamp: string;
  path: string;
  details?: any;
}

// Handle Prisma errors
const handlePrismaError = (error: Prisma.PrismaClientKnownRequestError): AppError => {
  switch (error.code) {
    case 'P2002':
      return new AppError(
        'A record with this information already exists',
        HTTP_STATUS.CONFLICT,
        ERROR_CODES.VALIDATION_ERROR
      );
    case 'P2025':
      return new AppError(
        'Record not found',
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.DATABASE_ERROR
      );
    case 'P2003':
      return new AppError(
        'Invalid reference to related record',
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR
      );
    default:
      return new AppError(
        'Database operation failed',
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        ERROR_CODES.DATABASE_ERROR
      );
  }
};

// Handle Zod validation errors
const handleZodError = (error: ZodError): AppError => {
  const messages = error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`);
  return new AppError(
    `Validation failed: ${messages.join(', ')}`,
    HTTP_STATUS.BAD_REQUEST,
    ERROR_CODES.VALIDATION_ERROR
  );
};

// Main error handling middleware
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let appError: AppError;

  // Convert different error types to AppError
  if (error instanceof AppError) {
    appError = error;
  } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    appError = handlePrismaError(error);
  } else if (error instanceof ZodError) {
    appError = handleZodError(error);
  } else if (error instanceof Prisma.PrismaClientValidationError) {
    appError = new AppError(
      'Invalid data provided',
      HTTP_STATUS.BAD_REQUEST,
      ERROR_CODES.VALIDATION_ERROR
    );
  } else {
    // Unknown error
    appError = new AppError(
      isDevelopment() ? error.message : 'Something went wrong',
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      ERROR_CODES.INTERNAL_ERROR,
      false
    );
  }

  // Log error
  logger.error('API Error', {
    message: appError.message,
    statusCode: appError.statusCode,
    errorCode: appError.errorCode,
    path: req.path,
    method: req.method,
    stack: isDevelopment() ? error.stack : undefined,
    body: req.body,
    params: req.params,
    query: req.query,
  });

  // Create error response
  const errorResponse: ErrorResponse = {
    success: false,
    error: appError.message,
    code: appError.errorCode,
    timestamp: new Date().toISOString(),
    path: req.path,
  };

  // Add error details in development
  if (isDevelopment()) {
    errorResponse.details = {
      stack: error.stack,
      originalError: error.message,
    };
  }

  // Send error response
  res.status(appError.statusCode).json(errorResponse);
};

// 404 handler
export const notFoundHandler = (req: Request, res: Response): void => {
  const errorResponse: ErrorResponse = {
    success: false,
    error: `Route ${req.method} ${req.path} not found`,
    code: ERROR_CODES.VALIDATION_ERROR,
    timestamp: new Date().toISOString(),
    path: req.path,
  };

  res.status(HTTP_STATUS.NOT_FOUND).json(errorResponse);
};

// Async error wrapper
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
};