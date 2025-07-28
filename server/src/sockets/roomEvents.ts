// server/src/sockets/roomEvents.ts
// Socket events for room management

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

      // Remove player from room
      const result = await PlayerService.removePlayer(playerId!);
      
      // Dissociate socket
      ConnectionHandler.dissociateSocket(socket);

      // Notify the leaving player
      socket.emit('room_left', {
        success: true,
        message: 'Left room successfully'
      });

      // Notify other players
      socket.to(roomId!).emit('player_left', {
        playerId: playerId,
        playerName: result.removedPlayer.name,
        reason: 'left',
      });

      // If there was a new host assigned, notify everyone
      if (result.newHost) {
        socket.to(roomId!).emit('host_changed', {
          newHost: {
            id: result.newHost.id,
            name: result.newHost.name,
          }
        });
      }

      // Send updated room info to remaining players
      const remainingPlayers = await PlayerService.getPlayersInRoom(roomId!);
      const updatedRoom = await RoomService.getRoomById(roomId!);

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

        socket.to(roomId!).emit('room_updated', roomUpdateData);
      }

      logger.gameEvent('Player left room', roomId!, playerId!, {
        playerName: result.removedPlayer.name,
        wasHost: result.removedPlayer.isHost,
        newHostId: result.newHost?.id,
      });

    } catch (error) {
      logger.error('Failed to leave room', { error, data, socketId: socket.id });
      socket.emit('error', {
        message: 'Failed to leave room',
        code: 'LEAVE_ROOM_FAILED'
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
          code: 'NOT_HOST'
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

      // Notify all players in the room
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

      ConnectionHandler.broadcastToRoom(socket, roomId!, 'room_updated', roomUpdateData, true);

      logger.gameEvent('Room updated', roomId!, playerId!, {
        updates: data,
      });

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
          wordGiverId: currentGame.wordGiverId,
          // Don't send sensitive info like imposterId or currentWord
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