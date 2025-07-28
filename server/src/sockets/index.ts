// server/src/sockets/index.ts
// Main Socket.io setup and configuration

import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { logger } from '../utils/logger';
import { getAllowedOrigins } from '../config/environment';
import { ConnectionHandler } from './connectionHandler';
import { RoomEventHandlers } from './roomEvents';
import { GameEventHandlers } from './gameEvents';

// Socket.io server instance
let io: SocketIOServer;

/**
 * Initialize Socket.IO server
 */
export const initializeSocketIO = (server: HTTPServer): SocketIOServer => {
  io = new SocketIOServer(server, {
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
  });

  // Set up connection handling
  io.on('connection', async (socket: Socket) => {
    logger.socketEvent('New connection established', socket.id, {
      transport: socket.conn.transport.name,
      remoteAddress: socket.conn.remoteAddress,
    });

    try {
      // Handle initial connection
      await ConnectionHandler.handleConnection(socket);

      // Set up room event handlers
      RoomEventHandlers.setupRoomEvents(socket);

      // Set up game event handlers
      GameEventHandlers.setupGameEvents(socket);

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

    } catch (error) {
      logger.error('Failed to set up socket connection', {
        error,
        socketId: socket.id,
      });
      
      socket.emit('error', {
        message: 'Failed to establish connection',
        code: 'CONNECTION_SETUP_FAILED'
      });
    }
  });

  // Server-level event handlers
  io.engine.on('connection_error', (err) => {
    logger.error('Socket.IO connection error', {
      error: err.message,
      code: err.code,
      context: err.context,
    });
  });

  logger.info('Socket.IO server initialized', {
    cors: getAllowedOrigins(),
    transports: ['websocket', 'polling'],
  });

  return io;
};

/**
 * Get the Socket.IO server instance
 */
export const getSocketIOServer = (): SocketIOServer => {
  if (!io) {
    throw new Error('Socket.IO server not initialized');
  }
  return io;
};

/**
 * Broadcast message to all connected clients
 */
export const broadcastToAll = (event: string, data: any): void => {
  if (io) {
    io.emit(event, data);
    logger.socketEvent('Broadcast to all clients', 'server', { event, data });
  }
};

/**
 * Broadcast message to all clients in a room
 */
export const broadcastToRoom = (roomId: string, event: string, data: any): void => {
  if (io) {
    io.to(roomId).emit(event, data);
    logger.socketEvent('Broadcast to room', 'server', { roomId, event, data });
  }
};

/**
 * Get all sockets in a room
 */
export const getSocketsInRoom = async (roomId: string): Promise<any[]> => {
  if (!io) return [];
  
  try {
    const sockets = await io.in(roomId).fetchSockets();
    return sockets;
  } catch (error) {
    logger.error('Failed to get sockets in room', { error, roomId });
    return [];
  }
};

/**
 * Get total number of connected clients
 */
export const getConnectedClientsCount = (): number => {
  if (!io) return 0;
  return io.engine.clientsCount;
};

/**
 * Get server statistics
 */
export const getServerStats = async () => {
  if (!io) {
    return {
      connectedClients: 0,
      rooms: 0,
      transport: {
        websocket: 0,
        polling: 0,
      }
    };
  }

  const sockets = await io.fetchSockets();
  const transportStats = {
    websocket: 0,
    polling: 0,
  };

  sockets.forEach(socket => {
    // Use socket.data instead of socket.conn for remote sockets
    transportStats.websocket++; // Simplified for now
  });

  return {
    connectedClients: sockets.length,
    rooms: io.sockets.adapter.rooms.size,
    transport: transportStats,
  };
};

/**
 * Disconnect all clients (for graceful shutdown)
 */
export const disconnectAllClients = async (): Promise<void> => {
  if (!io) return;

  logger.info('Disconnecting all Socket.IO clients...');
  
  const sockets = await io.fetchSockets();
  
  // Notify clients of server shutdown
  io.emit('server_shutdown', {
    message: 'Server is shutting down',
    timestamp: new Date().toISOString(),
  });

  // Wait a moment for the message to be sent
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Disconnect all clients
  sockets.forEach(socket => {
    socket.disconnect(true);
  });

  logger.info(`Disconnected ${sockets.length} Socket.IO clients`);
};

/**
 * Close Socket.IO server
 */
export const closeSocketIOServer = async (): Promise<void> => {
  if (!io) return;

  logger.info('Closing Socket.IO server...');
  
  await disconnectAllClients();
  
  return new Promise((resolve) => {
    io.close(() => {
      logger.info('Socket.IO server closed');
      resolve();
    });
  });
};

// Cleanup handlers for graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing Socket.IO server...');
  await closeSocketIOServer();
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing Socket.IO server...');
  await closeSocketIOServer();
});

// Export types for TypeScript
export type { Socket } from 'socket.io';