// server/src/sockets/roomEvents.ts
// Enhanced Socket events for room management with proper cleanup

import { Socket } from 'socket.io';
import { logger } from '../utils/logger';
import { RoomService } from '../services/RoomService';
import { PlayerService } from '../services/PlayerService';
import { GameService } from '../services/GameService';
import { ConnectionHandler } from './connectionHandler';
import { isValidPlayerName } from '../utils/helpers';

export class RoomEventHandlers {
  /**
   * Set up room-related socket event handlers
   */
  static setupRoomEvents(socket: Socket): void {
    // Handle room joining
    socket.on('join_room', async (data: { roomCode: string; playerName: string }) => {
      await this.handleJoinRoom(socket, data);
    });

    // Handle leaving room
    socket.on('leave_room', async (data: { roomId: string }) => {
      await this.handleLeaveRoom(socket, data);
    });

    // Handle room updates (host only)
    socket.on('update_room', async (data: { 
      roomId: string; 
      name?: string; 
      maxPlayers?: number; 
      themeMode?: boolean 
    }) => {
      await this.handleUpdateRoom(socket, data);
    });

    // Handle getting public rooms
    socket.on('get_public_rooms', async () => {
      await this.handleGetPublicRooms(socket);
    });

    // Handle getting room details
    socket.on('get_room_details', async (data: { roomId: string }) => {
      await this.handleGetRoomDetails(socket, data);
    });

    // 🔧 CRITICAL FIX: Handle socket disconnection with proper cleanup
    socket.on('disconnect', async (reason) => {
      await this.handlePlayerDisconnect(socket, reason);
    });
  }

  /**
   * Handle player joining a room
   */
  private static async handleJoinRoom(
    socket: Socket, 
    data: { roomCode: string; playerName: string }
  ): Promise<void> {
    try {
      const { roomCode, playerName } = data;

      // Validate input
      if (!roomCode || !playerName) {
        socket.emit('error', {
          message: 'Room code and player name are required',
          code: 'VALIDATION_ERROR'
        });
        return;
      }

      if (!isValidPlayerName(playerName)) {
        socket.emit('error', {
          message: 'Player name must be between 2 and 20 characters',
          code: 'INVALID_PLAYER_NAME'
        });
        return;
      }

      // Check if room can accept new players
      const roomCheck = await RoomService.canJoinRoom(roomCode.toUpperCase());
      if (!roomCheck.canJoin) {
        socket.emit('error', {
          message: roomCheck.reason,
          code: 'CANNOT_JOIN_ROOM'
        });
        return;
      }

      const room = roomCheck.room!;

      // Add player to the room
      const player = await PlayerService.addPlayer({
        name: playerName,
        roomId: room.id,
        socketId: socket.id,
        isHost: false, // Host is assigned when creating room
      });

      // Associate socket with player
      ConnectionHandler.associateSocketWithPlayer(
        socket, 
        player.id, 
        room.id, 
        player.name
      );

      // Join the socket room for real-time updates
      socket.join(room.id);

      // Get updated room with all players
      const updatedRoom = await RoomService.getRoomById(room.id);
      const allPlayers = await PlayerService.getPlayersInRoom(room.id);

      // Notify the joining player
      socket.emit('room_joined', {
        success: true,
        room: updatedRoom,
        player: {
          id: player.id,
          name: player.name,
          isHost: player.isHost,
        },
        players: allPlayers.map(p => ({
          id: p.id,
          name: p.name,
          isHost: p.isHost,
          isOnline: p.isOnline,
          joinedAt: p.joinedAt,
        })),
      });

      // Notify other players in the room
      socket.to(room.id).emit('player_joined', {
        player: {
          id: player.id,
          name: player.name,
          isHost: player.isHost,
          isOnline: player.isOnline,
          joinedAt: player.joinedAt,
        },
        room: updatedRoom,
      });

      // Send updated room info to all players
      const roomUpdateData = {
        room: updatedRoom,
        players: allPlayers.map(p => ({
          id: p.id,
          name: p.name,
          isHost: p.isHost,
          isOnline: p.isOnline,
          joinedAt: p.joinedAt,
        })),
      };

      socket.to(room.id).emit('room_updated', roomUpdateData);
      socket.emit('room_updated', roomUpdateData);

      // 🔧 ENHANCEMENT: Broadcast public room updates if this is a public room
      if (room.isPublic) {
        socket.broadcast.emit('public_rooms_updated');
      }

      logger.gameEvent('Player joined room', room.id, player.id, {
        playerName: player.name,
        roomCode: room.code,
        playerCount: updatedRoom?.playerCount,
      });

    } catch (error) {
      logger.error('Failed to join room', { error, data, socketId: socket.id });
      socket.emit('error', {
        message: 'Failed to join room',
        code: 'JOIN_ROOM_FAILED'
      });
    }
  }

