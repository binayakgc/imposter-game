// server/src/sockets/connectionHandler.ts
// ENHANCED VERSION - Better broadcasting and socket management

import { Socket } from 'socket.io';
import { logger } from '../utils/logger';
import { PlayerService } from '../services/PlayerService';
import { authenticateSocket } from '../middleware/authMiddleware';

// ✅ Extend the existing SocketData interface
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
  private io: any = null; // Will be set by the main server

  /**
   * ✅ NEW: Set the Socket.IO server instance for broadcasting
   */
  setSocketServer(io: any): void {
    this.io = io;
    console.log('📡 Socket.IO server instance set for broadcasting');
  }

  /**
   * Handle new socket connection
   */
  async handleConnection(socket: Socket): Promise<void> {
    console.log(`🔌 New socket connection: ${socket.id}`);
    
    // Initialize socket data
    socket.data = {
      lastActivity: new Date()
    };
    
    // Store socket reference
    this.connectedSockets.set(socket.id, socket);

    // ✅ ENHANCED: Handle authentication from connection handshake
    await this.handleInitialAuthentication(socket);

    // Set up disconnect handler
    socket.on('disconnect', (reason) => {
      this.handleDisconnection(socket, reason);
    });

    // ✅ NEW: Set up authentication event
    socket.on('authenticate', (data) => {
      this.handleAuthentication(socket, data);
    });

    logger.debug('Socket connection established', {
      socketId: socket.id,
      totalConnections: this.connectedSockets.size,
    });
  }

  /**
   * ✅ ENHANCED: Handle initial authentication from connection handshake
   */
  private async handleInitialAuthentication(socket: Socket): Promise<void> {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      
      if (token) {
        console.log(`🔐 Authenticating socket ${socket.id} with token...`);
        const user = await authenticateSocket(socket.id, token);
        
        if (user) {
          socket.data.userId = user.id;
          socket.data.playerName = user.username;
          
          console.log(`✅ Socket ${socket.id} authenticated as: ${user.username}`);
          
          // Try to reconnect to existing player session
          await this.attemptPlayerReconnection(socket, user.id);
          
          // Notify client of successful authentication
          socket.emit('authenticated', {
            userId: user.id,
            username: user.username,
          });
        } else {
          console.log(`❌ Socket ${socket.id} authentication failed`);
          socket.emit('authentication_error', {
            message: 'Invalid token'
          });
        }
      } else {
        console.log(`⚠️ Socket ${socket.id} connected without token`);
      }
    } catch (error) {
      console.error('Socket authentication failed:', error);
      socket.emit('authentication_error', {
        message: 'Authentication failed'
      });
    }
  }

  /**
   * ✅ NEW: Handle manual authentication requests
   */
  private async handleAuthentication(socket: Socket, data: any): Promise<void> {
    try {
      const { token, userId, username } = data;
      
      if (token) {
        const user = await authenticateSocket(socket.id, token);
        
        if (user) {
          socket.data.userId = user.id;
          socket.data.playerName = user.username;
          
          console.log(`✅ Socket ${socket.id} re-authenticated as: ${user.username}`);
          
          // Try to reconnect to existing player session
          await this.attemptPlayerReconnection(socket, user.id);
          
          socket.emit('authenticated', {
            userId: user.id,
            username: user.username,
          });
        } else {
          socket.emit('authentication_error', {
            message: 'Invalid token'
          });
        }
      }
    } catch (error) {
      console.error('Manual authentication failed:', error);
      socket.emit('authentication_error', {
        message: 'Authentication failed'
      });
    }
  }

  /**
   * ✅ ENHANCED: Attempt to reconnect player to their previous room
   */
  private async attemptPlayerReconnection(socket: Socket, userId: string): Promise<void> {
    try {
      // Look for existing online player for this user
      const existingPlayer = await PlayerService.getOnlinePlayerByUserId(userId);
      
      if (existingPlayer) {
        console.log(`🔄 Reconnecting user ${userId} to existing player session`);
        
        // Associate socket with existing player
        socket.data.playerId = existingPlayer.id;
        socket.data.roomId = existingPlayer.roomId;
        
        // Join the socket room
        socket.join(existingPlayer.roomId);
        
        // Update player's socket ID
        await PlayerService.updatePlayer(existingPlayer.id, {
          socketId: socket.id,
          isOnline: true,
        });
        
        console.log(`✅ User ${userId} reconnected to room ${existingPlayer.roomId}`);
        
        // Notify client
        socket.emit('reconnected', {
          playerId: existingPlayer.id,
          roomId: existingPlayer.roomId,
          message: 'Reconnected to previous session'
        });
        
      } else {
        console.log(`ℹ️ No existing session found for user ${userId}`);
      }
    } catch (error) {
      console.error('Failed to reconnect player:', error);
    }
  }

  /**
   * ✅ ENHANCED: Handle socket disconnection with proper cleanup
   */
  async handleDisconnection(socket: Socket, reason: string): Promise<void> {
    console.log(`🔌 Socket ${socket.id} disconnected: ${reason}`);
    
    try {
      const playerId = socket.data.playerId;
      const roomId = socket.data.roomId;
      
      if (playerId) {
        // Mark player as offline but don't remove immediately
        // This allows for reconnection
        await PlayerService.updatePlayer(playerId, {
          isOnline: false,
          socketId: null,
        });
        
        // Notify other players in the room
        if (roomId) {
          socket.to(roomId).emit('player_disconnected', {
            playerId,
            playerName: socket.data.playerName,
            reason: 'disconnected',
          });
          
          console.log(`📢 Notified room ${roomId} of player ${playerId} disconnection`);
        }
      }
    } catch (error) {
      console.error('Error handling disconnection cleanup:', error);
    }
    
    // Remove from connected sockets
    this.connectedSockets.delete(socket.id);
    
    logger.debug('Socket disconnected', {
      socketId: socket.id,
      reason,
      playerId: socket.data.playerId,
      roomId: socket.data.roomId,
      totalConnections: this.connectedSockets.size,
    });
  }

  /**
   * Associate socket with player and room
   */
  associateSocketWithPlayer(socket: Socket, playerId: string, roomId: string): void {
    socket.data.playerId = playerId;
    socket.data.roomId = roomId;
    
    console.log(`🔗 Socket ${socket.id} associated with player ${playerId} in room ${roomId}`);
    
    logger.debug('Socket associated with player', {
      socketId: socket.id,
      playerId,
      roomId,
    });
  }

  /**
   * Validate that socket has valid player association
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
   * ✅ ENHANCED: Broadcast to specific room with better error handling
   */
  broadcastToRoom(roomId: string, event: string, data: any): void {
    if (!this.io) {
      console.error('❌ Socket.IO server not set, cannot broadcast to room');
      return;
    }

    try {
      this.io.to(roomId).emit(event, data);
      
      // Count sockets in room for logging
      const socketsInRoom = Array.from(this.connectedSockets.values())
        .filter(socket => socket.rooms.has(roomId));
      
      console.log(`📡 Broadcasted '${event}' to room ${roomId} (${socketsInRoom.length} sockets)`);
      
    } catch (error) {
      console.error(`❌ Failed to broadcast to room ${roomId}:`, error);
    }
  }

  /**
   * ✅ ENHANCED: Broadcast to all connected sockets
   */
  broadcastToAll(event: string, data: any): void {
    if (!this.io) {
      console.error('❌ Socket.IO server not set, cannot broadcast to all');
      return;
    }

    try {
      this.io.emit(event, data);
      console.log(`📡 Broadcasted '${event}' to all ${this.connectedSockets.size} connected sockets`);
      
    } catch (error) {
      console.error('❌ Failed to broadcast to all sockets:', error);
    }
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
   * ✅ NEW: Get socket by player ID
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
   * ✅ NEW: Get sockets in room
   */
  getSocketsInRoom(roomId: string): Socket[] {
    return Array.from(this.connectedSockets.values())
      .filter(socket => socket.data.roomId === roomId);
  }

  /**
   * Clean up inactive connections
   */
  cleanupInactiveConnections(): void {
    const inactiveSockets: string[] = [];
    const cutoffTime = new Date(Date.now() - 300000); // 5 minutes

    for (const [socketId, socket] of this.connectedSockets.entries()) {
      const lastActivity = socket.data.lastActivity;
      if (lastActivity && lastActivity < cutoffTime) {
        inactiveSockets.push(socketId);
        socket.disconnect(true);
      }
    }

    // Remove from tracking
    inactiveSockets.forEach(socketId => {
      this.connectedSockets.delete(socketId);
    });

    if (inactiveSockets.length > 0) {
      console.log(`🧹 Cleaned up ${inactiveSockets.length} inactive socket connections`);
      
      logger.info('Inactive connections cleaned up', {
        cleanedUp: inactiveSockets.length,
        remaining: this.connectedSockets.size,
      });
    }
  }
}

// Export singleton instance
export const ConnectionHandler = new ConnectionHandlerClass();