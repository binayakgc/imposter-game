// server/src/utils/logger.ts
// Professional logging utility

import { isDevelopment } from '../config/environment';

// Log levels
export enum LogLevel {
  ERROR = 'ERROR',
  WARN = 'WARN',
  INFO = 'INFO',
  DEBUG = 'DEBUG',
}

// Color codes for console output
const colors = {
  ERROR: '\x1b[31m', // Red
  WARN: '\x1b[33m',  // Yellow
  INFO: '\x1b[36m',  // Cyan
  DEBUG: '\x1b[35m', // Magenta
  RESET: '\x1b[0m',  // Reset
};

class Logger {
  private formatMessage(level: LogLevel, message: string, meta?: any): string {
    const timestamp = new Date().toISOString();
    const color = colors[level];
    const reset = colors.RESET;
    
    let formattedMessage = `${color}[${timestamp}] ${level}:${reset} ${message}`;
    
    if (meta && Object.keys(meta).length > 0) {
      formattedMessage += `\n${JSON.stringify(meta, null, 2)}`;
    }
    
    return formattedMessage;
  }

  error(message: string, meta?: any): void {
    const formatted = this.formatMessage(LogLevel.ERROR, message, meta);
    console.error(formatted);
  }

  warn(message: string, meta?: any): void {
    const formatted = this.formatMessage(LogLevel.WARN, message, meta);
    console.warn(formatted);
  }

  info(message: string, meta?: any): void {
    const formatted = this.formatMessage(LogLevel.INFO, message, meta);
    console.log(formatted);
  }

  debug(message: string, meta?: any): void {
    // Only show debug logs in development
    if (isDevelopment()) {
      const formatted = this.formatMessage(LogLevel.DEBUG, message, meta);
      console.log(formatted);
    }
  }

  // HTTP request logging
  request(method: string, url: string, statusCode: number, responseTime: number): void {
    const color = statusCode >= 400 ? colors.ERROR : statusCode >= 300 ? colors.WARN : colors.INFO;
    const message = `${color}${method} ${url} ${statusCode} - ${responseTime}ms${colors.RESET}`;
    console.log(message);
  }

  // Game event logging
  gameEvent(event: string, roomId?: string, playerId?: string, meta?: any): void {
    const message = `🎮 ${event}`;
    const eventMeta = {
      ...(roomId && { roomId }),
      ...(playerId && { playerId }),
      ...meta,
    };
    
    this.info(message, eventMeta);
  }

  // Socket event logging
  socketEvent(event: string, socketId: string, meta?: any): void {
    const message = `🔌 ${event}`;
    const socketMeta = {
      socketId,
      ...meta,
    };
    
    this.debug(message, socketMeta);
  }
}

// Export singleton instance
export const logger = new Logger();

// Export individual methods for convenience
export const { error, warn, info, debug, request, gameEvent, socketEvent } = logger;