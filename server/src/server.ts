// server/src/server.ts
// Main Express server with professional setup (FIXED VERSION)

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';

// Internal imports
import { env, getAllowedOrigins, getServerConfig, getRateLimitConfig } from './config/environment';
import { connectDatabase } from './config/database';
import { logger, request as logRequest } from './utils/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
// Initialize Socket.io server with full implementation
import { initializeSocketIO } from './sockets';

// Route imports
import healthRoutes from './routes/health';

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

// Create Express application
const app = express();
const server = createServer(app);

const io = initializeSocketIO(server);

// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false, // Required for Socket.io
}));

// CORS configuration
app.use(cors({
  origin: getAllowedOrigins(),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting
const rateLimitConfig = getRateLimitConfig();
const limiter = rateLimit({
  windowMs: rateLimitConfig.windowMs,
  max: rateLimitConfig.max,
  message: {
    success: false,
    error: rateLimitConfig.message,
    code: 'RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    logRequest(req.method, req.originalUrl, res.statusCode, responseTime);
  });
  
  next();
});

// API Routes
app.use('/api/health', healthRoutes);

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Imposter Game API',
    version: '1.0.0',
    documentation: '/api/health',
    socketEndpoint: '/socket.io/',
  });
});

// 404 handler (must be before error handler)
app.use('*', notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

// Socket.io placeholder (we'll implement this in the next phase)
io.on('connection', (socket) => {
  logger.socketEvent('Client connected', socket.id);
  
  socket.on('disconnect', () => {
    logger.socketEvent('Client disconnected', socket.id);
  });
});

// Server startup function
const startServer = async (): Promise<void> => {
  try {
    // Connect to database
    await connectDatabase();
    
    // Get server configuration
    const serverConfig = getServerConfig();
    
    // Start server
    server.listen(serverConfig.port, serverConfig.host, () => {
      logger.info(`🚀 Server started successfully!`, {
        port: serverConfig.port,
        host: serverConfig.host,
        environment: env.NODE_ENV,
        database: 'Connected',
        cors: getAllowedOrigins(),
      });
      
      logger.info(`📡 Socket.io server ready`);
      logger.info(`🏥 Health check: http://${serverConfig.host}:${serverConfig.port}/api/health`);
    });
    
  } catch (error) {
    logger.error('❌ Failed to start server', { error });
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled Rejection', { reason });
  process.exit(1);
});

// Start the server
if (require.main === module) {
  startServer();
}

// Export for testing
export { app, server, io };