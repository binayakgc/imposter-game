// server/src/routes/auth.ts
// Authentication API routes

import express from 'express';
import { UserService } from '../services/UserService';
import { logger } from '../utils/logger';
import { validateAuthMiddleware } from '../middleware/authMiddleware';

const router = express.Router();

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', async (req, res, next) => {
  try {
    const { username, password, email, avatar } = req.body;

    // Validate required fields
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required',
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }

    const result = await UserService.registerUser({
      username,
      password,
      email,
      avatar,
    });

    logger.info('User registration successful', {
      userId: result.user.id,
      username: result.user.username,
      ip: req.ip,
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: result,
    });

  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/login
 * Login user
 */
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;

    // Validate required fields
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required',
        code: 'MISSING_CREDENTIALS'
      });
    }

    const result = await UserService.loginUser({
      username,
      password,
    });

    logger.info('User login successful', {
      userId: result.user.id,
      username: result.user.username,
      ip: req.ip,
    });

    res.json({
      success: true,
      message: 'Login successful',
      data: result,
    });

  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/logout
 * Logout user
 */
router.post('/logout', validateAuthMiddleware, async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (token) {
      await UserService.logoutUser(token);
    }

    res.json({
      success: true,
      message: 'Logout successful',
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/me
 * Get current user information
 */
router.get('/me', validateAuthMiddleware, async (req, res, next) => {
  try {
    const user = await UserService.getUserById(req.userId!);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      data: { user },
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/validate
 * Validate current session
 */
router.get('/validate', async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No token provided',
        code: 'NO_TOKEN'
      });
    }

    const session = await UserService.validateSession(token);

    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired session',
        code: 'INVALID_SESSION'
      });
    }

    res.json({
      success: true,
      data: {
        user: session.user,
        expiresAt: session.expiresAt,
      },
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/username-available/:username
 * Check if username is available
 */
router.get('/username-available/:username', async (req, res, next) => {
  try {
    const { username } = req.params;

    if (!username || username.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Username must be at least 2 characters',
        code: 'INVALID_USERNAME'
      });
    }

    const isAvailable = await UserService.isUsernameAvailable(username);

    res.json({
      success: true,
      data: {
        username,
        available: isAvailable,
      },
    });

  } catch (error) {
    next(error);
  }
});

export default router;