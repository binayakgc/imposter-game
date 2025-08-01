// server/src/sockets/connectionHandler.ts
// COMPLETE FIXED VERSION - Resolves SocketData interface conflicts

import { Socket } from 'socket.io';
import { logger } from '../utils/logger';
import { PlayerService } from '../services/PlayerService';
import { authenticateSocket } from '../middleware/authMiddleware';

// ✅ FIXED: Extend the existing SocketData interface instead of overriding
declare module 'socket.io' {
  interface SocketData {
    playerId?: string;
    roomId?: string;
    playerName?: string;
    userId?: string;
    lastActivity?: Date;
  }
}

class ConnectionHandlerClass {
  private connectedSockets = new Map<string, Socket>();

  /**
   * Handle new socket connection
   */
  async handleConnection(socket: Socket): Promise<void> {
    console.log(`🔌 New socket connection: ${socket.id}`);
    
    // ✅ FIXED: Initialize socket data properly
    socket.data = {
      lastActivity: new Date()
    };
    
    // Store socket reference
    this.connectedSockets.set(socket.id, socket);

    // Handle authentication if token provided
    await this.handleAuthentication(socket);

    // Set up disconnect handler
    socket.on('disconnect', (reason) => {
      this.handleDisconnection(socket, reason);
    });

    logger.debug('Socket connection established', {
      socketId: socket.id,
      totalConnections: this.connectedSockets.size,
    });
  }

  /**
   * ✅ FIXED: Add validateSocketPlayer method that was missing
   */
  validateSocketPlayer(socket: Socket): {
    success: boolean;
    message?: string;
    playerId?: string;
    playerName?: string;
  } {
    if (!socket.data.playerId) {
      return {
        success: false,
        message: 'Player not associated with socket'
      };
    }

    if (!socket.data.roomId) {
      return {
        success: false,
        message: 'Player not in a room'
      };
    }

    return {
      success: true,
      playerId: socket.data.playerId,
      playerName: socket.data.playerName
    };
  }

