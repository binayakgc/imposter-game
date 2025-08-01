// server/src/services/UserService.ts
// COMPLETE FIXED VERSION - Resolves JWT signing overload errors

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';

const prisma = new PrismaClient();

// HTTP status constants
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
} as const;

const ERROR_CODES = {
  NO_TOKEN: 'NO_TOKEN',
  INVALID_TOKEN: 'INVALID_TOKEN',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  ACCESS_DENIED: 'ACCESS_DENIED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  USER_EXISTS: 'USER_EXISTS',
} as const;

// User type without password
export interface UserWithSession {
  id: string;
  username: string;
  email: string | null;
  avatar: string | null;
  isOnline: boolean;
  lastSeen: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Authentication result interface
interface AuthResult {
  user: UserWithSession;
  token: string;
  session: {
    id: string;
    token: string;
    expiresAt: Date;
  };
}

class UserServiceClass {
  /**
   * Create a new user account
   */
  async createUser(
    username: string,
    password: string,
    email?: string
  ): Promise<AuthResult> {
    try {
      // Check if username already exists
      const existingUser = await prisma.user.findUnique({
        where: { username }
      });

      if (existingUser) {
        throw new AppError(
          'Username already exists',
          HTTP_STATUS.CONFLICT,
          ERROR_CODES.USER_EXISTS
        );
      }

      // Hash password
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Create user
      const user = await prisma.user.create({
        data: {
          username,
          password: hashedPassword,
          email: email || null,
          isOnline: true,
          lastSeen: new Date(),
        }
      });

      // ✅ FIXED: Proper JWT environment variable handling with explicit checks
      const JWT_SECRET = process.env.JWT_SECRET;
      if (!JWT_SECRET || JWT_SECRET.trim() === '') {
        logger.error('JWT_SECRET environment variable is not set or empty');
        throw new AppError(
          'Server configuration error',
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          ERROR_CODES.VALIDATION_ERROR
        );
      }
      const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
      
      const token = jwt.sign(
        { 
          userId: user.id, 
          type: 'session' 
        },
        JWT_SECRET,
        { 
          expiresIn: JWT_EXPIRES_IN 
        }
      );

      // Create session
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now
      
      const session = await prisma.userSession.create({
        data: {
          userId: user.id,
          token,
          socketId: null,
          expiresAt,
          isActive: true,
          lastUsed: new Date(),
        }
      });

      // Return user without password
      const { password: _, ...userWithoutPassword } = user;

      logger.debug('User created successfully', {
        userId: user.id,
        username: user.username,
      });

      return {
        user: userWithoutPassword,
        token,
        session: {
          id: session.id,
          token: session.token,
          expiresAt: session.expiresAt,
        }
      };

    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error('Failed to create user', { 
        error: errorMessage, 
        username 
      });
      
      throw new AppError(
        'Failed to create user account',
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        ERROR_CODES.VALIDATION_ERROR
      );
    }
  }

  /**
   * Authenticate user login
   */
  async loginUser(username: string, password: string, socketId?: string): Promise<AuthResult> {
    try {
      // Find user by username
      const user = await prisma.user.findUnique({
        where: { username }
      });

      if (!user) {
        throw new AppError(
          'Invalid credentials',
          HTTP_STATUS.UNAUTHORIZED,
          ERROR_CODES.INVALID_CREDENTIALS
        );
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        throw new AppError(
          'Invalid credentials',
          HTTP_STATUS.UNAUTHORIZED,
          ERROR_CODES.INVALID_CREDENTIALS
        );
      }

      // Update user online status
      await prisma.user.update({
        where: { id: user.id },
        data: {
          isOnline: true,
          lastSeen: new Date()
        }
      });

      // ✅ FIXED: JWT signing with proper environment variable handling
      const JWT_SECRET = process.env.JWT_SECRET;
      if (!JWT_SECRET) {
        throw new AppError(
          'JWT_SECRET environment variable is not set',
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          ERROR_CODES.VALIDATION_ERROR
        );
      }
      const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
      
      const token = jwt.sign(
        { 
          userId: user.id, 
          type: 'session' 
        },
        JWT_SECRET,
        { 
          expiresIn: JWT_EXPIRES_IN 
        }
      );

      // Create session
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now
      
      const session = await prisma.userSession.create({
        data: {
          userId: user.id,
          token,
          socketId: socketId || null,
          expiresAt,
          isActive: true,
          lastUsed: new Date(),
        }
      });

      // Remove password from response
      const { password: _, ...userWithoutPassword } = user;

      logger.debug('User authenticated successfully', {
        userId: user.id,
        username: user.username,
        endpoint: 'login',
      });

      return {
        user: userWithoutPassword,
        token,
        session: {
          id: session.id,
          token: session.token,
          expiresAt: session.expiresAt,
        }
      };

    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      
      const errorMessage = error instanceof Error ? error.message : 'Authentication failed';
      logger.warn('Authentication failed', { 
        error: errorMessage,
        username,
      });
      
      throw new AppError(
        'Authentication failed',
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.INVALID_CREDENTIALS
      );
    }
  }