  /**
   * Handle player leaving a room
   */
  private static async handleLeaveRoom(
    socket: Socket, 
    data: { roomId: string }
  ): Promise<void> {
    try {
      const validation = ConnectionHandler.validateSocketPlayer(socket);
      if (!validation.isValid) {
        socket.emit('error', {
          message: validation.error,
          code: 'VALIDATION_ERROR'
        });
        return;
      }

      const { playerId, roomId } = validation;

      // Verify the room ID matches
      if (roomId !== data.roomId) {
        socket.emit('error', {
          message: 'Player not in specified room',
          code: 'PLAYER_NOT_IN_ROOM'
        });
        return;
      }

      // 🔧 CRITICAL: Use the complete cleanup logic
      await this.performPlayerLeaveCleanup(socket, playerId!, roomId!);

    } catch (error) {
      logger.error('Failed to leave room', { error, data, socketId: socket.id });
      socket.emit('error', {
        message: 'Failed to leave room',
        code: 'LEAVE_ROOM_FAILED'
      });
    }
  }

  /**
   * 🔧 CRITICAL FIX: Handle player disconnect with complete cleanup
   */
  private static async handlePlayerDisconnect(socket: Socket, reason: string): Promise<void> {
    try {
      const validation = ConnectionHandler.validateSocketPlayer(socket);
      if (!validation.isValid) {
        // Socket was never properly associated, nothing to clean up
        return;
      }

      const { playerId, roomId } = validation;
      
      logger.info(`Player disconnecting`, { 
        socketId: socket.id, 
        playerId, 
        roomId, 
        reason 
      });

      // 🔧 CRITICAL: Perform complete cleanup on disconnect
      await this.performPlayerLeaveCleanup(socket, playerId!, roomId!, reason);

    } catch (error) {
      logger.error('Failed to handle player disconnect', { 
        error, 
        socketId: socket.id, 
        reason 
      });
    }
  }

  /**
   * 🔧 CRITICAL: Complete player leave cleanup logic
   */
  private static async performPlayerLeaveCleanup(
    socket: Socket, 
    playerId: string, 
    roomId: string,
    reason: string = 'left'
  ): Promise<void> {
    try {
      // Get room info before player removal
      const room = await RoomService.getRoomById(roomId);
      if (!room) {
        return; // Room doesn't exist, nothing to clean up
      }

      // Leave the socket room
      socket.leave(roomId);
      
      // 🔧 CRITICAL: Remove player from database (this handles host transfer automatically)
      const result = await PlayerService.removePlayer(playerId);

      // Dissociate socket
      ConnectionHandler.dissociateSocket(socket);

      // Notify the leaving player
      socket.emit('room_left', {
        success: true,
        message: 'Left room successfully'
      });

      // Get remaining players after removal
      const remainingPlayers = await PlayerService.getPlayersInRoom(roomId);

      // 🔧 CRITICAL: Check if room is now empty and should be deleted
      if (remainingPlayers.length === 0) {
        logger.info(`Room is empty, deleting room: ${room.code}`, { roomId });
        
        // Delete the empty room
        await RoomService.deleteRoom(roomId);
        
        // 🔧 CRITICAL: Broadcast public room update if it was public
        if (room.isPublic) {
          socket.broadcast.emit('public_rooms_updated');
        }

        logger.gameEvent('Room deleted (empty)', roomId, playerId, {
          reason: 'no_players_remaining',
          roomCode: room.code,
          wasPublic: room.isPublic
        });

        return; // Room deleted, no need for further updates
      }

      // Notify other players about the departure
      socket.to(roomId).emit('player_left', {
        playerId: playerId,
        playerName: result.removedPlayer.name,
        reason: reason,
      });

      // 🔧 CRITICAL: If there was a host transfer, notify everyone
      if (result.newHost) {
        socket.to(roomId).emit('host_changed', {
          newHost: {
            id: result.newHost.id,
            name: result.newHost.name,
          },
          message: `${result.newHost.name} is now the host`
        });

        logger.gameEvent('Host transferred', roomId, result.newHost.id, {
          previousHostId: playerId,
          newHostName: result.newHost.name,
        });
      }

      // Send updated room info to remaining players
      const updatedRoom = await RoomService.getRoomById(roomId);
      if (updatedRoom && remainingPlayers.length > 0) {
        const roomUpdateData = {
          room: updatedRoom,
          players: remainingPlayers.map(p => ({
            id: p.id,
            name: p.name,
            isHost: p.isHost,
            isOnline: p.isOnline,
            joinedAt: p.joinedAt,
          })),
        };

        socket.to(roomId).emit('room_updated', roomUpdateData);
      }

      // 🔧 CRITICAL: Update public rooms if this was a public room
      if (room.isPublic) {
        socket.broadcast.emit('public_rooms_updated');
      }

      logger.gameEvent('Player left room', roomId, playerId, {
        playerName: result.removedPlayer.name,
        wasHost: result.removedPlayer.isHost,
        newHostId: result.newHost?.id,
        remainingPlayers: remainingPlayers.length,
        reason
      });

    } catch (error) {
      logger.error('Failed to perform player leave cleanup', { 
        error, 
        playerId, 
        roomId, 
        reason 
      });
    }
  }

