// server/src/server.ts
// COMPLETE ENHANCED VERSION - All fixes integrated

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';

// Internal imports
import { env, getAllowedOrigins, getServerConfig, getRateLimitConfig } from './config/environment';
import { connectDatabase } from './config/database';
import { logger, request as logRequest } from './utils/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

// Socket.io imports
import { ConnectionHandler } from './sockets/connectionHandler';
import { RoomEvents } from './sockets/roomEvents';
import { GameEvents } from './sockets/gameEvents';

// Service imports
import { RoomService } from './services/RoomService';

// Route imports
import healthRoutes from './routes/health';
import roomRoutes from './routes/rooms';
import gameRoutes from './routes/games';
import authRoutes from './routes/auth';

// Local constants
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

// Create Express application and HTTP server
const app = express();
const server = createServer(app);

// ✅ ENHANCED: Initialize Socket.IO with comprehensive configuration
const io = new SocketIOServer(server, {
  cors: {
    origin: getAllowedOrigins(),
    methods: ['GET', 'POST'],
    credentials: true,
  },
  // Connection settings
  pingTimeout: 60000, // 60 seconds
  pingInterval: 25000, // 25 seconds
  upgradeTimeout: 10000, // 10 seconds
  allowUpgrades: true,
  transports: ['websocket', 'polling'],
  // Connection state recovery
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
    skipMiddlewares: true,
  },
});

// ✅ CRITICAL: Set the Socket.IO server instance for broadcasting
ConnectionHandler.setSocketServer(io);

// ✅ ENHANCED: Set up Socket.IO connection handling with all fixes
io.on('connection', async (socket: Socket) => {
  logger.socketEvent('New connection established', socket.id, {
    transport: socket.conn.transport.name,
    remoteAddress: socket.conn.remoteAddress,
  });

  try {
    // Handle initial connection with authentication
    await ConnectionHandler.handleConnection(socket);

    // Set up room event handlers
    RoomEvents.setupRoomEvents(socket);

    // Set up game event handlers (if available)
    if (GameEvents && typeof GameEvents.setupGameEvents === 'function') {
      GameEvents.setupGameEvents(socket);
    }

    // Set up error handling
    socket.on('error', (error: Error) => {
      logger.error('Socket error', {
        error: error.message,
        stack: error.stack,
        socketId: socket.id,
      });
    });

    // Log transport upgrades
    socket.conn.on('upgrade', () => {
      logger.socketEvent('Transport upgraded', socket.id, {
        transport: socket.conn.transport.name,
      });
    });

    // Handle heartbeat/ping for connection monitoring
    socket.on('heartbeat', () => {
      ConnectionHandler.updateSocketActivity(socket);
      socket.emit('heartbeat_response', { timestamp: Date.now() });
    });

  } catch (error) {
    console.error('❌ Failed to set up socket connection:', error);
    logger.error('Failed to set up socket connection', {
      error: error instanceof Error ? error.message : 'Unknown error',
      socketId: socket.id,
    });
    
    // Disconnect problematic socket
    socket.disconnect(true);
  }
});

// ✅ ENHANCED: Security middleware with Socket.io compatibility
app.use(helmet({
  crossOriginEmbedderPolicy: false, // Required for Socket.io
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", "ws:", "wss:"], // Allow WebSocket connections
    },
  },
}));

// ✅ ENHANCED: CORS configuration with comprehensive options
app.use(cors({
  origin: getAllowedOrigins(),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-Total-Count', 'X-Rate-Limit-Remaining'],
  maxAge: 86400, // 24 hours
}));

// ✅ ENHANCED: Rate limiting with different limits for different endpoints
const rateLimitConfig = getRateLimitConfig();

// General rate limit
const generalLimiter = rateLimit({
  windowMs: rateLimitConfig.windowMs,
  max: rateLimitConfig.max,
  message: {
    success: false,
    error: rateLimitConfig.message,
    code: 'RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/api/health' || req.path === '/';
  },
});

// Stricter rate limit for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later',
    code: 'AUTH_RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting
app.use('/api/auth', authLimiter);
app.use(generalLimiter);

