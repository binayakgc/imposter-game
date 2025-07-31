// server/src/services/UserService.ts
// COMPLETE FIXED VERSION - Resolves all TypeScript errors

import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// ✅ FIXED: Complete HTTP status constants
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,  // ✅ FIXED: Added missing constant
} as const;

const ERROR_CODES = {
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  USERNAME_TAKEN: 'USERNAME_TAKEN',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  TOKEN_INVALID: 'TOKEN_INVALID',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
} as const;

// Updated interfaces to match schema
export interface CreateUserParams {
  username: string;
  email?: string;
  password: string;
  avatar?: string;
}

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

export interface AuthResult {
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
  async createUser(params: CreateUserParams): Promise<UserWithSession> {
    const { username, email, password, avatar } = params;

    try {
      // Check if username already exists
      const existingUser = await prisma.user.findUnique({
        where: { username }
      });

      if (existingUser) {
        throw new AppError(
          'Username is already taken',
          HTTP_STATUS.CONFLICT,
          ERROR_CODES.USERNAME_TAKEN
        );
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Create user
      const user = await prisma.user.create({
        data: {
          username,
          email: email || null,
          password: hashedPassword,
          avatar: avatar || null,
          isOnline: true,
          lastSeen: new Date(),
        }
      });

      // ✅ FIXED: Remove password from return object
      const { password: _, ...userWithoutPassword } = user;
      
      logger.info('User created successfully', {
        userId: user.id,
        username: user.username,
      });

      return userWithoutPassword;

    } catch (error) {
      // ✅ FIXED: Proper error handling for unknown type
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
        HTTP_STATUS.INTERNAL_SERVER_ERROR,  // ✅ FIXED: Use proper constant
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

      // ✅ FIXED: JWT signing with correct parameter types
      const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';
      const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
      
      // ✅ FIXED: Ensure JWT_SECRET is a string (not null)
      const secretBuffer = Buffer.from(JWT_SECRET, 'utf8');
      
      const token = jwt.sign(
        { 
          userId: user.id, 
          type: 'session' 
        },
        secretBuffer,  // ✅ Use Buffer instead of string
        { 
          expiresIn: JWT_EXPIRES_IN 
        }
      );

      // ✅ FIXED: Create session with proper date handling
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

      // ✅ FIXED: Remove password from response
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
      // ✅ FIXED: Proper error handling for unknown type
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
      // ✅ FIXED: JWT verification with proper error handling
      const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';
      
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

      // ✅ FIXED: Return user without password
      const { password: _, ...userWithoutPassword } = session.user;
      return userWithoutPassword;

    } catch (error) {
      // ✅ FIXED: Proper error handling for unknown type
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
      // ✅ FIXED: Proper error handling
      const errorMessage = error instanceof Error ? error.message : 'Socket update failed';
      logger.error('Failed to update user socket', { 
        error: errorMessage, 
        userId, 
        socketId 
      });
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<void> {
    try {
      const deletedSessions = await prisma.userSession.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: new Date() } },
            { isActive: false }
          ]
        }
      });

      logger.info('Cleaned up expired sessions', {
        deletedCount: deletedSessions.count
      });

    } catch (error) {
      // ✅ FIXED: Proper error handling
      const errorMessage = error instanceof Error ? error.message : 'Session cleanup failed';
      logger.error('Failed to cleanup expired sessions', { 
        error: errorMessage 
      });
    }
  }

  /**
   * Logout user (invalidate session)
   */
  async logoutUser(token: string): Promise<void> {
    try {
      const session = await prisma.userSession.findFirst({
        where: { token },
        include: { user: true }
      });

      if (session) {
        // Invalidate session
        await prisma.userSession.update({
          where: { id: session.id },
          data: { 
            isActive: false,
            socketId: null 
          }
        });

        // Update user offline status if no other active sessions
        const activeSessionsCount = await prisma.userSession.count({
          where: {
            userId: session.userId,
            isActive: true,
            expiresAt: { gt: new Date() }
          }
        });

        if (activeSessionsCount === 0) {
          await prisma.user.update({
            where: { id: session.userId },
            data: { isOnline: false }
          });
        }

        logger.debug('User logged out successfully', { 
          userId: session.userId,
          username: session.user.username 
        });
      }
      
    } catch (error) {
      // ✅ FIXED: Proper error handling
      const errorMessage = error instanceof Error ? error.message : 'Logout failed';
      logger.error('Failed to logout user', { 
        error: errorMessage 
      });
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

      if (!user) {
        return null;
      }

      // ✅ FIXED: Remove password from response
      const { password: _, ...userWithoutPassword } = user;
      return userWithoutPassword;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get user';
      logger.error('Failed to get user by ID', { 
        error: errorMessage, 
        userId 
      });
      return null;
    }
  }

  /**
   * Get user by username
   */
  async getUserByUsername(username: string): Promise<UserWithSession | null> {
    try {
      const user = await prisma.user.findUnique({
        where: { username }
      });

      if (!user) {
        return null;
      }

      // ✅ FIXED: Remove password from response
      const { password: _, ...userWithoutPassword } = user;
      return userWithoutPassword;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get user';
      logger.error('Failed to get user by username', { 
        error: errorMessage, 
        username 
      });
      return null;
    }
  }

  /**
   * Update user profile
   */
  async updateUserProfile(userId: string, updates: {
    username?: string;
    email?: string;
    avatar?: string;
  }): Promise<UserWithSession> {
    try {
      // Check if username is taken (if updating username)
      if (updates.username) {
        const existingUser = await prisma.user.findFirst({
          where: {
            username: updates.username,
            NOT: { id: userId }
          }
        });

        if (existingUser) {
          throw new AppError(
            'Username is already taken',
            HTTP_STATUS.CONFLICT,
            ERROR_CODES.USERNAME_TAKEN
          );
        }
      }

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          ...updates,
          updatedAt: new Date()
        }
      });

      // ✅ FIXED: Remove password from response
      const { password: _, ...userWithoutPassword } = updatedUser;

      logger.info('User profile updated', {
        userId,
        updates,
      });

      return userWithoutPassword;

    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Profile update failed';
      logger.error('Failed to update user profile', { 
        error: errorMessage, 
        userId, 
        updates 
      });
      
      throw new AppError(
        'User not found',
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.USER_NOT_FOUND
      );
    }
  }
}

export const UserService = new UserServiceClass();