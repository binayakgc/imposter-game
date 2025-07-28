// server/src/middleware/validation.ts
// Request validation middleware using Joi

import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { AppError } from './errorHandler';

// HTTP Status codes
const HTTP_STATUS = {
  BAD_REQUEST: 400,
} as const;

const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;

// Validation schemas
export const validationSchemas = {
  // Room creation
  createRoom: Joi.object({
    name: Joi.string().min(3).max(30).optional(),
    isPublic: Joi.boolean().required(),
    maxPlayers: Joi.number().integer().min(4).max(10).optional(),
    themeMode: Joi.boolean().optional(),
    hostName: Joi.string().min(2).max(20).required(),
  }),

  // Room joining
  joinRoom: Joi.object({
    roomCode: Joi.string().length(6).uppercase().required(),
    playerName: Joi.string().min(2).max(20).required(),
  }),

  // Room updates
  updateRoom: Joi.object({
    name: Joi.string().min(3).max(30).optional(),
    maxPlayers: Joi.number().integer().min(4).max(10).optional(),
    themeMode: Joi.boolean().optional(),
    isActive: Joi.boolean().optional(),
  }),

  // Player updates
  updatePlayer: Joi.object({
    name: Joi.string().min(2).max(20).optional(),
    isOnline: Joi.boolean().optional(),
  }),

  // Game actions
  startGame: Joi.object({
    roomId: Joi.string().required(),
  }),

  submitWord: Joi.object({
    gameId: Joi.string().required(),
    word: Joi.string().min(2).max(50).required(),
  }),

  submitVote: Joi.object({
    gameId: Joi.string().required(),
    votedFor: Joi.string().required(),
  }),

  // Query parameters
  roomQuery: Joi.object({
    isPublic: Joi.boolean().optional(),
    maxPlayers: Joi.number().integer().min(4).max(10).optional(),
    themeMode: Joi.boolean().optional(),
  }),

  // URL parameters
  roomId: Joi.object({
    roomId: Joi.string().required(),
  }),

  playerId: Joi.object({
    playerId: Joi.string().required(),
  }),

  gameId: Joi.object({
    gameId: Joi.string().required(),
  }),

  roomCode: Joi.object({
    roomCode: Joi.string().length(6).uppercase().required(),
  }),
};

/**
 * Create validation middleware for request body
 */
export const validateBody = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const errorMessages = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      throw new AppError(
        `Validation failed: ${errorMessages.map(e => `${e.field}: ${e.message}`).join(', ')}`,
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    // Replace request body with validated and sanitized data
    req.body = value;
    next();
  };
};

/**
 * Create validation middleware for query parameters
 */
export const validateQuery = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const errorMessages = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      throw new AppError(
        `Query validation failed: ${errorMessages.map(e => `${e.field}: ${e.message}`).join(', ')}`,
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    // Replace request query with validated data
    req.query = value;
    next();
  };
};

/**
 * Create validation middleware for URL parameters
 */
export const validateParams = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const errorMessages = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      throw new AppError(
        `Parameter validation failed: ${errorMessages.map(e => `${e.field}: ${e.message}`).join(', ')}`,
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    // Replace request params with validated data
    req.params = value;
    next();
  };
};

/**
 * Validate all request parts (params, query, body)
 */
export const validateRequest = (schemas: {
  params?: Joi.ObjectSchema;
  query?: Joi.ObjectSchema;
  body?: Joi.ObjectSchema;
}) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Validate params
      if (schemas.params) {
        const { error: paramsError, value: paramsValue } = schemas.params.validate(req.params, {
          abortEarly: false,
          stripUnknown: true,
          convert: true,
        });

        if (paramsError) {
          const errorMessages = paramsError.details.map(detail => 
            `${detail.path.join('.')}: ${detail.message}`
          );
          throw new AppError(
            `Parameter validation failed: ${errorMessages.join(', ')}`,
            HTTP_STATUS.BAD_REQUEST,
            ERROR_CODES.VALIDATION_ERROR
          );
        }
        req.params = paramsValue;
      }

      // Validate query
      if (schemas.query) {
        const { error: queryError, value: queryValue } = schemas.query.validate(req.query, {
          abortEarly: false,
          stripUnknown: true,
          convert: true,
        });

        if (queryError) {
          const errorMessages = queryError.details.map(detail => 
            `${detail.path.join('.')}: ${detail.message}`
          );
          throw new AppError(
            `Query validation failed: ${errorMessages.join(', ')}`,
            HTTP_STATUS.BAD_REQUEST,
            ERROR_CODES.VALIDATION_ERROR
          );
        }
        req.query = queryValue;
      }

      // Validate body
      if (schemas.body) {
        const { error: bodyError, value: bodyValue } = schemas.body.validate(req.body, {
          abortEarly: false,
          stripUnknown: true,
          convert: true,
        });

        if (bodyError) {
          const errorMessages = bodyError.details.map(detail => 
            `${detail.path.join('.')}: ${detail.message}`
          );
          throw new AppError(
            `Body validation failed: ${errorMessages.join(', ')}`,
            HTTP_STATUS.BAD_REQUEST,
            ERROR_CODES.VALIDATION_ERROR
          );
        }
        req.body = bodyValue;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Sanitize string input
 */
export const sanitizeInput = (input: string): string => {
  if (typeof input !== 'string') return input;
  
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .substring(0, 1000); // Limit length
};

/**
 * Custom Joi extensions
 */
export const customJoi = Joi.extend({
  type: 'string',
  base: Joi.string(),
  messages: {
    'string.sanitized': 'Input has been sanitized',
  },
  rules: {
    sanitize: {
      method() {
        return this.$_addRule('sanitize');
      },
      validate(value, helpers) {
        return sanitizeInput(value);
      },
    },
  },
});

/**
 * Rate limiting validation (additional check)
 */
export const validateRateLimit = (maxRequests: number = 100, windowMs: number = 900000) => {
  const requests = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    
    const clientData = requests.get(clientIP);
    
    if (!clientData || now > clientData.resetTime) {
      // Reset or initialize
      requests.set(clientIP, {
        count: 1,
        resetTime: now + windowMs,
      });
      next();
      return;
    }

    if (clientData.count >= maxRequests) {
      throw new AppError(
        'Too many requests, please try again later',
        429, // Too Many Requests
        'RATE_LIMIT_EXCEEDED'
      );
    }

    clientData.count++;
    next();
  };
};