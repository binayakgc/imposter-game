// server/src/config/environment.ts
// Environment configuration management (FIXED VERSION)

import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables from .env file
dotenv.config();

// Define environment schema for validation
const envSchema = z.object({
  // Server configuration
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default(3001),
  
  // Database configuration
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  
  // CORS configuration
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  
  // JWT configuration (for future use)
  JWT_SECRET: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
  
  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default(100),
});

// Validate environment variables
const parseResult = envSchema.safeParse(process.env);

if (!parseResult.success) {
  console.error('❌ Invalid environment configuration:');
  console.error(parseResult.error.flatten().fieldErrors);
  process.exit(1);
}

// Export validated environment variables
export const env = parseResult.data;

// Helper functions
export const isDevelopment = () => env.NODE_ENV === 'development';
export const isProduction = () => env.NODE_ENV === 'production';
export const isTest = () => env.NODE_ENV === 'test';

// CORS origins as array
export const getAllowedOrigins = (): string[] => {
  return env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim());
};

// Database configuration
export const getDatabaseConfig = () => ({
  url: env.DATABASE_URL,
  ssl: isProduction(),
});

// Server configuration
export const getServerConfig = () => ({
  port: env.PORT,
  host: isDevelopment() ? 'localhost' : '0.0.0.0',
});

// Rate limiting configuration
export const getRateLimitConfig = () => ({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  message: 'Too many requests from this IP, please try again later.',
});