// server/src/sockets/roomEvents.ts
// COMPLETE FIXED VERSION - Resolves associateSocketWithPlayer parameter errors

import { Socket } from 'socket.io';
import { RoomService } from '../services/RoomService';
import { PlayerService } from '../services/PlayerService';
import { logger } from '../utils/logger';
import { ConnectionHandler } from './connectionHandler';

export class RoomEventsClass {
  /**
   * Set up all room-related socket event handlers
   */
  setupRoomEvents(socket: Socket): void {
    // Room management events
    socket.on('create_room', (data) => this.handleCreateRoom(socket, data));
    socket.on('join_room', (data) => this.handleJoinRoom(socket, data));
    socket.on('leave_room', (data) => this.handleLeaveRoom(socket, data));
    socket.on('update_room', (data) => this.handleUpdateRoom(socket, data));
    socket.on('get_public_rooms', () => this.handleGetPublicRooms(socket));
    socket.on('get_room_details', (data) => this.handleGetRoomDetails(socket, data));

    console.log(`📋 Room event handlers set up for socket ${socket.id}`);
  }

  /**
   * Handle room creation
   */
  private async handleCreateRoom(socket: Socket, data: {
    name?: string;
    isPublic?: boolean;
    maxPlayers?: number;
    themeMode?: boolean;
  }): Promise<void> {
    try {
      console.log(`🏠 Creating room for socket ${socket.id}:`, data);

      const { name, isPublic = false, maxPlayers = 10, themeMode = false } = data;

      // Check if socket has authenticated user
      if (!socket.data.userId) {
        socket.emit('error', {
          message: 'Authentication required to create room',
          code: 'AUTH_REQUIRED'
        });
        return;
      }

      // Create room with host
      const room = await RoomService.createRoom({
        hostUserId: socket.data.userId,
        name,
        isPublic,
        maxPlayers,
        themeMode,
      });

      // Get the host player
      const hostPlayer = await PlayerService.getPlayerByUserAndRoom(socket.data.userId, room.id);
      
      if (!hostPlayer) {
        throw new Error('Host player not found after room creation');
      }

      // ✅ FIXED: Pass only 3 required parameters to associateSocketWithPlayer
      ConnectionHandler.associateSocketWithPlayer(
        socket, 
        hostPlayer.id, 
        room.id
      );

      console.log(`✅ Room created successfully: ${room.code}`);
      console.log(`🎯 Host: ${hostPlayer.user.username} (${hostPlayer.id})`);

      // Emit success response to the host
      socket.emit('room_created', {
        success: true,
        room: {
          id: room.id,
          code: room.code,
          name: room.name,
          isPublic: room.isPublic,
          maxPlayers: room.maxPlayers,
          themeMode: room.themeMode,
          playerCount: 1,
          isActive: room.isActive,
          createdAt: room.createdAt,
        },
        player: {
          id: hostPlayer.id,
          userId: hostPlayer.userId,
          username: hostPlayer.user.username,
          avatar: hostPlayer.user.avatar,
          isHost: hostPlayer.isHost,
          isOnline: hostPlayer.isOnline,
          joinedAt: hostPlayer.joinedAt,
        },
      });

      logger.info('Room created successfully', {
        roomId: room.id,
        roomCode: room.code,
        hostId: hostPlayer.id,
        hostName: hostPlayer.user.username,
        socketId: socket.id,
      });

    } catch (error) {
      console.error('❌ Failed to create room:', error);
      logger.error('Failed to create room', { error, socketId: socket.id });
      socket.emit('error', {
        message: 'Failed to create room',
        code: 'CREATE_ROOM_FAILED'
      });
    }
  }

