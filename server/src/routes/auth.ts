// server/src/routes/auth.ts
// COMPLETE FIXED VERSION - Resolves all authentication route errors

import { Router, Request, Response } from 'express';
import { UserService } from '../services/UserService';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { authenticate, optionalAuth } from '../middleware/authMiddleware';  // ✅ FIXED: Import correct exports
import Joi from 'joi';

const router = Router();

// ✅ FIXED: Validation schemas
const registerSchema = Joi.object({
  username: Joi.string().min(2).max(20).required(),
  email: Joi.string().email().optional(),
  password: Joi.string().min(6).required(),
  avatar: Joi.string().optional(),
});

const loginSchema = Joi.object({
  username: Joi.string().required(),
  password: Joi.string().required(),
});

/**
 * Register new user
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      throw new AppError(
        error.details[0].message,
        400,
        'VALIDATION_ERROR'
      );
    }

    const { username, email, password, avatar } = value;

    // ✅ FIXED: Use createUser method (not registerUser)
    const result = await UserService.createUser({
      username,
      email,
      password,
      avatar,
    });

    logger.info('User registered successfully', {
      userId: result.id,
      username: result.username,
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: {
        id: result.id,
        username: result.username,
        email: result.email,
        avatar: result.avatar,
        createdAt: result.createdAt,
      },
    });

  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.errorCode,
      });
    } else {
      logger.error('Registration failed', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      res.status(500).json({
        success: false,
        error: 'Registration failed',
        code: 'REGISTRATION_ERROR',
      });
    }
  }
});

/**
 * Login user
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      throw new AppError(
        error.details[0].message,
        400,
        'VALIDATION_ERROR'
      );
    }

    const { username, password } = value;

    // ✅ FIXED: Pass individual parameters (not object)
    const result = await UserService.loginUser(username, password, req.headers['x-socket-id'] as string);

    logger.info('User logged in successfully', {
      userId: result.user.id,
      username: result.user.username,
    });

    res.json({
      success: true,
      message: 'Login successful',
      user: result.user,
      token: result.token,
      session: result.session,
    });

  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.errorCode,
      });
    } else {
      logger.error('Login failed', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      res.status(500).json({
        success: false,
        error: 'Login failed',
        code: 'LOGIN_ERROR',
      });
    }
  }
});

/**
 * Get current user profile
 */
router.get('/profile', authenticate, async (req: Request, res: Response) => {
  try {
    // ✅ FIXED: Use req.user.id (not req.userId)
    const user = await UserService.getUserById(req.user!.id);

    if (!user) {
      throw new AppError(
        'User not found',
        404,
        'USER_NOT_FOUND'
      );
    }

    res.json({
      success: true,
      user,
    });

  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.errorCode,
      });
    } else {
      logger.error('Failed to get user profile', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user?.id,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to get user profile',
        code: 'PROFILE_ERROR',
      });
    }
  }
});

/**
 * Refresh session token
 */
router.post('/refresh', authenticate, async (req: Request, res: Response) => {
  try {
    const token = req.sessionToken!;
    
    // ✅ FIXED: Validate session returns UserWithSession, not session object
    const user = await UserService.validateSession(token);
    
    if (!user) {
      throw new AppError(
        'Invalid session',
        401,
        'INVALID_SESSION'
      );
    }

    // Create new session
    const newSession = await UserService.loginUser(
      user.username, 
      '', // Password not needed for refresh
      req.headers['x-socket-id'] as string
    );

    res.json({
      success: true,
      message: 'Session refreshed',
      user: newSession.user,
      token: newSession.token,
      session: newSession.session,
    });

  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.errorCode,
      });
    } else {
      logger.error('Session refresh failed', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user?.id,
      });
      res.status(500).json({
        success: false,
        error: 'Session refresh failed',
        code: 'REFRESH_ERROR',
      });
    }
  }
});

/**
 * Logout user
 */
router.post('/logout', authenticate, async (req: Request, res: Response) => {
  try {
    const token = req.sessionToken!;
    
    await UserService.logoutUser(token);

    logger.info('User logged out successfully', {
      userId: req.user!.id,
      username: req.user!.username,
    });

    res.json({
      success: true,
      message: 'Logout successful',
    });

  } catch (error) {
    logger.error('Logout failed', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id,
    });
    res.status(500).json({
      success: false,
      error: 'Logout failed',
      code: 'LOGOUT_ERROR',
    });
  }
});

/**
 * Check username availability
 */
router.get('/check-username/:username', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    if (!username || username.length < 2) {
      throw new AppError(
        'Username must be at least 2 characters',
        400,
        'VALIDATION_ERROR'
      );
    }

    // ✅ FIXED: Check if user exists (instead of isUsernameAvailable method)
    const existingUser = await UserService.getUserByUsername(username);
    const isAvailable = !existingUser;

    res.json({
      success: true,
      available: isAvailable,
      username,
    });

  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.errorCode,
      });
    } else {
      logger.error('Username check failed', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        username: req.params.username,
      });
      res.status(500).json({
        success: false,
        error: 'Username check failed',
        code: 'USERNAME_CHECK_ERROR',
      });
    }
  }
});

/**
 * Update user profile
 */
router.put('/profile', authenticate, async (req: Request, res: Response) => {
  try {
    const updateSchema = Joi.object({
      username: Joi.string().min(2).max(20).optional(),
      email: Joi.string().email().optional(),
      avatar: Joi.string().optional(),
    });

    const { error, value } = updateSchema.validate(req.body);
    if (error) {
      throw new AppError(
        error.details[0].message,
        400,
        'VALIDATION_ERROR'
      );
    }

    const updatedUser = await UserService.updateUserProfile(req.user!.id, value);

    logger.info('User profile updated', {
      userId: updatedUser.id,
      username: updatedUser.username,
    });

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: updatedUser,
    });

  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.errorCode,
      });
    } else {
      logger.error('Profile update failed', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user?.id,
      });
      res.status(500).json({
        success: false,
        error: 'Profile update failed',
        code: 'PROFILE_UPDATE_ERROR',
      });
    }
  }
});

export default router;