  /**
   * Validate session token
   */
  async validateSession(token: string): Promise<UserWithSession | null> {
    try {
      // ✅ FIXED: JWT verification with proper environment variable handling
      const JWT_SECRET = process.env.JWT_SECRET;
      if (!JWT_SECRET) {
        logger.error('JWT_SECRET environment variable is not set');
        return null;
      }
      
      let decoded: { userId: string };
      try {
        decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      } catch (jwtError) {
        logger.debug('JWT verification failed', { 
          error: jwtError instanceof Error ? jwtError.message : 'JWT error' 
        });
        return null;
      }
      
      // Find active session
      const session = await prisma.userSession.findFirst({
        where: {
          token,
          isActive: true,
          expiresAt: {
            gt: new Date()
          }
        },
        include: {
          user: true
        }
      });

      if (!session) {
        logger.debug('No active session found for token');
        return null;
      }

      // Update last used
      await prisma.userSession.update({
        where: { id: session.id },
        data: { lastUsed: new Date() }
      });

      // Return user without password
      const { password: _, ...userWithoutPassword } = session.user;
      return userWithoutPassword;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Token validation failed';
      logger.warn('Invalid session token', { 
        error: errorMessage
      });
      return null;
    }
  }

  /**
   * Update user socket ID
   */
  async updateUserSocket(userId: string, socketId: string): Promise<void> {
    try {
      // Update user's active sessions
      await prisma.userSession.updateMany({
        where: { 
          userId,
          isActive: true 
        },
        data: { 
          socketId,
          lastUsed: new Date()
        }
      });

      // Update user online status
      await prisma.user.update({
        where: { id: userId },
        data: { 
          isOnline: true,
          lastSeen: new Date()
        }
      });

      logger.debug('User socket updated', {
        userId,
        socketId,
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update socket';
      logger.error('Failed to update user socket', { 
        error: errorMessage,
        userId,
        socketId,
      });
      throw new AppError(
        'Failed to update user socket',
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        ERROR_CODES.VALIDATION_ERROR
      );
    }
  }

  /**
   * Logout user and invalidate session
   */
  async logoutUser(token: string): Promise<void> {
    try {
      // Find and deactivate session
      const session = await prisma.userSession.findFirst({
        where: { token, isActive: true },
        include: { user: true }
      });

      if (session) {
        // Deactivate session
        await prisma.userSession.update({
          where: { id: session.id },
          data: { isActive: false }
        });

        // Update user offline status
        await prisma.user.update({
          where: { id: session.userId },
          data: { 
            isOnline: false,
            lastSeen: new Date() 
          }
        });

        logger.debug('User logged out successfully', {
          userId: session.userId,
          username: session.user.username,
        });
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Logout failed';
      logger.warn('Logout failed', { 
        error: errorMessage,
        token: token.substring(0, 10) + '...' // Log only first 10 chars for security
      });
    }
  }

  /**
   * Check if username is available
   */
  async isUsernameAvailable(username: string): Promise<boolean> {
    try {
      const existingUser = await prisma.user.findUnique({
        where: { username }
      });
      
      return !existingUser;
    } catch (error) {
      logger.error('Failed to check username availability', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        username 
      });
      return false;
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<UserWithSession | null> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) return null;

      const { password: _, ...userWithoutPassword } = user;
      return userWithoutPassword;

    } catch (error) {
      logger.error('Failed to get user by ID', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId 
      });
      return null;
    }
  }

  /**
   * Update user profile
   */
  async updateUserProfile(
    userId: string,
    updates: {
      username?: string;
      email?: string;
      avatar?: string;
    }
  ): Promise<UserWithSession | null> {
    try {
      // Check if new username is available
      if (updates.username) {
        const existingUser = await prisma.user.findFirst({
          where: {
            username: updates.username,
            id: { not: userId }
          }
        });

        if (existingUser) {
          throw new AppError(
            'Username already exists',
            HTTP_STATUS.CONFLICT,
            ERROR_CODES.USER_EXISTS
          );
        }
      }

      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          ...updates,
          updatedAt: new Date()
        }
      });

      const { password: _, ...userWithoutPassword } = user;
      return userWithoutPassword;

    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Update failed';
      logger.error('Failed to update user profile', { 
        error: errorMessage,
        userId,
        updates 
      });
      
      throw new AppError(
        'Failed to update profile',
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        ERROR_CODES.VALIDATION_ERROR
      );
    }
  }
}

export const UserService = new UserServiceClass();