  /**
   * Handle room joining
   */
  private async handleJoinRoom(socket: Socket, data: {
    roomCode: string;
    userId?: string;
  }): Promise<void> {
    try {
      const { roomCode } = data;
      const userId = data.userId || socket.data.userId;

      console.log(`🚪 Player attempting to join room: ${roomCode}`);

      if (!userId) {
        socket.emit('error', {
          message: 'Authentication required to join room',
          code: 'AUTH_REQUIRED'
        });
        return;
      }

      // Find room by code
      const room = await RoomService.getRoomByCode(roomCode);
      if (!room) {
        socket.emit('error', {
          message: 'Room not found',
          code: 'ROOM_NOT_FOUND'
        });
        return;
      }

      console.log(`✅ Room ${roomCode} found, adding player...`);

      // Add player to room
      const player = await PlayerService.addPlayer({
        userId: userId,
        roomId: room.id,
        socketId: socket.id,
        isHost: false,
      });

      console.log(`✅ Player ${player.user.username} added with ID: ${player.id}`);

      // ✅ FIXED: Pass only 3 required parameters to associateSocketWithPlayer
      ConnectionHandler.associateSocketWithPlayer(
        socket, 
        player.id, 
        room.id
      );

      // Join the socket room for real-time updates
      socket.join(room.id);
      console.log(`📡 Socket ${socket.id} joined room ${room.id}`);

      // Get updated room with all players
      const updatedRoom = await RoomService.getRoomById(room.id);
      const allPlayers = await PlayerService.getPlayersInRoom(room.id);

      console.log(`📊 Room now has ${allPlayers.length} players`);

      // Notify the joining player
      socket.emit('room_joined', {
        success: true,
        room: updatedRoom,
        player: {
          id: player.id,
          userId: player.userId,
          username: player.user.username,
          avatar: player.user.avatar,
          isHost: player.isHost,
          isOnline: player.isOnline,
        },
        players: allPlayers.map(p => ({
          id: p.id,
          userId: p.userId,
          username: p.user.username,
          avatar: p.user.avatar,
          isHost: p.isHost,
          isOnline: p.isOnline,
          joinedAt: p.joinedAt,
        })),
      });

      // Notify other players in the room
      socket.to(room.id).emit('player_joined', {
        player: {
          id: player.id,
          userId: player.userId,
          username: player.user.username,
          avatar: player.user.avatar,
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
          userId: p.userId,
          username: p.user.username,
          avatar: p.user.avatar,
          isHost: p.isHost,
          isOnline: p.isOnline,
          joinedAt: p.joinedAt,
        })),
      };

      socket.to(room.id).emit('room_updated', roomUpdateData);

      logger.info('Player joined room successfully', {
        roomId: room.id,
        roomCode: room.code,
        playerId: player.id,
        playerName: player.user.username,
        totalPlayers: allPlayers.length,
        socketId: socket.id,
      });

    } catch (error) {
      console.error('❌ Failed to join room:', error);
      logger.error('Failed to join room', { error, data, socketId: socket.id });
      socket.emit('error', {
        message: 'Failed to join room',
        code: 'JOIN_ROOM_FAILED'
      });
    }
  }

  /**
   * Handle leaving room
   */
  private async handleLeaveRoom(socket: Socket, data: { roomId?: string }): Promise<void> {
    try {
      const roomId = data?.roomId || socket.data.roomId;
      const playerId = socket.data.playerId;

      if (!roomId || !playerId) {
        socket.emit('error', {
          message: 'Not in a room',
          code: 'NOT_IN_ROOM'
        });
        return;
      }

      console.log(`🚪 Player ${playerId} leaving room ${roomId}`);

      // Remove player from room
      const removedPlayer = await PlayerService.removePlayer(playerId);

      if (removedPlayer) {
        // Leave socket room
        socket.leave(roomId);
        ConnectionHandler.removeSocketFromRoom(socket);

        // Notify other players
        socket.to(roomId).emit('player_left', {
          playerId: removedPlayer.id,
          playerName: removedPlayer.user.username,
          reason: 'left_room',
        });

        // Check if room is empty or needs new host
        const remainingPlayers = await PlayerService.getPlayersInRoom(roomId);

        if (remainingPlayers.length === 0) {
          // Room is empty, could be cleaned up
          console.log(`🏠 Room ${roomId} is now empty`);
        } else if (removedPlayer.isHost) {
          // Transfer host to another player
          const newHost = remainingPlayers[0];
          await PlayerService.transferHost(roomId, removedPlayer.id, newHost.id);

          // Notify all players about host change
          socket.to(roomId).emit('host_changed', {
            newHost: {
              id: newHost.id,
              name: newHost.user.username,
            },
            message: `${newHost.user.username} is now the host`,
          });
        }

        // Send updated room info
        const updatedRoom = await RoomService.getRoomById(roomId);
        if (updatedRoom) {
          socket.to(roomId).emit('room_updated', {
            room: updatedRoom,
            players: remainingPlayers.map(p => ({
              id: p.id,
              userId: p.userId,
              username: p.user.username,
              avatar: p.user.avatar,
              isHost: p.isHost,
              isOnline: p.isOnline,
            })),
          });
        }

        socket.emit('room_left', {
          success: true,
          message: 'Left room successfully',
        });

        logger.info('Player left room successfully', {
          roomId,
          playerId: removedPlayer.id,
          playerName: removedPlayer.user.username,
          remainingPlayers: remainingPlayers.length,
          socketId: socket.id,
        });
      }

    } catch (error) {
      console.error('❌ Failed to leave room:', error);
      logger.error('Failed to leave room', { error, data, socketId: socket.id });
      socket.emit('error', {
        message: 'Failed to leave room',
        code: 'LEAVE_ROOM_FAILED'
      });
    }
  }

  /**
   * Handle room updates
   */
  private async handleUpdateRoom(socket: Socket, data: {
    roomId?: string;
    name?: string;
    maxPlayers?: number;
    themeMode?: boolean;
    isPublic?: boolean;
  }): Promise<void> {
    try {
      const roomId = data?.roomId || socket.data.roomId;
      const playerId = socket.data.playerId;

      if (!roomId || !playerId) {
        socket.emit('error', {
          message: 'Not in a room',
          code: 'NOT_IN_ROOM'
        });
        return;
      }

      // Verify player is host
      const player = await PlayerService.getPlayerById(playerId);
      if (!player || !player.isHost) {
        socket.emit('error', {
          message: 'Only the host can update room settings',
          code: 'HOST_REQUIRED'
        });
        return;
      }

      console.log(`⚙️ Host updating room ${roomId}:`, data);

      // Update room
      const updatedRoom = await RoomService.updateRoom(roomId, {
        name: data.name,
        maxPlayers: data.maxPlayers,
        themeMode: data.themeMode,
        isPublic: data.isPublic,
      });

      // Get all players
      const players = await PlayerService.getPlayersInRoom(roomId);

      // Broadcast update to all players in room
      const updateData = {
        room: updatedRoom,
        players: players.map(p => ({
          id: p.id,
          userId: p.userId,
          username: p.user.username,
          avatar: p.user.avatar,
          isHost: p.isHost,
          isOnline: p.isOnline,
        })),
      };

      socket.to(roomId).emit('room_updated', updateData);
      socket.emit('room_updated', updateData);

      logger.info('Room updated successfully', {
        roomId,
        hostId: player.id,
        changes: data,
        socketId: socket.id,
      });

    } catch (error) {
      console.error('❌ Failed to update room:', error);
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
  private async handleGetPublicRooms(socket: Socket): Promise<void> {
    try {
      const publicRooms = await RoomService.getPublicRooms();

      socket.emit('public_rooms', {
        success: true,
        rooms: publicRooms.map(room => ({
          id: room.id,
          code: room.code,
          name: room.name,
          playerCount: room.playerCount,
          maxPlayers: room.maxPlayers,
          themeMode: room.themeMode,
          isActive: room.isActive,
          createdAt: room.createdAt,
        })),
      });

    } catch (error) {
      console.error('❌ Failed to get public rooms:', error);
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
  private async handleGetRoomDetails(
    socket: Socket,
    data: { roomId: string }
  ): Promise<void> {
    try {
      const room = await RoomService.getRoomWithPlayers(data.roomId);
      if (!room) {
        socket.emit('error', {
          message: 'Room not found',
          code: 'ROOM_NOT_FOUND'
        });
        return;
      }

      const players = room.players.map(p => ({
        id: p.id,
        userId: p.userId,
        username: p.user.username,
        avatar: p.user.avatar,
        isHost: p.isHost,
        isOnline: p.isOnline,
      }));

      socket.emit('room_details', {
        success: true,
        room,
        players,
      });

    } catch (error) {
      console.error('❌ Failed to get room details:', error);
      logger.error('Failed to get room details', { error, socketId: socket.id });
      socket.emit('error', {
        message: 'Failed to get room details',
        code: 'GET_ROOM_DETAILS_FAILED'
      });
    }
  }
}

export const RoomEvents = new RoomEventsClass();