  /**
   * Handle socket authentication
   */
  private async handleAuthentication(socket: Socket): Promise<void> {
    try {
      const token = socket.handshake.query.token as string;
      
      if (token) {
        const user = await authenticateSocket(socket.id, token);
        
        if (user) {
          socket.data.userId = user.id;
          socket.data.playerName = user.username;
          
          console.log(`🔐 Socket authenticated: ${socket.id} -> User: ${user.username}`);
          
          // Try to reconnect to existing player session
          await this.attemptPlayerReconnection(socket, user.id);
        }
      }
    } catch (error) {
      console.error('Socket authentication failed:', error);
      logger.warn('Socket authentication failed', {
        socketId: socket.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Handle socket disconnection
   */
  private async handleDisconnection(socket: Socket, reason: string): Promise<void> {
    console.log(`🔌 Socket disconnected: ${socket.id}, reason: ${reason}`);
    
    try {
      // Update player offline status if they were in a room
      if (socket.data.playerId) {
        // ✅ FIXED: Use disconnectPlayer method instead of setPlayerOffline
        await PlayerService.disconnectPlayer(socket.data.playerId);
        
        // Notify room about player going offline
        if (socket.data.roomId) {
          this.broadcastToRoom(socket.data.roomId, 'player_left', {
            playerId: socket.data.playerId,
            playerName: socket.data.playerName || 'Unknown Player',
            reason: 'disconnected'
          });
        }
      }

      // Remove socket from our tracking
      this.connectedSockets.delete(socket.id);

      logger.debug('Socket disconnection handled', {
        socketId: socket.id,
        reason,
        playerId: socket.data.playerId,
        roomId: socket.data.roomId,
        remainingConnections: this.connectedSockets.size,
      });

    } catch (error) {
      console.error('Error handling socket disconnection:', error);
      logger.error('Failed to handle socket disconnection', {
        error: error instanceof Error ? error.message : 'Unknown error',
        socketId: socket.id,
        reason,
      });
    }
  }

  /**
   * Try to reconnect player to existing session
   */
  private async attemptPlayerReconnection(socket: Socket, userId: string): Promise<void> {
    try {
      // ✅ FIXED: Simplified approach - look for existing player by user ID
      // We'll implement this when the client explicitly joins a room
      console.log(`🔄 User ${userId} ready for reconnection`);
      
      // For now, just log that the user is available for reconnection
      // The actual reconnection will happen when they try to join a room
      
    } catch (error) {
      console.error('Player reconnection attempt failed:', error);
      logger.warn('Player reconnection failed', {
        socketId: socket.id,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Associate socket with player and room
   */
  associateSocketWithPlayer(socket: Socket, playerId: string, roomId: string): void {
    socket.data.playerId = playerId;
    socket.data.roomId = roomId;
    socket.data.lastActivity = new Date();
    
    // Join socket to room for broadcasting
    socket.join(roomId);
    
    console.log(`🔗 Socket ${socket.id} associated with player ${playerId} in room ${roomId}`);
    
    logger.debug('Socket associated with player', {
      socketId: socket.id,
      playerId,
      roomId,
    });
  }

  /**
   * Get socket by player ID
   */
  getSocketByPlayerId(playerId: string): Socket | null {
    for (const socket of this.connectedSockets.values()) {
      if (socket.data.playerId === playerId) {
        return socket;
      }
    }
    return null;
  }

  /**
   * Get socket by user ID
   */
  getSocketByUserId(userId: string): Socket | null {
    for (const socket of this.connectedSockets.values()) {
      if (socket.data.userId === userId) {
        return socket;
      }
    }
    return null;
  }

  /**
   * Get all sockets in a room
   */
  getSocketsInRoom(roomId: string): Socket[] {
    const sockets: Socket[] = [];
    for (const socket of this.connectedSockets.values()) {
      if (socket.data.roomId === roomId) {
        sockets.push(socket);
      }
    }
    return sockets;
  }

  /**
   * ✅ FIXED: Broadcast to room with proper parameter types
   */
  broadcastToRoom(roomId: string, event: string, data: any): void {
    const sockets = this.getSocketsInRoom(roomId);
    
    sockets.forEach(socket => {
      socket.emit(event, data);
    });

    console.log(`📡 Broadcasted event '${event}' to ${sockets.length} sockets in room ${roomId}`);
  }

  /**
   * Broadcast to all connected sockets
   */
  broadcastToAll(event: string, data: any): void {
    for (const socket of this.connectedSockets.values()) {
      socket.emit(event, data);
    }

    console.log(`📡 Broadcasted event '${event}' to ${this.connectedSockets.size} connected sockets`);
  }

  /**
   * Remove socket from room
   */
  removeSocketFromRoom(socket: Socket): void {
    if (socket.data.roomId) {
      socket.leave(socket.data.roomId);
      
      const oldRoomId = socket.data.roomId;
      socket.data.roomId = undefined;
      socket.data.playerId = undefined;
      
      console.log(`🚪 Socket ${socket.id} removed from room ${oldRoomId}`);
      
      logger.debug('Socket removed from room', {
        socketId: socket.id,
        roomId: oldRoomId,
      });
    }
  }

  /**
   * Update socket activity timestamp
   */
  updateSocketActivity(socket: Socket): void {
    socket.data.lastActivity = new Date();
  }

  /**
   * Get connection statistics
   */
  getConnectionStats(): {
    totalConnections: number;
    authenticatedConnections: number;
    playersInRooms: number;
  } {
    let authenticatedConnections = 0;
    let playersInRooms = 0;

    for (const socket of this.connectedSockets.values()) {
      if (socket.data.userId) {
        authenticatedConnections++;
      }
      if (socket.data.playerId && socket.data.roomId) {
        playersInRooms++;
      }
    }

    return {
      totalConnections: this.connectedSockets.size,
      authenticatedConnections,
      playersInRooms,
    };
  }

  /**
   * Clean up inactive connections
   */
  cleanupInactiveConnections(): void {
    const inactiveSockets: string[] = [];
    
    for (const [socketId, socket] of this.connectedSockets.entries()) {
      if (!socket.connected) {
        inactiveSockets.push(socketId);
      }
    }

    inactiveSockets.forEach(socketId => {
      this.connectedSockets.delete(socketId);
    });

    if (inactiveSockets.length > 0) {
      console.log(`🧹 Cleaned up ${inactiveSockets.length} inactive socket connections`);
      logger.info('Cleaned up inactive socket connections', {
        cleanedUp: inactiveSockets.length,
        remaining: this.connectedSockets.size,
      });
    }
  }

  /**
   * Handle player reconnection to existing session
   */
  async handlePlayerReconnection(socket: Socket, playerId: string): Promise<void> {
    try {
      const player = await PlayerService.reconnectPlayer(playerId, socket.id);
      
      if (player) {
        // Update socket data
        socket.data.playerId = player.id;
        socket.data.roomId = player.roomId;
        socket.data.playerName = player.user.username;
        
        // Join room
        socket.join(player.roomId);
        
        console.log(`🔄 Player reconnected: ${player.user.username} -> Room: ${player.room.code}`);
        
        // Notify room
        this.broadcastToRoom(player.roomId, 'player_joined', {
          player: {
            id: player.id,
            userId: player.userId,
            username: player.user.username,
            avatar: player.user.avatar,
            isHost: player.isHost,
            isOnline: true,
          },
          room: player.room,
        });
      }
    } catch (error) {
      console.error('Player reconnection failed:', error);
      logger.error('Player reconnection failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        playerId,
        socketId: socket.id,
      });
    }
  }
}

export const ConnectionHandler = new ConnectionHandlerClass();