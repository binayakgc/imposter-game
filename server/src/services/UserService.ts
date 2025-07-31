// server/src/services/UserService.ts
// Complete user authentication and management service with full validation

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const SALT_ROUNDS = 12;

// Interfaces
export interface RegisterUserParams {
  username: string;
  password: string;
  email?: string;
  avatar?: string;
}

export interface LoginUserParams {
  username: string;
  password: string;
}

export interface AuthResponse {
  user: {
    id: string;
    username: string;
    email?: string;
    avatar?: string;
    isOnline: boolean;
    createdAt: Date;
  };
  token: string;
  expiresAt: Date;
}

export interface UserSession {
  id: string;
  userId: string;
  token: string;
  socketId?: string;
  isActive: boolean;
  expiresAt: Date;
  user: {
    id: string;
    username: string;
    email?: string;
    avatar?: string;
    isOnline: boolean;
  };
}

class UserServiceClass {
  /**
   * Validate username format
   */
  private validateUsername(username: string): { isValid: boolean; error?: string } {
    if (!username || typeof username !== 'string') {
      return { isValid: false, error: 'Username is required' };
    }

    const trimmed = username.trim();
    
    if (trimmed.length < 2) {
      return { isValid: false, error: 'Username must be at least 2 characters long' };
    }

    if (trimmed.length > 20) {
      return { isValid: false, error: 'Username must be 20 characters or less' };
    }

    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      return { isValid: false, error: 'Username can only contain letters, numbers, and underscores' };
    }

    // Check for reserved usernames
    const reserved = ['admin', 'root', 'system', 'guest', 'user', 'test', 'null', 'undefined'];
    if (reserved.includes(trimmed.toLowerCase())) {
      return { isValid: false, error: 'This username is reserved and cannot be used' };
    }

