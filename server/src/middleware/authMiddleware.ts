// server/src/middleware/authMiddleware.ts
// JWT authentication middleware

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserService } from '../services/UserService';
import { logger } from '../utils/logger';
import { AppError } from './errorHandler';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';

// Extend Express Request interface to include user data
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      user?: {
        id: string;
        username: string;
        email?: string;
        avatar?: string;
        isOnline: boolean;
      };
      sessionToken?: string;
    }
  }
}

/**
 * Middleware to validate JWT tokens and authenticate users
 */
export const validateAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : null;

    if (!token) {
      throw new AppError(
        'Access token is required',
        401,
        'NO_TOKEN_PROVIDED'
      );
    }

    // Validate session
    const session = await UserService.validateSession(token);

    if (!session) {
      throw new AppError(
        'Invalid or expired token',
        401,
        'INVALID_TOKEN'
      );
    }

    // Add user data to request object
    req.userId = session.user.id;
    req.user = session.user;
    req.sessionToken = token;

    logger.debug('User authenticated successfully', {
      userId: session.user.id,
      username: session.user.username,
      endpoint: req.path,
    });

    next();

  } catch (error) {
    logger.warn('Authentication failed', {
      error: error.message,
      endpoint: req.path,
      ip: req.ip,
    });

    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.code,
      });
    } else {
      res.status(401).json({
        success: false,
        error: 'Authentication failed',
        code: 'AUTH_FAILED',
      });
    }
  }
};

/**
 * Optional auth middleware - doesn't throw error if no token
 * Useful for endpoints that work with or without authentication
 */
export const optionalAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : null;

    if (token) {
      const session = await UserService.validateSession(token);
      
      if (session) {
        req.userId = session.user.id;
        req.user = session.user;
        req.sessionToken = token;
        
        logger.debug('Optional auth: User authenticated', {
          userId: session.user.id,
          username: session.user.username,
        });
      }
    }

    next();

  } catch (error) {
    // Don't throw error for optional auth, just continue without auth
    logger.debug('Optional auth failed, continuing without authentication', {
      error: error.message,
    });
    next();
  }
};

/**
 * Middleware to check if user is authenticated for socket connections
 */
export const validateSocketAuth = async (token: string) => {
  try {
    if (!token) {
      return null;
    }

    const session = await UserService.validateSession(token);
    return session;

  } catch (error) {
    logger.warn('Socket authentication failed', { error: error.message });
    return null;
  }
};

/**
 * Helper function to extract token from various sources
 */
export const extractToken = (req: Request): string | null => {
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Check query parameter (for WebSocket handshake)
  if (req.query.token && typeof req.query.token === 'string') {
    return req.query.token;
  }

  // Check cookies
  if (req.cookies && req.cookies.authToken) {
    return req.cookies.authToken;
  }

  return null;
};