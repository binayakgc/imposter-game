// server/src/sockets/roomEvents.ts
// COMPLETE FIXED VERSION - Proper room cleanup, player broadcasting, and reconnection

import { Socket } from "socket.io";
import { RoomService } from "../services/RoomService";
import { PlayerService } from "../services/PlayerService";
import { logger } from "../utils/logger";
import { ConnectionHandler } from "./connectionHandler";

export class RoomEventsClass {
  /**
   * Set up all room-related socket event handlers
   */
  setupRoomEvents(socket: Socket): void {
    // Room management events
    socket.on("create_room", (data) => this.handleCreateRoom(socket, data));
    socket.on("join_room", (data) => this.handleJoinRoom(socket, data));
    socket.on("leave_room", (data) => this.handleLeaveRoom(socket, data));
    socket.on("update_room", (data) => this.handleUpdateRoom(socket, data));
    socket.on("get_public_rooms", () => this.handleGetPublicRooms(socket));
    socket.on("get_room_details", (data) =>
      this.handleGetRoomDetails(socket, data)
    );

    console.log(`📋 Room event handlers set up for socket ${socket.id}`);
  }

  /**
   * Handle room creation
   */
  private async handleCreateRoom(
    socket: Socket,
    data: {
      name?: string;
      isPublic?: boolean;
      maxPlayers?: number;
      themeMode?: boolean;
      hostUserId?: string;
    }
  ): Promise<void> {
    try {
      const userId = data.hostUserId || socket.data.userId;

      if (!userId) {
        socket.emit("error", {
          message: "Authentication required to create room",
          code: "AUTH_REQUIRED",
        });
        return;
      }

      const room = await RoomService.createRoom({
        hostUserId: userId,
        name: data.name,
        isPublic: data.isPublic || false,
        maxPlayers: data.maxPlayers || 8,
        themeMode: data.themeMode || false,
      });

      socket.emit("room_created", {
        success: true,
        room,
      });

      // Broadcast public rooms update if room is public
      if (data.isPublic) {
        this.broadcastPublicRoomsUpdate();
      }

      logger.info("Room created successfully", {
        roomId: room.id,
        code: room.code,
        hostId: userId,
        socketId: socket.id,
      });
    } catch (error) {
      console.error("❌ Failed to create room:", error);
      logger.error("Failed to create room", { error, data, socketId: socket.id });
      socket.emit("error", {
        message: "Failed to create room",
        code: "CREATE_ROOM_FAILED",
      });
    }
  }

