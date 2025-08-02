// server/src/services/RoomService.ts
// COMPLETE FIXED VERSION - Resolves all TypeScript errors

import { prisma } from "../config/database";
import { logger } from "../utils/logger";
import { AppError } from "../middleware/errorHandler";
import { generateRoomCode, sanitizeString } from "../utils/helpers";

// ✅ FIXED: Complete HTTP status constants
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500, // ✅ FIXED: Added missing constant
} as const;

const ERROR_CODES = {
  ROOM_NOT_FOUND: "ROOM_NOT_FOUND",
  ROOM_CODE_TAKEN: "ROOM_CODE_TAKEN",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  USER_NOT_FOUND: "USER_NOT_FOUND",
  ROOM_CREATION_FAILED: "ROOM_CREATION_FAILED",
} as const;

// Updated interfaces to match User auth schema
export interface CreateRoomParams {
  hostUserId: string;
  name?: string;
  isPublic?: boolean;
  maxPlayers?: number;
  themeMode?: boolean;
}

export interface RoomWithPlayerCount {
  id: string;
  code: string;
  name: string | null;
  isPublic: boolean;
  maxPlayers: number;
  themeMode: boolean;
  isActive: boolean;
  playerCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoomWithPlayers extends RoomWithPlayerCount {
  players: {
    id: string;
    userId: string;
    isHost: boolean;
    isOnline: boolean;
    user: {
      id: string;
      username: string;
      avatar: string | null;
    };
  }[];
}

class RoomServiceClass {
  /**
   * Create a new room with host player
   */
  async createRoom(params: CreateRoomParams): Promise<RoomWithPlayerCount> {
    const {
      hostUserId,
      name,
      isPublic = false,
      maxPlayers = 10,
      themeMode = false,
    } = params;

    // ✅ FIXED: Verify user exists first
    const user = await prisma.user.findUnique({
      where: { id: hostUserId },
    });

    if (!user) {
      throw new AppError(
        "User not found",
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.USER_NOT_FOUND
      );
    }

    // Generate unique room code
    let roomCode = generateRoomCode();
    let codeExists = true;

    // Ensure unique code
    while (codeExists) {
      const existingRoom = await prisma.room.findUnique({
        where: { code: roomCode },
      });
      codeExists = !!existingRoom;
      if (codeExists) {
        roomCode = generateRoomCode();
      }
    }

    try {
      // ✅ FIXED: Create room and host player in a transaction
      const result = await prisma.$transaction(async (tx) => {
        // Create the room
        const room = await tx.room.create({
          data: {
            code: roomCode,
            name: name ? sanitizeString(name) : null,
            isPublic,
            maxPlayers,
            themeMode,
            isActive: true,
          },
        });

        // ✅ FIXED: Create host player using userId (matches schema)
        const hostPlayer = await tx.player.create({
          data: {
            userId: hostUserId,
            roomId: room.id,
            isHost: true,
            isOnline: true,
            lastSeen: new Date(),
          },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatar: true,
              },
            },
          },
        });

        return { room, hostPlayer };
      });

      // ✅ FIXED: Log with correct user data structure
      logger.gameEvent(
        "Room created",
        result.room.id,
        result.hostPlayer.userId,
        {
          code: result.room.code,
          isPublic: result.room.isPublic,
          maxPlayers: result.room.maxPlayers,
          hostUsername: result.hostPlayer.user.username,
        }
      );