// ✅ ENHANCED: Body parsing middleware with larger limits for file uploads
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    // Store raw body for webhook verification if needed
    (req as any).rawBody = buf;
  }
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb',
  parameterLimit: 50000,
}));

// ✅ ENHANCED: Request logging middleware with more details
app.use((req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(2, 15);
  
  // Add request ID to response headers
  res.setHeader('X-Request-ID', requestId);
  
  // Store request details
  (req as any).requestId = requestId;
  (req as any).startTime = startTime;
  
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    const logData = {
      requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      responseTime,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      contentLength: res.get('Content-Length'),
    };
    
    if (responseTime > 1000) {
      logger.warn('Slow request detected', logData);
    } else {
      logRequest(req.method, req.originalUrl, res.statusCode, responseTime);
    }
  });
  
  next();
});

// ✅ ENHANCED: Health check middleware for load balancers
app.use('/health', (req: Request, res: Response, next: NextFunction) => {
  // Quick health check without authentication
  if (req.method === 'GET' && req.path === '/') {
    return res.status(HTTP_STATUS.OK).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      connections: ConnectionHandler.getConnectionStats(),
    });
  }
  next();
});

// ✅ API Routes with proper mounting
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/games', gameRoutes);

// ✅ ENHANCED: Root endpoint with comprehensive API information
app.get('/', (req: Request, res: Response) => {
  const stats = ConnectionHandler.getConnectionStats();
  
  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Imposter Game API',
    version: '1.0.0',
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    connections: stats,
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      rooms: '/api/rooms',
      games: '/api/games',
      socket: '/socket.io/',
    },
    documentation: {
      health: '/api/health',
      swagger: '/api/docs', // For future API documentation
    },
  });
});

// ✅ Socket.io endpoint info
app.get('/socket.io/info', (req: Request, res: Response) => {
  const stats = ConnectionHandler.getConnectionStats();
  
  res.status(HTTP_STATUS.OK).json({
    success: true,
    socketIO: {
      version: '4.7.0',
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
    },
    connections: stats,
    timestamp: new Date().toISOString(),
  });
});

// ✅ 404 handler (must be before error handler)
app.use('*', notFoundHandler);

// ✅ Global error handler (must be last)
app.use(errorHandler);

// ✅ ENHANCED: Periodic cleanup tasks for production readiness