    return { isValid: true };
  }

  /**
   * Validate password strength
   */
  private validatePassword(password: string): { isValid: boolean; error?: string } {
    if (!password || typeof password !== 'string') {
      return { isValid: false, error: 'Password is required' };
    }

    if (password.length < 6) {
      return { isValid: false, error: 'Password must be at least 6 characters long' };
    }

    if (password.length > 100) {
      return { isValid: false, error: 'Password is too long' };
    }

    // Check for common weak passwords
    const weakPasswords = ['password', '123456', 'password123', 'qwerty', 'abc123'];
    if (weakPasswords.includes(password.toLowerCase())) {
      return { isValid: false, error: 'Please choose a stronger password' };
    }

    return { isValid: true };
  }

  /**
   * Validate email format
   */
  private validateEmail(email: string): { isValid: boolean; error?: string } {
    if (!email || typeof email !== 'string') {
      return { isValid: false, error: 'Email is required' };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return { isValid: false, error: 'Please provide a valid email address' };
    }

    if (email.length > 100) {
      return { isValid: false, error: 'Email address is too long' };
    }

    return { isValid: true };
  }

  /**
   * Sanitize string input
   */
  private sanitizeString(input: string): string {
    return input.trim().replace(/\s+/g, ' ');
  }

  /**
   * Register a new user with complete validation
   */
  async registerUser(params: RegisterUserParams): Promise<AuthResponse> {
    const { username, password, email, avatar } = params;

    // Validate username
    const usernameValidation = this.validateUsername(username);
    if (!usernameValidation.isValid) {
      throw new AppError(usernameValidation.error!, 400, 'INVALID_USERNAME');
    }

    // Validate password
    const passwordValidation = this.validatePassword(password);
    if (!passwordValidation.isValid) {
      throw new AppError(passwordValidation.error!, 400, 'INVALID_PASSWORD');
    }

    // Validate email if provided
    if (email) {
      const emailValidation = this.validateEmail(email);
      if (!emailValidation.isValid) {
        throw new AppError(emailValidation.error!, 400, 'INVALID_EMAIL');
      }
    }

    const sanitizedUsername = this.sanitizeString(username).toLowerCase();
    const sanitizedEmail = email ? this.sanitizeString(email).toLowerCase() : undefined;

    // Check if username already exists
    const existingUser = await prisma.user.findUnique({
      where: { username: sanitizedUsername }
    });

    if (existingUser) {
      throw new AppError(
        'Username is already taken',
        409,
        'USERNAME_TAKEN'
      );
    }

    // Check if email already exists (if provided)
    if (sanitizedEmail) {
      const existingEmail = await prisma.user.findUnique({
        where: { email: sanitizedEmail }
      });

      if (existingEmail) {
        throw new AppError(
          'Email is already registered',
          409,
          'EMAIL_TAKEN'
        );
      }
    }

    try {
      // Hash password
      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

      // Create user
      const user = await prisma.user.create({
        data: {
          username: sanitizedUsername,
          password: hashedPassword,
          email: sanitizedEmail,
          avatar: avatar || this.getRandomAvatar(),
          isOnline: true,
        }
      });

      // Create session
      const session = await this.createUserSession(user.id);

      logger.info('User registered successfully', {
        userId: user.id,
        username: sanitizedUsername,
        hasEmail: !!email,
      });

      return {
        user: {
          id: user.id,
          username: user.username,
          email: user.email || undefined,
          avatar: user.avatar || undefined,
          isOnline: user.isOnline,
          createdAt: user.createdAt,
        },
        token: session.token,
        expiresAt: session.expiresAt,
      };
    } catch (error) {
      logger.error('Failed to register user', { error, username: sanitizedUsername });
      throw new AppError('Failed to create user account');
    }
  }

  /**
   * Login user with validation
   */
  async loginUser(params: LoginUserParams): Promise<AuthResponse> {
    const { username, password } = params;

    // Basic validation
    if (!username || !password) {
      throw new AppError(
        'Username and password are required',
        400,
        'MISSING_CREDENTIALS'
      );
    }

    if (typeof username !== 'string' || typeof password !== 'string') {
      throw new AppError(
        'Invalid credentials format',
        400,
        'INVALID_CREDENTIALS_FORMAT'
      );
    }

    const sanitizedUsername = this.sanitizeString(username).toLowerCase();

    // Rate limiting check (optional - can be implemented with Redis)
    // await this.checkRateLimit(sanitizedUsername);

    // Find user
    const user = await prisma.user.findUnique({
      where: { username: sanitizedUsername }
    });

    if (!user) {
      // Log failed attempt
      logger.warn('Login attempt with non-existent username', {
        username: sanitizedUsername,
        timestamp: new Date(),
      });

      throw new AppError(
        'Invalid username or password',
        401,
        'INVALID_CREDENTIALS'
      );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      // Log failed attempt
      logger.warn('Login attempt with invalid password', {
        userId: user.id,
        username: user.username,
        timestamp: new Date(),
      });

      throw new AppError(
        'Invalid username or password',
        401,
        'INVALID_CREDENTIALS'
      );
    }

    try {
      // Deactivate old sessions
      await prisma.userSession.updateMany({
        where: {
          userId: user.id,
          isActive: true,
        },
        data: {
          isActive: false,
        }
      });

      // Update user online status
      await prisma.user.update({
        where: { id: user.id },
        data: { 
          isOnline: true,
          lastSeen: new Date(),
        }
      });

      // Create new session
      const session = await this.createUserSession(user.id);

      logger.info('User logged in successfully', {
        userId: user.id,
        username: user.username,
      });

      return {
        user: {
          id: user.id,
          username: user.username,
          email: user.email || undefined,
          avatar: user.avatar || undefined,
          isOnline: true,
          createdAt: user.createdAt,
        },
        token: session.token,
        expiresAt: session.expiresAt,
      };
    } catch (error) {
      logger.error('Failed to login user', { error, userId: user.id });
      throw new AppError('Login failed');
    }
  }

  /**
   * Validate user session/token
   */
  async validateSession(token: string): Promise<UserSession | null> {
    if (!token || typeof token !== 'string') {
      return null;
    }

    try {
      // Verify JWT token
      const decoded = jwt.verify(token, JWT_SECRET) as any;

      // Get session from database
      const session = await prisma.userSession.findUnique({
        where: { token },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              avatar: true,
              isOnline: true,
            }
          }
        }
      });

      if (!session || !session.isActive || session.expiresAt < new Date()) {
        return null;
      }

      // Update last used
      await prisma.userSession.update({
        where: { id: session.id },
        data: { lastUsed: new Date() }
      });

      return session;
    } catch (error) {
      logger.warn('Invalid session token', { error: error.message });
      return null;
    }
  }

  /**
   * Update user's socket connection
   */
  async updateUserSocket(userId: string, socketId: string): Promise<void> {
    try {
      // Update user's active session with socket ID
      const activeSession = await prisma.userSession.findFirst({
        where: {
          userId,
          isActive: true,
          expiresAt: { gt: new Date() }
        }
      });

      if (activeSession) {
        await prisma.userSession.update({
          where: { id: activeSession.id },
          data: { 
            socketId,
            lastUsed: new Date()
          }
        });
      }

      // Update user online status
      await prisma.user.update({
        where: { id: userId },
        data: { 
          isOnline: true,
          lastSeen: new Date()
        }
      });

      logger.debug('Updated user socket connection', { userId, socketId });
    } catch (error) {
      logger.error('Failed to update user socket', { error, userId, socketId });
    }
  }

  /**
   * Logout user with complete cleanup
   */
  async logoutUser(token: string): Promise<void> {
    if (!token || typeof token !== 'string') {
      return;
    }

    try {
      // Deactivate session
      const session = await prisma.userSession.findUnique({
        where: { token },
        include: { user: true }
      });

      if (session) {
        await prisma.userSession.update({
          where: { id: session.id },
          data: { 
            isActive: false,
            socketId: null
          }
        });

        // Update user offline status
        await prisma.user.update({
          where: { id: session.userId },
          data: { 
            isOnline: false,
            lastSeen: new Date()
          }
        });

        logger.info('User logged out successfully', {
          userId: session.userId,
          username: session.user.username,
        });
      }
    } catch (error) {
      logger.error('Failed to logout user', { error, token });
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string) {
    if (!userId || typeof userId !== 'string') {
      return null;
    }

    return await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        avatar: true,
        isOnline: true,
        lastSeen: true,
        createdAt: true,
      }
    });
  }

  /**
   * Check if username is available
   */
  async isUsernameAvailable(username: string): Promise<boolean> {
    if (!username || typeof username !== 'string') {
      return false;
    }

    const usernameValidation = this.validateUsername(username);
    if (!usernameValidation.isValid) {
      return false;
    }

    const sanitizedUsername = this.sanitizeString(username).toLowerCase();
    const existingUser = await prisma.user.findUnique({
      where: { username: sanitizedUsername }
    });
    
    return !existingUser;
  }

  /**
   * Clean up expired sessions (run periodically)
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
      logger.error('Failed to cleanup expired sessions', { error });
    }
  }

  // Private helper methods

  private async createUserSession(userId: string) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    const token = jwt.sign(
      { userId, type: 'session' },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    const session = await prisma.userSession.create({
      data: {
        userId,
        token,
        expiresAt,
      }
    });

    return session;
  }

  private getRandomAvatar(): string {
    const avatars = ['🎮', '🎯', '🎲', '🎪', '🎨', '🎭', '🎸', '🎹', '🎺', '🎷', '🎵', '🎶', '🎤', '🎧', '🎼', '👾', '🕹️', '🎰'];
    return avatars[Math.floor(Math.random() * avatars.length)];
  }
}

export const UserService = new UserServiceClass();