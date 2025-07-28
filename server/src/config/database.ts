// server/src/config/database.ts
// Database connection and Prisma client management (FIXED VERSION)

import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { getDatabaseConfig, isDevelopment } from './environment';

// Create Prisma client with appropriate configuration
const createPrismaClient = (): PrismaClient => {
  const config = getDatabaseConfig();
  
  return new PrismaClient({
    datasources: {
      db: {
        url: config.url,
      },
    },
    log: isDevelopment() 
      ? ['query', 'info', 'warn', 'error']
      : ['error'],
  });
};

// Global Prisma client instance
export const prisma = createPrismaClient();

// Database connection helper functions
export const connectDatabase = async (): Promise<void> => {
  try {
    await prisma.$connect();
    logger.info('✅ Database connected successfully');
  } catch (error) {
    logger.error('❌ Failed to connect to database', { error });
    throw error;
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  try {
    await prisma.$disconnect();
    logger.info('📴 Database disconnected');
  } catch (error) {
    logger.error('❌ Error disconnecting from database', { error });
  }
};

// Health check function
export const checkDatabaseHealth = async (): Promise<boolean> => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error('Database health check failed', { error });
    return false;
  }
};

// Graceful shutdown handling
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  await disconnectDatabase();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  await disconnectDatabase();
  process.exit(0);
});