      return {
        ...result.room,
        playerCount: 1,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Room creation failed";
      logger.error("Failed to create room", {
        error: errorMessage,
        params,
      });
      throw new AppError(
        "Failed to create room",
        HTTP_STATUS.INTERNAL_SERVER_ERROR, // ✅ FIXED: Use proper constant
        ERROR_CODES.ROOM_CREATION_FAILED
      );
    }
  }

  /**
   * Get room by ID with player count
   */
  async getRoomById(roomId: string): Promise<RoomWithPlayerCount | null> {
    try {
      const room = await prisma.room.findUnique({
        where: { id: roomId },
        include: {
          _count: {
            select: { players: true },
          },
        },
      });

      if (!room) {
        return null;
      }

      return {
        id: room.id,
        code: room.code,
        name: room.name,
        isPublic: room.isPublic,
        maxPlayers: room.maxPlayers,
        themeMode: room.themeMode,
        isActive: room.isActive,
        playerCount: room._count.players,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to get room";
      logger.error("Failed to get room by ID", {
        error: errorMessage,
        roomId,
      });
      return null;
    }
  }

  /**
   * Get room by code
   */
  async getRoomByCode(code: string): Promise<RoomWithPlayerCount | null> {
    try {
      const room = await prisma.room.findUnique({
        where: { code },
        include: {
          _count: {
            select: { players: true },
          },
        },
      });

      if (!room) {
        return null;
      }

      return {
        id: room.id,
        code: room.code,
        name: room.name,
        isPublic: room.isPublic,
        maxPlayers: room.maxPlayers,
        themeMode: room.themeMode,
        isActive: room.isActive,
        playerCount: room._count.players,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to get room";
      logger.error("Failed to get room by code", {
        error: errorMessage,
        code,
      });
      return null;
    }
  }

  /**
   * Get all public rooms with player counts
   */
  async getPublicRooms(): Promise<RoomWithPlayerCount[]> {
    try {
      const rooms = await prisma.room.findMany({
        where: {
          isPublic: true,
          isActive: true,
        },
        include: {
          _count: {
            select: { players: true },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      return rooms.map((room) => ({
        id: room.id,
        code: room.code,
        name: room.name,
        isPublic: room.isPublic,
        maxPlayers: room.maxPlayers,
        themeMode: room.themeMode,
        isActive: room.isActive,
        playerCount: room._count.players,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
      }));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to get public rooms";
      logger.error("Failed to get public rooms", {
        error: errorMessage,
      });
      return [];
    }
  }

  /**
   * Get room with players
   */
  async getRoomWithPlayers(roomId: string): Promise<RoomWithPlayers | null> {
    try {
      const room = await prisma.room.findUnique({
        where: { id: roomId },
        include: {
          players: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  avatar: true,
                },
              },
            },
          },
          _count: {
            select: { players: true },
          },
        },
      });

      if (!room) {
        return null;
      }

      return {
        id: room.id,
        code: room.code,
        name: room.name,
        isPublic: room.isPublic,
        maxPlayers: room.maxPlayers,
        themeMode: room.themeMode,
        isActive: room.isActive,
        playerCount: room._count.players,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
        players: room.players.map((player) => ({
          id: player.id,
          userId: player.userId,
          isHost: player.isHost,
          isOnline: player.isOnline,
          user: {
            id: player.user.id,
            username: player.user.username,
            avatar: player.user.avatar,
          },
        })),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to get room with players";
      logger.error("Failed to get room with players", {
        error: errorMessage,
        roomId,
      });
      return null;
    }
  }

  /**
   * Update room settings
   */
  async updateRoom(
    roomId: string,
    updates: Partial<{
      name: string;
      maxPlayers: number;
      themeMode: boolean;
      isPublic: boolean;
    }>
  ): Promise<RoomWithPlayerCount> {
    try {
      const updatedRoom = await prisma.room.update({
        where: { id: roomId },
        data: {
          ...updates,
          name: updates.name ? sanitizeString(updates.name) : undefined,
          updatedAt: new Date(),
        },
        include: {
          _count: {
            select: { players: true },
          },
        },
      });

      logger.info("Room updated", {
        roomId,
        updates,
      });

      return {
        id: updatedRoom.id,
        code: updatedRoom.code,
        name: updatedRoom.name,
        isPublic: updatedRoom.isPublic,
        maxPlayers: updatedRoom.maxPlayers,
        themeMode: updatedRoom.themeMode,
        isActive: updatedRoom.isActive,
        playerCount: updatedRoom._count.players,
        createdAt: updatedRoom.createdAt,
        updatedAt: updatedRoom.updatedAt,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Room update failed";
      logger.error("Failed to update room", {
        error: errorMessage,
        roomId,
        updates,
      });
      throw new AppError(
        "Room not found",
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.ROOM_NOT_FOUND
      );
    }
  }

  /**
   * Delete room
   */
  // Add this method to your existing RoomService class

  /**
   * ✅ NEW: Delete a room and all associated data
   */
  // Add these methods to your existing RoomService class:

/**
 * Delete a room and all associated data
 */
async deleteRoom(roomId: string): Promise<void> {
  try {
    console.log(`🗑️ Deleting room: ${roomId}`);
    
    await prisma.$transaction(async (tx) => {
      // Delete all players first (foreign key constraints)
      const deletedPlayers = await tx.player.deleteMany({
        where: { roomId }
      });
      console.log(`🧹 Deleted ${deletedPlayers.count} players from room ${roomId}`);
      
      // Delete any games
      const deletedGames = await tx.game.deleteMany({
        where: { roomId }
      });
      console.log(`🎮 Deleted ${deletedGames.count} games from room ${roomId}`);
      
      // Delete the room
      const deletedRoom = await tx.room.delete({
        where: { id: roomId }
      });
      console.log(`🏠 Deleted room: ${deletedRoom.code}`);
    });

    logger.info('Room deleted successfully', { roomId });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete room';
    logger.error('Failed to delete room', { error: errorMessage, roomId });
    console.error(`❌ Failed to delete room ${roomId}:`, error);
  }
}

/**
 * Clean up inactive rooms
 */
async cleanupInactiveRooms(maxInactiveMinutes: number = 60): Promise<number> {
  try {
    const cutoffTime = new Date(Date.now() - maxInactiveMinutes * 60 * 1000);
    
    const inactiveRooms = await prisma.room.findMany({
      where: {
        OR: [
          { players: { none: {} } },
          {
            AND: [
              { players: { none: { isOnline: true } } },
              { updatedAt: { lt: cutoffTime } }
            ]
          }
        ]
      },
      select: { id: true, code: true, name: true }
    });

    console.log(`🧹 Found ${inactiveRooms.length} inactive rooms to clean up`);

    for (const room of inactiveRooms) {
      await this.deleteRoom(room.id);
    }

    logger.info('Inactive rooms cleanup completed', {
      cleanedUp: inactiveRooms.length,
      cutoffTime,
    });

    return inactiveRooms.length;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Cleanup failed';
    logger.error('Failed to cleanup inactive rooms', { error: errorMessage });
    return 0;
  }
}

  /**
   * Mark room as inactive
   */
  async deactivateRoom(roomId: string): Promise<void> {
    try {
      await prisma.room.update({
        where: { id: roomId },
        data: {
          isActive: false,
          updatedAt: new Date(),
        },
      });

      logger.info("Room deactivated", { roomId });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Room deactivation failed";
      logger.error("Failed to deactivate room", {
        error: errorMessage,
        roomId,
      });
    }
  }

  /**
   * Check if a room can be joined
   */
  async canJoinRoom(roomCode: string): Promise<{
    success: boolean;
    room?: RoomWithPlayerCount;
    message?: string;
  }> {
    try {
      const room = await this.getRoomByCode(roomCode);

      if (!room) {
        return {
          success: false,
          message: "Room not found",
        };
      }

      if (!room.isActive) {
        return {
          success: false,
          message: "Room is not active",
        };
      }

      if (room.playerCount >= room.maxPlayers) {
        return {
          success: false,
          message: "Room is full",
        };
      }

      return {
        success: true,
        room,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to check room";
      logger.error("Failed to check if can join room", {
        error: errorMessage,
        roomCode,
      });
      return {
        success: false,
        message: "Failed to check room status",
      };
    }
  }

  /**
   * Get room statistics
   */
  async getRoomStats(): Promise<{
    totalRooms: number;
    activeRooms: number;
    publicRooms: number;
    totalPlayers: number;
  }> {
    try {
      const [totalRooms, activeRooms, publicRooms, totalPlayers] =
        await Promise.all([
          prisma.room.count(),
          prisma.room.count({ where: { isActive: true } }),
          prisma.room.count({ where: { isPublic: true, isActive: true } }),
          prisma.player.count({ where: { isOnline: true } }),
        ]);

      return {
        totalRooms,
        activeRooms,
        publicRooms,
        totalPlayers,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to get room stats";
      logger.error("Failed to get room statistics", {
        error: errorMessage,
      });
      return {
        totalRooms: 0,
        activeRooms: 0,
        publicRooms: 0,
        totalPlayers: 0,
      };
    }
  }
}

export const RoomService = new RoomServiceClass();
