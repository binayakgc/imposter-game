// server/src/routes/health.ts
// Health check endpoints (FIXED VERSION)

import { Router, Request, Response } from 'express';
import { checkDatabaseHealth } from '../config/database';
import { asyncHandler } from '../middleware/errorHandler';
import { env } from '../config/environment';

// Use local constants instead of importing from shared
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

const router = Router();

// Basic health check
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Imposter Game API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: env.NODE_ENV,
  });
}));

// Detailed health check
router.get('/detailed', asyncHandler(async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  // Check database health
  const isDatabaseHealthy = await checkDatabaseHealth();
  
  const healthCheck = {
    success: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    responseTime: Date.now() - startTime,
    environment: env.NODE_ENV,
    version: '1.0.0',
    services: {
      database: {
        status: isDatabaseHealthy ? 'healthy' : 'unhealthy',
        responseTime: Date.now() - startTime,
      },
      server: {
        status: 'healthy',
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          unit: 'MB',
        },
        cpu: process.cpuUsage(),
      },
    },
  };

  // Set status code based on overall health
  const statusCode = isDatabaseHealthy ? HTTP_STATUS.OK : 503;
  
  res.status(statusCode).json(healthCheck);
}));

// Readiness probe (for Kubernetes/Docker)
router.get('/ready', asyncHandler(async (req: Request, res: Response) => {
  const isDatabaseHealthy = await checkDatabaseHealth();
  
  if (isDatabaseHealthy) {
    res.status(HTTP_STATUS.OK).json({
      success: true,
      status: 'ready',
      timestamp: new Date().toISOString(),
    });
  } else {
    res.status(503).json({
      success: false,
      status: 'not ready',
      reason: 'Database connection failed',
      timestamp: new Date().toISOString(),
    });
  }
}));

// Liveness probe (for Kubernetes/Docker)
router.get('/live', (req: Request, res: Response) => {
  res.status(HTTP_STATUS.OK).json({
    success: true,
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

export default router;