  /**
   * ✅ ENHANCED: Handle joining room with better broadcasting
   */
  private async handleJoinRoom(
    socket: Socket,
    data: {
      roomCode?: string;
      userId?: string;
    }
  ): Promise<void> {
    try {
      const { roomCode } = data;
      const userId = data.userId || socket.data.userId;

      console.log(`🚪 Player attempting to join room: ${roomCode}`);

      if (!userId) {
        socket.emit("error", {
          message: "Authentication required to join room",
          code: "AUTH_REQUIRED",
        });
        return;
      }

      // Find room by code
      const room = await RoomService.getRoomByCode(roomCode!);
      if (!room) {
        socket.emit("error", {
          message: "Room not found",
          code: "ROOM_NOT_FOUND",
        });
        return;
      }

      // Check if room is full
      if (room.playerCount >= room.maxPlayers) {
        socket.emit("error", {
          message: "Room is full",
          code: "ROOM_FULL",
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

      // Associate socket with room and player
      ConnectionHandler.associateSocketWithPlayer(socket, player.id, room.id);

      // Join the socket room for real-time updates
      socket.join(room.id);
      console.log(`📡 Socket ${socket.id} joined room ${room.id}`);

      // Get updated room with all players
      const updatedRoom = await RoomService.getRoomById(room.id);
      const allPlayers = await PlayerService.getPlayersInRoom(room.id);

      console.log(`📊 Room now has ${allPlayers.length} players`);

      // ✅ FIXED: Transform players for consistent format
      const playersData = allPlayers.map((p) => ({
        id: p.id,
        userId: p.userId,
        username: p.user.username,
        avatar: p.user.avatar,
        isHost: p.isHost,
        isOnline: p.isOnline,
        joinedAt: p.joinedAt,
      }));

      // ✅ ENHANCED: Notify the joining player first
      socket.emit("room_joined", {
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
        players: playersData,
      });

      // ✅ ENHANCED: Notify ALL other players in the room (using room-wide broadcast)
      socket.to(room.id).emit("player_joined", {
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

      // ✅ ENHANCED: Send updated room data to all players in room
      const roomUpdateData = {
        room: updatedRoom,
        players: playersData,
      };
      
      // Send to all players in the room (including the new player)
      socket.to(room.id).emit("room_updated", roomUpdateData);
      socket.emit("room_updated", roomUpdateData);

      // ✅ ENHANCED: Update public rooms if this room is public
      if (room.isPublic) {
        this.broadcastPublicRoomsUpdate();
      }

      logger.info("Player joined room successfully", {
        roomId: room.id,
        roomCode: room.code,
        playerId: player.id,
        playerName: player.user.username,
        totalPlayers: allPlayers.length,
        socketId: socket.id,
      });
    } catch (error) {
      console.error("❌ Failed to join room:", error);
      logger.error("Failed to join room", { error, data, socketId: socket.id });
      socket.emit("error", {
        message: "Failed to join room",
        code: "JOIN_ROOM_FAILED",
      });
    }
  }

  /**
   * ✅ COMPLETE FIX: Handle leaving room with proper cleanup and deletion
   */
  private async handleLeaveRoom(
    socket: Socket,
    data: { roomId?: string }
  ): Promise<void> {
    try {
      const roomId = data?.roomId || socket.data.roomId;
      const playerId = socket.data.playerId;

      if (!roomId || !playerId) {
        socket.emit("error", {
          message: "Not in a room",
          code: "NOT_IN_ROOM",
        });
        return;
      }

      console.log(`🚪 Player ${playerId} leaving room ${roomId}`);

      // ✅ STEP 1: Remove player with host transfer handling
      const result = await PlayerService.removePlayerWithDetails(playerId);
      const removedPlayer = result.removedPlayer;
      const newHost = result.newHost;

      // ✅ STEP 2: Leave socket room
      socket.leave(roomId);
      ConnectionHandler.removeSocketFromRoom(socket);

      // ✅ STEP 3: Check remaining players
      const remainingPlayers = await PlayerService.getPlayersInRoom(roomId);
      console.log(`👥 Remaining players: ${remainingPlayers.length}`);

      if (remainingPlayers.length === 0) {
        // ✅ STEP 4: NO PLAYERS LEFT - DELETE THE ROOM
        console.log(`🗑️ Room ${roomId} is empty, deleting room...`);
        
        try {
          await RoomService.deleteRoom(roomId);
          console.log(`✅ Room ${roomId} deleted successfully`);
          
          // ✅ STEP 5: Broadcast public rooms update (room removed from list)
          this.broadcastPublicRoomsUpdate();
          
          logger.info("Empty room deleted", {
            roomId,
            roomCode: removedPlayer.room.code,
            lastPlayerId: removedPlayer.id,
            lastPlayerName: removedPlayer.user.username,
          });
          
        } catch (deleteError) {
          console.error(`❌ Failed to delete empty room ${roomId}:`, deleteError);
          logger.error("Failed to delete empty room", {
            error: deleteError,
            roomId,
            roomCode: removedPlayer.room.code,
          });
        }
      } else {
        // ✅ STEP 6: PLAYERS STILL IN ROOM - Update and notify
        console.log(`👥 ${remainingPlayers.length} players remain in room`);

        // Notify remaining players that someone left
        socket.to(roomId).emit("player_left", {
          playerId: removedPlayer.id,
          playerName: removedPlayer.user.username,
          reason: "left_room",
        });

        // If there was a host transfer, notify about it
        if (newHost) {
          socket.to(roomId).emit("host_changed", {
            newHost: {
              id: newHost.id,
              name: newHost.user.username,
            },
            message: `${newHost.user.username} is now the host`,
          });
          console.log(`👑 Host transferred to ${newHost.user.username} in room ${roomId}`);
        }

        // ✅ STEP 7: Send updated room info to remaining players
        const updatedRoom = await RoomService.getRoomById(roomId);
        if (updatedRoom) {
          const playersData = remainingPlayers.map((p) => ({
            id: p.id,
            userId: p.userId,
            username: p.user.username,
            avatar: p.user.avatar,
            isHost: p.isHost,
            isOnline: p.isOnline,
          }));

          socket.to(roomId).emit("room_updated", {
            room: updatedRoom,
            players: playersData,
          });

          // ✅ STEP 8: Update public rooms if this room is public
          if (updatedRoom.isPublic) {
            this.broadcastPublicRoomsUpdate();
          }
        }
      }

      // ✅ STEP 9: Confirm to leaving player
      socket.emit("room_left", {
        success: true,
        message: "Left room successfully",
      });

      logger.info("Player left room successfully", {
        roomId,
        playerId: removedPlayer.id,
        playerName: removedPlayer.user.username,
        remainingPlayers: remainingPlayers.length,
        roomDeleted: remainingPlayers.length === 0,
        newHostId: newHost?.id,
        newHostName: newHost?.user.username,
        socketId: socket.id,
      });

    } catch (error) {
      console.error("❌ Failed to leave room:", error);
      logger.error("Failed to leave room", {
        error,
        data,
        socketId: socket.id,
      });
      socket.emit("error", {
        message: "Failed to leave room",
        code: "LEAVE_ROOM_FAILED",
      });
    }
  }

  /**
   * Handle room updates
   */
  private async handleUpdateRoom(
    socket: Socket,
    data: {
      roomId?: string;
      name?: string;
      maxPlayers?: number;
      themeMode?: boolean;
      isPublic?: boolean;
    }
  ): Promise<void> {
    try {
      const roomId = data.roomId || socket.data.roomId;
      const playerId = socket.data.playerId;

      if (!roomId || !playerId) {
        socket.emit("error", {
          message: "Not in a room",
          code: "NOT_IN_ROOM",
        });
        return;
      }

      // Check if player is host
      const player = await PlayerService.getPlayerById(playerId);
      if (!player || !player.isHost) {
        socket.emit("error", {
          message: "Only the host can update room settings",
          code: "HOST_REQUIRED",
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

      // Get current players
      const players = await PlayerService.getPlayersInRoom(roomId);
      const playersData = players.map((p) => ({
        id: p.id,
        userId: p.userId,
        username: p.user.username,
        avatar: p.user.avatar,
        isHost: p.isHost,
        isOnline: p.isOnline,
      }));

      // Notify all players in room
      const roomUpdateData = {
        room: updatedRoom,
        players: playersData,
      };

      socket.to(roomId).emit("room_updated", roomUpdateData);
      socket.emit("room_updated", roomUpdateData);

      // Update public rooms if visibility changed
      this.broadcastPublicRoomsUpdate();

      logger.info("Room updated successfully", {
        roomId,
        updates: data,
        hostId: playerId,
      });
    } catch (error) {
      console.error("❌ Failed to update room:", error);
      logger.error("Failed to update room", { error, data, socketId: socket.id });
      socket.emit("error", {
        message: "Failed to update room",
        code: "UPDATE_ROOM_FAILED",
      });
    }
  }

  /**
   * Handle getting public rooms
   */
  private async handleGetPublicRooms(socket: Socket): Promise<void> {
    try {
      const rooms = await RoomService.getPublicRooms();

      socket.emit("public_rooms", {
        success: true,
        rooms,
      });

      logger.debug("Public rooms sent", {
        count: rooms.length,
        socketId: socket.id,
      });
    } catch (error) {
      console.error("❌ Failed to get public rooms:", error);
      logger.error("Failed to get public rooms", {
        error,
        socketId: socket.id,
      });
      socket.emit("error", {
        message: "Failed to get public rooms",
        code: "GET_PUBLIC_ROOMS_FAILED",
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
        socket.emit("error", {
          message: "Room not found",
          code: "ROOM_NOT_FOUND",
        });
        return;
      }

      const players = room.players.map((p) => ({
        id: p.id,
        userId: p.userId,
        username: p.user.username,
        avatar: p.user.avatar,
        isHost: p.isHost,
        isOnline: p.isOnline,
      }));

      socket.emit("room_details", {
        success: true,
        room,
        players,
      });
    } catch (error) {
      console.error("❌ Failed to get room details:", error);
      logger.error("Failed to get room details", {
        error,
        socketId: socket.id,
      });
      socket.emit("error", {
        message: "Failed to get room details",
        code: "GET_ROOM_DETAILS_FAILED",
      });
    }
  }

  /**
   * ✅ NEW: Broadcast public rooms update to all connected clients
   */
  private async broadcastPublicRoomsUpdate(): Promise<void> {
    try {
      const rooms = await RoomService.getPublicRooms();
      
      // Broadcast to all connected sockets
      ConnectionHandler.broadcastToAll("public_rooms_updated", {
        success: true,
        rooms,
      });

      console.log(`📡 Broadcasted public rooms update: ${rooms.length} rooms`);
    } catch (error) {
      console.error("❌ Failed to broadcast public rooms update:", error);
      logger.error("Failed to broadcast public rooms update", { error });
    }
  }
}

export const RoomEvents = new RoomEventsClass();