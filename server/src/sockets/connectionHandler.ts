// server/src/sockets/connectionHandler.ts
// Socket connection and disconnection handling

import { Socket } from 'socket.io';
import { logger } from '../utils/logger';
import { PlayerService } from '../services/PlayerService';
import { RoomService } from '../services/RoomService';

// Connection data interface
interface SocketData {
  playerId?: string;
  roomId?: string;
  playerName?: string;
}

export class ConnectionHandler {
  /**
   * Handle new socket connection
   */
  static async handleConnection(socket: Socket): Promise<void> {
    logger.socketEvent('Client connected', socket.id);

    // Initialize socket data
    socket.data = {} as SocketData;

    // Set up heartbeat
    this.setupHeartbeat(socket);

    // Handle authentication if player reconnects
    socket.on('authenticate', async (data: { playerId?: string }) => {
      if (data.playerId) {
        await this.handleReconnection(socket, data.playerId);
      }
    });

    // Handle graceful disconnect
    socket.on('disconnect', async (reason: string) => {
      await this.handleDisconnection(socket, reason);
    });

    // Handle heartbeat
    socket.on('heartbeat', () => {
      socket.emit('heartbeat_ack');
    });
  }

  /**
   * Handle player reconnection
   */
  static async handleReconnection(socket: Socket, playerId: string): Promise<void> {
    try {
      // Get player information
      const player = await PlayerService.getPlayerById(playerId);
      if (!player) {
        socket.emit('error', {
          message: 'Player not found',
          code: 'PLAYER_NOT_FOUND'
        });
        return;
      }

      // Update player's socket connection
      await PlayerService.reconnectPlayer(playerId, socket.id);

      // Update socket data
      socket.data.playerId = playerId;
      socket.data.roomId = player.roomId;
      socket.data.playerName = player.name;

      // Join the room channel
      await socket.join(player.roomId);

      // Notify player of successful reconnection
      socket.emit('connected', {
        playerId: player.id,
        room: {
          id: player.room.id,
          code: player.room.code,
          name: player.room.name,
          isPublic: player.room.isPublic,
          maxPlayers: player.room.maxPlayers,
          themeMode: player.room.themeMode,
        }
      });

      // Notify other players in the room
      socket.to(player.roomId).emit('player_reconnected', {
        playerId: player.id,
        playerName: player.name,
      });

      logger.socketEvent('Player reconnected', socket.id, {
        playerId,
        roomId: player.roomId,
        playerName: player.name,
      });

    } catch (error) {
      logger.error('Failed to handle reconnection', { error, playerId, socketId: socket.id });
      socket.emit('error', {
        message: 'Failed to reconnect',
        code: 'RECONNECTION_FAILED'
      });
    }
  }

  /**
   * Handle socket disconnection
   */
  static async handleDisconnection(socket: Socket, reason: string): Promise<void> {
    const { playerId, roomId, playerName } = socket.data as SocketData;

    logger.socketEvent('Client disconnected', socket.id, {
      reason,
      playerId,
      roomId,
      playerName,
    });

    if (playerId && roomId) {
      try {
        // Mark player as offline
        const disconnectedPlayer = await PlayerService.disconnectPlayer(playerId);
        
        if (disconnectedPlayer) {
          // Notify other players in the room
          socket.to(roomId).emit('player_left', {
            playerId,
            playerName: playerName || 'Unknown Player',
            reason: 'disconnected',
          });

          // Check if room is now empty and should be cleaned up
          const remainingPlayers = await PlayerService.getOnlinePlayersInRoom(roomId);
          if (remainingPlayers.length === 0) {
            // Room is empty, could schedule cleanup
            logger.gameEvent('Room now empty', roomId, undefined, {
              lastPlayerId: playerId,
            });
          }
        }
      } catch (error) {
        logger.error('Failed to handle disconnection', {
          error,
          socketId: socket.id,
          playerId,
          roomId,
        });
      }
    }
  }

  /**
   * Set up heartbeat mechanism for connection health
   */
  private static setupHeartbeat(socket: Socket): void {
    const heartbeatInterval = 30000; // 30 seconds
    
    const interval = setInterval(() => {
      if (socket.connected) {
        socket.emit('heartbeat');
      } else {
        clearInterval(interval);
      }
    }, heartbeatInterval);

    // Clean up interval on disconnect
    socket.on('disconnect', () => {
      clearInterval(interval);
    });
  }

  /**
   * Associate socket with player and room
   */
  static associateSocketWithPlayer(
    socket: Socket, 
    playerId: string, 
    roomId: string, 
    playerName: string
  ): void {
    socket.data = {
      playerId,
      roomId,
      playerName,
    } as SocketData;

    // Join the room channel
    socket.join(roomId);

    logger.socketEvent('Socket associated with player', socket.id, {
      playerId,
      roomId,
      playerName,
    });
  }

  /**
   * Remove socket association
   */
  static dissociateSocket(socket: Socket): void {
    const { roomId } = socket.data as SocketData;
    
    if (roomId) {
      socket.leave(roomId);
    }

    socket.data = {} as SocketData;
  }

  /**
   * Get all sockets in a room
   */
  static async getSocketsInRoom(io: any, roomId: string): Promise<Socket[]> {
    const sockets = await io.in(roomId).fetchSockets();
    return sockets;
  }

  /**
   * Get socket by player ID
   */
  static async getSocketByPlayerId(io: any, playerId: string): Promise<Socket | null> {
    const sockets = await io.fetchSockets();
    
    for (const socket of sockets) {
      const socketData = socket.data as SocketData;
      if (socketData.playerId === playerId) {
        return socket;
      }
    }
    
    return null;
  }

  /**
   * Broadcast to all players in a room except sender
   */
  static broadcastToRoom(
    socket: Socket, 
    roomId: string, 
    event: string, 
    data: any, 
    includeSender: boolean = false
  ): void {
    if (includeSender) {
      socket.to(roomId).emit(event, data);
      socket.emit(event, data);
    } else {
      socket.to(roomId).emit(event, data);
    }
  }

  /**
   * Broadcast to all players in a room
   */
  static broadcastToRoomFromServer(
    io: any, 
    roomId: string, 
    event: string, 
    data: any
  ): void {
    io.to(roomId).emit(event, data);
  }

  /**
   * Validate socket has required player data
   */
  static validateSocketPlayer(socket: Socket): { 
    isValid: boolean; 
    playerId?: string; 
    roomId?: string; 
    error?: string 
  } {
    const { playerId, roomId } = socket.data as SocketData;

    if (!playerId || !roomId) {
      return {
        isValid: false,
        error: 'Socket not associated with player',
      };
    }

    return {
      isValid: true,
      playerId,
      roomId,
    };
  }
}