  /**
   * Handle room updates (host only)
   */
  private static async handleUpdateRoom(
    socket: Socket,
    data: { 
      roomId: string; 
      name?: string; 
      maxPlayers?: number; 
      themeMode?: boolean 
    }
  ): Promise<void> {
    try {
      const validation = ConnectionHandler.validateSocketPlayer(socket);
      if (!validation.isValid) {
        socket.emit('error', {
          message: validation.error,
          code: 'VALIDATION_ERROR'
        });
        return;
      }

      const { playerId, roomId } = validation;

      // Verify the room ID matches
      if (roomId !== data.roomId) {
        socket.emit('error', {
          message: 'Player not in specified room',
          code: 'PLAYER_NOT_IN_ROOM'
        });
        return;
      }

      // Verify player is host
      const player = await PlayerService.getPlayerById(playerId!);
      if (!player || !player.isHost) {
        socket.emit('error', {
          message: 'Only the host can update room settings',
          code: 'HOST_REQUIRED'
        });
        return;
      }

      // Update room
      const updatedRoom = await RoomService.updateRoom(roomId!, {
        name: data.name,
        maxPlayers: data.maxPlayers,
        themeMode: data.themeMode,
      });

      // Get all players
      const allPlayers = await PlayerService.getPlayersInRoom(roomId!);

      // Broadcast update to all players in room
      const roomUpdateData = {
        room: updatedRoom,
        players: allPlayers.map(p => ({
          id: p.id,
          name: p.name,
          isHost: p.isHost,
          isOnline: p.isOnline,
          joinedAt: p.joinedAt,
        })),
      };

      socket.emit('room_updated', roomUpdateData);
      socket.to(roomId!).emit('room_updated', roomUpdateData);

      // 🔧 ENHANCEMENT: Update public rooms if this is a public room
      if (updatedRoom.isPublic) {
        socket.broadcast.emit('public_rooms_updated');
      }

      logger.gameEvent('Room updated', roomId!, playerId!, data);

    } catch (error) {
      logger.error('Failed to update room', { error, data, socketId: socket.id });
      socket.emit('error', {
        message: 'Failed to update room',
        code: 'UPDATE_ROOM_FAILED'
      });
    }
  }

  /**
   * Handle getting public rooms
   */
  private static async handleGetPublicRooms(socket: Socket): Promise<void> {
    try {
      const publicRooms = await RoomService.getPublicRooms();

      socket.emit('public_rooms', {
        success: true,
        rooms: publicRooms,
      });

    } catch (error) {
      logger.error('Failed to get public rooms', { error, socketId: socket.id });
      socket.emit('error', {
        message: 'Failed to get public rooms',
        code: 'GET_PUBLIC_ROOMS_FAILED'
      });
    }
  }

  /**
   * Handle getting room details
   */
  private static async handleGetRoomDetails(
    socket: Socket,
    data: { roomId: string }
  ): Promise<void> {
    try {
      const room = await RoomService.getRoomById(data.roomId);
      if (!room) {
        socket.emit('error', {
          message: 'Room not found',
          code: 'ROOM_NOT_FOUND'
        });
        return;
      }

      const players = await PlayerService.getPlayersInRoom(data.roomId);
      const currentGame = await GameService.getCurrentGame(data.roomId);

      socket.emit('room_details', {
        success: true,
        room,
        players: players.map(p => ({
          id: p.id,
          name: p.name,
          isHost: p.isHost,
          isOnline: p.isOnline,
          joinedAt: p.joinedAt,
        })),
        currentGame: currentGame ? {
          id: currentGame.id,
          state: currentGame.state,
          roundNumber: currentGame.roundNumber,
        } : null,
      });

    } catch (error) {
      logger.error('Failed to get room details', { error, data, socketId: socket.id });
      socket.emit('error', {
        message: 'Failed to get room details',
        code: 'GET_ROOM_DETAILS_FAILED'
      });
    }
  }
}