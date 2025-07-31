// server/src/middleware/authMiddleware.ts
// COMPLETE FIXED VERSION - Resolves all TypeScript errors

import { Request, Response, NextFunction } from 'express';
import { UserService } from '../services/UserService';
import { logger } from '../utils/logger';
import { AppError } from './errorHandler';

// ✅ FIXED: Extend Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username: string;
        email: string | null;
        avatar: string | null;
        isOnline: boolean;
        lastSeen: Date;
        createdAt: Date;
        updatedAt: Date;
      };
      sessionToken?: string;
    }
  }
}

// ✅ FIXED: Complete HTTP status constants
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,  // ✅ FIXED: Added missing constant
} as const;

const ERROR_CODES = {
  NO_TOKEN: 'NO_TOKEN',
  INVALID_TOKEN: 'INVALID_TOKEN',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  ACCESS_DENIED: 'ACCESS_DENIED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
} as const;

/**
 * Authentication middleware - validates JWT tokens
 */
export const authenticate = async (
  req: Request, 
  res: Response, 
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractToken(req);
    
    if (!token) {
      throw new AppError(
        'Access token is required',
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.NO_TOKEN
      );
    }

    // Validate session
    const user = await UserService.validateSession(token);
    
    if (!user) {
      throw new AppError(
        'Invalid or expired token',
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.INVALID_TOKEN
      );
    }

    // ✅ FIXED: Attach user and token to request
    req.user = user;
    req.sessionToken = token;

    logger.debug('User authenticated successfully', {
      userId: user.id,
      username: user.username,
      endpoint: req.path,
    });

    next();

  } catch (error) {
    // ✅ FIXED: Proper error handling for unknown type
    const errorMessage = error instanceof Error ? error.message : 'Authentication failed';
    
    logger.warn('Authentication failed', { 
      error: errorMessage,
      endpoint: req.path,
      ip: req.ip,
    });

    // ✅ FIXED: Check if error is AppError and handle appropriately
    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.errorCode,
      });
    } else {
      res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: 'Authentication failed',
        code: ERROR_CODES.AUTHENTICATION_ERROR,
      });
    }
  }
};

/**
 * Optional authentication middleware - continues without auth
 */
export const optionalAuth = async (
  req: Request, 
  res: Response, 
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractToken(req);
    
    if (token) {
      const user = await UserService.validateSession(token);
      if (user) {
        req.user = user;
        req.sessionToken = token;
        
        logger.debug('Optional auth - user identified', {
          userId: user.id,
          username: user.username,
        });
      }
    }

    // ✅ FIXED: Always continue to next middleware
    next();

  } catch (error) {
    // ✅ FIXED: Proper error handling - log but don't block request
    const errorMessage = error instanceof Error ? error.message : 'Optional auth failed';
    
    logger.debug('Optional auth failed - continuing without auth', { 
      error: errorMessage,
      endpoint: req.path,
    });
    
    // Continue without authentication
    next();
  }
};

/**
 * Socket authentication middleware
 */
export const authenticateSocket = async (socketId: string, token: string) => {
  try {
    if (!token) {
      return null;
    }

    const user = await UserService.validateSession(token);
    
    if (user) {
      // Update user's socket ID
      await UserService.updateUserSocket(user.id, socketId);
      return user;
    }

    return null;

  } catch (error) {
    // ✅ FIXED: Proper error handling for socket auth
    const errorMessage = error instanceof Error ? error.message : 'Socket auth failed';
    
    logger.warn('Socket authentication failed', { 
      error: errorMessage,
      socketId 
    });
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

  // Check cookies (if using cookie-based auth)
  if (req.cookies && req.cookies.auth_token) {
    return req.cookies.auth_token;
  }

  return null;
};

/**
 * Role-based access control middleware
 */
export const requireRole = (requiredRole: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw new AppError(
          'Authentication required',
          HTTP_STATUS.UNAUTHORIZED,
          ERROR_CODES.NO_TOKEN
        );
      }

      // For future role expansion - currently all users have same access level
      // This is prepared for when you add role field to User model
      
      next();

    } catch (error) {
      // ✅ FIXED: Proper error handling
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          error: error.message,
          code: error.errorCode,
        });
      } else {
        res.status(HTTP_STATUS.FORBIDDEN).json({
          success: false,
          error: 'Access denied',
          code: ERROR_CODES.ACCESS_DENIED,
        });
      }
    }
  };
};

/**
 * Rate limiting per user
 */
export const userRateLimit = (maxRequests: number, windowMs: number) => {
  const userRequests = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const userId = req.user?.id || req.ip || 'anonymous';
      const now = Date.now();
      
      const userLimit = userRequests.get(userId);
      
      if (!userLimit || now > userLimit.resetTime) {
        // Reset or create new limit window
        userRequests.set(userId, {
          count: 1,
          resetTime: now + windowMs
        });
        next();
        return;
      }

      if (userLimit.count >= maxRequests) {
        res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
          success: false,
          error: 'Too many requests',
          code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
          retryAfter: Math.ceil((userLimit.resetTime - now) / 1000)
        });
        return;
      }

      // Increment counter
      userLimit.count++;
      next();

    } catch (error) {
      // ✅ FIXED: Proper error handling
      const errorMessage = error instanceof Error ? error.message : 'Rate limiting error';
      
      logger.error('Rate limiting error', { 
        error: errorMessage,
        userId: req.user?.id,
      });
      
      // Continue on rate limit errors
      next();
    }
  };
};

/**
 * Admin role middleware (for future use)
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  try {
    if (!req.user) {
      throw new AppError(
        'Authentication required',
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.NO_TOKEN
      );
    }

    // TODO: Add admin role check when role system is implemented
    // For now, all authenticated users can access admin functions
    next();

  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.errorCode,
      });
    } else {
      res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        error: 'Admin access required',
        code: ERROR_CODES.ACCESS_DENIED,
      });
    }
  }
};

/**
 * Validate user owns resource
 */
export const validateResourceOwnership = (getUserIdFromParams: (req: Request) => string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw new AppError(
          'Authentication required',
          HTTP_STATUS.UNAUTHORIZED,
          ERROR_CODES.NO_TOKEN
        );
      }

      const resourceUserId = getUserIdFromParams(req);
      
      if (req.user.id !== resourceUserId) {
        throw new AppError(
          'Access denied - you can only access your own resources',
          HTTP_STATUS.FORBIDDEN,
          ERROR_CODES.ACCESS_DENIED
        );
      }

      next();

    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          error: error.message,
          code: error.errorCode,
        });
      } else {
        const errorMessage = error instanceof Error ? error.message : 'Access validation failed';
        
        logger.error('Resource ownership validation failed', { 
          error: errorMessage,
          userId: req.user?.id,
        });
        
        res.status(HTTP_STATUS.FORBIDDEN).json({
          success: false,
          error: 'Access denied',
          code: ERROR_CODES.ACCESS_DENIED,
        });
      }
    }
  };
};

/**
 * Alias for authenticate middleware (for backward compatibility)
 */
export const validateAuthMiddleware = authenticate;

export default {
  authenticate,
  optionalAuth,
  authenticateSocket,
  extractToken,
  requireRole,
  userRateLimit,
  requireAdmin,
  validateResourceOwnership,
  validateAuthMiddleware,  // ✅ FIXED: Add alias for backward compatibility
};