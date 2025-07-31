// server/src/sockets/roomEvents.ts
// COMPLETE FIXED VERSION - Resolves all room event errors

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

      // Associate socket with player
      ConnectionHandler.associateSocketWithPlayer(
        socket, 
        hostPlayer.id, 
        room.id, 
        hostPlayer.user.username  // ✅ FIXED: Use user.username
      );

      // Join the socket room for real-time updates
      socket.join(room.id);
      console.log(`📡 Socket ${socket.id} joined room ${room.id}`);

      // Get updated room with all players
      const updatedRoom = await RoomService.getRoomById(room.id);
      const allPlayers = await PlayerService.getPlayersInRoom(room.id);

      console.log(`📊 Room created with ${allPlayers.length} players`);

      // Notify the creator
      socket.emit('room_created', {
        success: true,
        room: updatedRoom,
        player: {
          id: hostPlayer.id,
          userId: hostPlayer.userId,
          username: hostPlayer.user.username,  // ✅ FIXED: Use user.username
          avatar: hostPlayer.user.avatar,
          isHost: hostPlayer.isHost,
          isOnline: hostPlayer.isOnline,
        },
        players: allPlayers.map(p => ({
          id: p.id,
          userId: p.userId,
          username: p.user.username,  // ✅ FIXED: Use user.username
          avatar: p.user.avatar,
          isHost: p.isHost,
          isOnline: p.isOnline,
          joinedAt: p.joinedAt,
        })),
      });

      // Update public rooms if this is a public room
      if (isPublic) {
        socket.broadcast.emit('public_rooms_updated');
      }

      logger.gameEvent('Room created', room.id, hostPlayer.userId, {
        code: room.code,
        isPublic: room.isPublic,
        maxPlayers: room.maxPlayers,
        hostUsername: hostPlayer.user.username,  // ✅ FIXED: Use user.username
      });

    } catch (error) {
      console.error('❌ Error creating room:', error);
      logger.error('Failed to create room', { error, data, socketId: socket.id });
      socket.emit('error', {
        message: 'Failed to create room',
        code: 'CREATE_ROOM_FAILED'
      });
    }
  }

  /**
   * Handle joining room by code
   */
  private async handleJoinRoom(socket: Socket, data: {
    roomCode: string;
    playerName?: string; // This will be ignored, we'll use authenticated user
  }): Promise<void> {
    try {
      const { roomCode } = data;
      
      console.log(`🚪 Player joining room ${roomCode} from socket ${socket.id}`);

      // Check if socket has authenticated user
      if (!socket.data.userId) {
        socket.emit('error', {
          message: 'Authentication required to join room',
          code: 'AUTH_REQUIRED'
        });
        return;
      }

      // ✅ FIXED: Use canJoinRoom method
      const roomCheck = await RoomService.canJoinRoom(roomCode.toUpperCase());
      
      if (!roomCheck.success) {
        socket.emit('error', {
          message: roomCheck.message || 'Cannot join room',
          code: 'JOIN_ROOM_FAILED'
        });
        return;
      }

      const room = roomCheck.room!;
      console.log(`✅ Room ${roomCode} found, adding player...`);

      // ✅ FIXED: Use userId instead of name
      const player = await PlayerService.addPlayer({
        userId: socket.data.userId,
        roomId: room.id,
        socketId: socket.id,
        isHost: false,
      });

      console.log(`✅ Player ${player.user.username} added with ID: ${player.id}`);

      // Associate socket with player
      ConnectionHandler.associateSocketWithPlayer(
        socket, 
        player.id, 
        room.id, 
        player.user.username  // ✅ FIXED: Use user.username
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
          username: player.user.username,  // ✅ FIXED: Use user.username
          avatar: player.user.avatar,
          isHost: player.isHost,
          isOnline: player.isOnline,
        },
        players: allPlayers.map(p => ({
          id: p.id,
          userId: p.userId,
          username: p.user.username,  // ✅ FIXED: Use user.username
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
          username: player.user.username,  // ✅ FIXED: Use user.username
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
          username: p.user.username,  // ✅ FIXED: Use user.username
          avatar: p.user.avatar,
          isHost: p.isHost,
          isOnline: p.isOnline,
          joinedAt: p.joinedAt,
        })),
      };

      socket.emit('room_updated', roomUpdateData);
      socket.to(room.id).emit('room_updated', roomUpdateData);

      // Update public rooms
      if (room.isPublic) {
        socket.broadcast.emit('public_rooms_updated');
      }

      logger.gameEvent('Player joined room', room.id, player.userId, {
        playerName: player.user.username,  // ✅ FIXED: Use user.username
        roomCode: room.code,
        totalPlayers: allPlayers.length,
      });

    } catch (error) {
      console.error('❌ Error joining room:', error);
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

      console.log(`🚪 Player leaving room: ${roomId}, playerId: ${playerId}`);

      // Get player info before removal
      const player = await PlayerService.getPlayerById(playerId);
      if (!player) {
        socket.emit('error', {
          message: 'Player not found',
          code: 'PLAYER_NOT_FOUND'
        });
        return;
      }

      // ✅ FIXED: Use removePlayerWithDetails for complete info
      const result = await PlayerService.removePlayerWithDetails(playerId);
      
      console.log(`🗑️ Player ${result.removedPlayer.user.username} removed from database`);

      // Leave socket room
      socket.leave(roomId);
      
      // Clear socket data
      socket.data.playerId = undefined;
      socket.data.roomId = undefined;
      socket.data.playerName = undefined;

      // Notify the leaving player
      socket.emit('room_left', {
        success: true,
        message: 'Left room successfully',
      });

      // Get remaining players
      const remainingPlayers = await PlayerService.getPlayersInRoom(roomId);

      // Notify remaining players about the departure
      socket.to(roomId).emit('player_left', {
        playerId: result.removedPlayer.id,
        userId: result.removedPlayer.userId,
        playerName: result.removedPlayer.user.username,  // ✅ FIXED: Use user.username
        reason: 'left',
      });

      console.log(`📢 Notified remaining players about ${result.removedPlayer.user.username} leaving`);

      // Handle host transfer if needed
      if (result.newHost) {
        console.log(`👑 Host transferred to ${result.newHost.user.username}`);

        // Notify about new host
        socket.to(roomId).emit('host_changed', {
          newHost: {
            id: result.newHost.id,
            username: result.newHost.user.username,  // ✅ FIXED: Use user.username
          },
          message: `${result.newHost.user.username} is now the host`
        });

        logger.gameEvent('Host transferred', roomId, result.newHost.id, {
          previousHostId: result.removedPlayer.id,
          newHostName: result.newHost.user.username,  // ✅ FIXED: Use user.username
        });
      }

      // Send updated room info to remaining players
      if (remainingPlayers.length > 0) {
        const updatedRoom = await RoomService.getRoomById(roomId);
        const roomUpdateData = {
          room: updatedRoom,
          players: remainingPlayers.map(p => ({
            id: p.id,
            userId: p.userId,
            username: p.user.username,  // ✅ FIXED: Use user.username
            avatar: p.user.avatar,
            isHost: p.isHost,
            isOnline: p.isOnline,
            joinedAt: p.joinedAt,
          })),
        };

        socket.to(roomId).emit('room_updated', roomUpdateData);
      }

      // Update public rooms
      socket.broadcast.emit('public_rooms_updated');

      // Log the departure
      logger.gameEvent('Player left room', roomId, result.removedPlayer.userId, {
        playerName: result.removedPlayer.user.username,  // ✅ FIXED: Use user.username
        wasHost: result.removedPlayer.isHost,
        newHostId: result.newHost?.id,
        remainingPlayers: remainingPlayers.length,
      });

      console.log(`✅ Cleanup completed for player ${result.removedPlayer.user.username}`);

    } catch (error) {
      console.error('❌ Error leaving room:', error);
      logger.error('Failed to leave room', { error, socketId: socket.id });
      socket.emit('error', {
        message: 'Failed to leave room',
        code: 'LEAVE_ROOM_FAILED'
      });
    }
  }

  /**
   * Handle room settings update
   */
  private async handleUpdateRoom(socket: Socket, data: {
    roomId?: string;
    name?: string;
    maxPlayers?: number;
    themeMode?: boolean;
    isPublic?: boolean;
  }): Promise<void> {
    try {
      const roomId = data.roomId || socket.data.roomId;
      const playerId = socket.data.playerId;

      if (!roomId || !playerId) {
        socket.emit('error', {
          message: 'Not in a room',
          code: 'NOT_IN_ROOM'
        });
        return;
      }

      console.log(`⚙️ Updating room ${roomId} settings:`, data);

      // Check if player is host
      const player = await PlayerService.getPlayerById(playerId);
      if (!player || !player.isHost) {
        socket.emit('error', {
          message: 'Only the host can update room settings',
          code: 'HOST_REQUIRED'
        });
        return;
      }

      // Update room
      const updatedRoom = await RoomService.updateRoom(roomId, {
        name: data.name,
        maxPlayers: data.maxPlayers,
        themeMode: data.themeMode,
        isPublic: data.isPublic,
      });

      // Get all players
      const allPlayers = await PlayerService.getPlayersInRoom(roomId);

      // Broadcast update to all players in room
      const roomUpdateData = {
        room: updatedRoom,
        players: allPlayers.map(p => ({
          id: p.id,
          userId: p.userId,
          username: p.user.username,  // ✅ FIXED: Use user.username
          avatar: p.user.avatar,
          isHost: p.isHost,
          isOnline: p.isOnline,
          joinedAt: p.joinedAt,
        })),
      };

      socket.emit('room_updated', roomUpdateData);
      socket.to(roomId).emit('room_updated', roomUpdateData);

      // Update public rooms if this is a public room
      if (updatedRoom.isPublic) {
        socket.broadcast.emit('public_rooms_updated');
      }

      logger.gameEvent('Room updated', roomId, playerId, data);

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
      console.log(`📋 Getting public rooms for socket ${socket.id}`);
      const publicRooms = await RoomService.getPublicRooms();
      console.log(`📊 Found ${publicRooms.length} public rooms`);

      socket.emit('public_rooms', {
        success: true,
        rooms: publicRooms,
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
        username: p.user.username,  // ✅ FIXED: Use user.username
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