// server/src/routes/auth.ts
// COMPLETE FIXED VERSION - Resolves all authentication route errors

import { Router, Request, Response } from 'express';
import { UserService } from '../services/UserService';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { authenticate, optionalAuth } from '../middleware/authMiddleware';
import Joi from 'joi';

const router = Router();

// Validation schemas
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

    // ✅ FIXED: Use correct parameter order for createUser (username, password, email)
    const result = await UserService.createUser(username, password, email);

    logger.info('User registered successfully', {
      userId: result.user.id,
      username: result.user.username,
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: result.user,
        token: result.token,
        session: result.session,
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

    // ✅ FIXED: Use correct parameter order for loginUser
    const result = await UserService.loginUser(username, password, req.headers['x-socket-id'] as string);

    logger.info('User logged in successfully', {
      userId: result.user.id,
      username: result.user.username,
    });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: result.user,
        token: result.token,
        session: result.session,
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
      data: {
        user,
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
 * Validate session token
 */
router.get('/validate', authenticate, async (req: Request, res: Response) => {
  try {
    // If we reach here, authentication middleware has validated the token
    res.json({
      success: true,
      message: 'Session is valid',
      data: {
        user: req.user,
      },
    });

  } catch (error) {
    logger.error('Session validation failed', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id,
    });
    res.status(500).json({
      success: false,
      error: 'Session validation failed',
      code: 'VALIDATION_ERROR',
    });
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
router.get('/username-available/:username', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    if (!username || username.length < 2) {
      throw new AppError(
        'Username must be at least 2 characters',
        400,
        'VALIDATION_ERROR'
      );
    }

    // ✅ FIXED: Use isUsernameAvailable method from UserService
    const isAvailable = await UserService.isUsernameAvailable(username);

    res.json({
      success: true,
      data: {
        available: isAvailable,
        username,
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

    // ✅ FIXED: Handle null case for updatedUser
    if (!updatedUser) {
      throw new AppError(
        'Failed to update user profile',
        500,
        'UPDATE_ERROR'
      );
    }

    logger.info('User profile updated', {
      userId: updatedUser.id,
      username: updatedUser.username,
    });

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: updatedUser,
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
      logger.error('Profile update failed', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user?.id,
      });
      res.status(500).json({
        success: false,
        error: 'Profile update failed',
        code: 'UPDATE_ERROR',
      });
    }
  }
});

/**
 * Change password
 */
router.put('/change-password', authenticate, async (req: Request, res: Response) => {
  try {
    const changePasswordSchema = Joi.object({
      currentPassword: Joi.string().required(),
      newPassword: Joi.string().min(6).required(),
    });

    const { error, value } = changePasswordSchema.validate(req.body);
    if (error) {
      throw new AppError(
        error.details[0].message,
        400,
        'VALIDATION_ERROR'
      );
    }

    const { currentPassword, newPassword } = value;

    // This would require implementing a changePassword method in UserService
    // For now, return not implemented
    res.status(501).json({
      success: false,
      error: 'Password change not implemented yet',
      code: 'NOT_IMPLEMENTED',
    });

  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.errorCode,
      });
    } else {
      logger.error('Password change failed', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user?.id,
      });
      res.status(500).json({
        success: false,
        error: 'Password change failed',
        code: 'PASSWORD_CHANGE_ERROR',
      });
    }
  }
});

export default router;