// Cleanup inactive rooms every hour
const roomCleanupInterval = setInterval(async () => {
  try {
    console.log('🧹 Running periodic room cleanup...');
    const cleanedRooms = await RoomService.cleanupInactiveRooms(60); // 60 minutes
    
    if (cleanedRooms > 0) {
      console.log(`✅ Cleaned up ${cleanedRooms} inactive rooms`);
      
      // Broadcast updated public rooms list to all connected clients
      try {
        const rooms = await RoomService.getPublicRooms();
        ConnectionHandler.broadcastToAll('public_rooms_updated', {
          success: true,
          rooms,
          timestamp: new Date().toISOString(),
        });
      } catch (broadcastError) {
        console.error('❌ Failed to broadcast room updates:', broadcastError);
      }
    }
    
    logger.info('Room cleanup completed', {
      cleanedRooms,
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('❌ Room cleanup error:', error);
    logger.error('Room cleanup failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}, 60 * 60 * 1000); // Every hour

// Cleanup inactive connections every 5 minutes
const connectionCleanupInterval = setInterval(() => {
  try {
    ConnectionHandler.cleanupInactiveConnections();
  } catch (error) {
    console.error('❌ Connection cleanup error:', error);
    logger.error('Connection cleanup failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}, 5 * 60 * 1000); // Every 5 minutes

// ✅ Log periodic cleanup task status
console.log('🔧 Periodic cleanup tasks initialized:');
console.log('   📅 Room cleanup: Every 60 minutes');
console.log('   🔌 Connection cleanup: Every 5 minutes');

// ✅ ENHANCED: Server startup function with comprehensive error handling
const startServer = async (): Promise<void> => {
  try {
    logger.info('🚀 Starting Imposter Game Server...');
    
    // Connect to database with retry logic
    let dbConnected = false;
    let dbRetries = 0;
    const maxDbRetries = 5;
    
    while (!dbConnected && dbRetries < maxDbRetries) {
      try {
        await connectDatabase();
        dbConnected = true;
        logger.info('✅ Database connected successfully');
      } catch (dbError) {
        dbRetries++;
        logger.warn(`Database connection attempt ${dbRetries}/${maxDbRetries} failed`, {
          error: dbError instanceof Error ? dbError.message : 'Unknown error',
        });
        
        if (dbRetries < maxDbRetries) {
          await new Promise(resolve => setTimeout(resolve, 2000 * dbRetries)); // Exponential backoff
        } else {
          throw dbError;
        }
      }
    }
    
    // Get server configuration
    const serverConfig = getServerConfig();
    
    // Start server
    server.listen(serverConfig.port, serverConfig.host, () => {
      const stats = ConnectionHandler.getConnectionStats();
      
      logger.info(`🚀 Server started successfully!`, {
        port: serverConfig.port,
        host: serverConfig.host,
        environment: env.NODE_ENV,
        database: 'Connected',
        cors: getAllowedOrigins(),
        connections: stats,
        pid: process.pid,
        nodeVersion: process.version,
        platform: process.platform,
      });
      
      console.log(`\n🎮 Imposter Game Server Running!`);
      console.log(`📡 Server: http://${serverConfig.host}:${serverConfig.port}`);
      console.log(`🏥 Health: http://${serverConfig.host}:${serverConfig.port}/api/health`);
      console.log(`🔌 Socket: ws://${serverConfig.host}:${serverConfig.port}/socket.io/`);
      console.log(`📊 Connections: ${stats.totalConnections} total, ${stats.authenticatedConnections} authenticated`);
      console.log(`🌍 Environment: ${env.NODE_ENV}`);
      console.log(`🎯 Ready for connections!\n`);
    });
    
  } catch (error) {
    logger.error('❌ Failed to start server', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    console.error('❌ Server startup failed:', error);
    process.exit(1);
  }
};

// ✅ ENHANCED: Graceful shutdown handling
const gracefulShutdown = async (signal: string) => {
  console.log(`\n🛑 Received ${signal}, starting graceful shutdown...`);
  logger.info('Graceful shutdown initiated', { signal });
  
  // Clear cleanup intervals
  clearInterval(roomCleanupInterval);
  clearInterval(connectionCleanupInterval);
  
  // Close Socket.io connections
  io.close((err) => {
    if (err) {
      console.error('❌ Error closing Socket.io:', err);
    } else {
      console.log('✅ Socket.io connections closed');
    }
  });
  
  // Close HTTP server
  server.close((err) => {
    if (err) {
      console.error('❌ Error closing HTTP server:', err);
      process.exit(1);
    } else {
      console.log('✅ HTTP server closed');
      logger.info('Server shutdown completed');
      process.exit(0);
    }
  });
  
  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('❌ Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

// ✅ ENHANCED: Process event handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception', { 
    error: error.message, 
    stack: error.stack,
    pid: process.pid,
  });
  console.error('❌ Uncaught Exception:', error);
  
  // Attempt graceful shutdown
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason: unknown, promise: Promise<any>) => {
  const errorMessage = reason instanceof Error ? reason.message : String(reason);
  const errorStack = reason instanceof Error ? reason.stack : undefined;
  
  logger.error('Unhandled Rejection', { 
    reason: errorMessage,
    stack: errorStack,
    promise: promise.toString(),
    pid: process.pid,
  });
  console.error('❌ Unhandled Rejection:', reason);
  
  // Attempt graceful shutdown
  gracefulShutdown('UNHANDLED_REJECTION');
});

// ✅ Memory usage monitoring (optional - for production monitoring)
if (env.NODE_ENV === 'production') {
  setInterval(() => {
    const memUsage = process.memoryUsage();
    const memUsageMB = {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024),
    };
    
    // Log memory usage if it's getting high
    if (memUsageMB.heapUsed > 500) { // 500MB threshold
      logger.warn('High memory usage detected', {
        memory: memUsageMB,
        connections: ConnectionHandler.getConnectionStats(),
      });
    }
    
  }, 5 * 60 * 1000); // Every 5 minutes
}

// ✅ Start the server if this file is run directly
if (require.main === module) {
  startServer();
}

// ✅ Export for testing and external use
export { app, server, io };
export default app;