// server/src/services/RoomService.ts
// Room management service with CRUD operations

import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { generateRoomCode, isValidRoomCode, validateRoomSettings, sanitizeString } from '../utils/helpers';

// Local constants (avoiding import issues)
const HTTP_STATUS = {
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
} as const;

const ERROR_CODES = {
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_FULL: 'ROOM_FULL',
  ROOM_INACTIVE: 'ROOM_INACTIVE',
  INVALID_ROOM_CODE: 'INVALID_ROOM_CODE',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;

// Room service interface
export interface CreateRoomParams {
  name?: string;
  isPublic: boolean;
  maxPlayers?: number;
  themeMode?: boolean;
  hostName: string;
}

export interface UpdateRoomParams {
  name?: string;
  maxPlayers?: number;
  themeMode?: boolean;
  isActive?: boolean;
}

export interface RoomWithPlayerCount {
  id: string;
  code: string;
  name: string | null;
  isPublic: boolean;
  maxPlayers: number;
  themeMode: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  playerCount: number;
}

class RoomServiceClass {
  /**
   * Create a new room with unique code
   */
  async createRoom(params: CreateRoomParams): Promise<RoomWithPlayerCount> {
    const { name, isPublic, maxPlayers = 8, themeMode = false, hostName } = params;

    // Validate parameters
    if (maxPlayers < 4 || maxPlayers > 10) {
      throw new AppError(
        'Maximum players must be between 4 and 10',
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    // Sanitize name if provided
    const roomName = name ? sanitizeString(name) : null;
    if (roomName && roomName.length < 3) {
      throw new AppError(
        'Room name must be at least 3 characters long',
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    // Generate unique room code
    let roomCode: string;
    let codeExists = true;
    let attempts = 0;
    const maxAttempts = 10;

    do {
      roomCode = generateRoomCode();
      const existingRoom = await prisma.room.findUnique({
        where: { code: roomCode }
      });
      codeExists = !!existingRoom;
      attempts++;

      if (attempts >= maxAttempts) {
        throw new AppError('Failed to generate unique room code');
      }
    } while (codeExists);

    try {
      // Create room and host player in a transaction
      const result = await prisma.$transaction(async (tx) => {
        // Create the room
        const room = await tx.room.create({
          data: {
            code: roomCode,
            name: roomName,
            isPublic,
            maxPlayers,
            themeMode,
          },
        });

        // Create the host player
        await tx.player.create({
          data: {
            name: sanitizeString(hostName),
            roomId: room.id,
            isHost: true,
          },
        });

        return room;
      });

      logger.gameEvent('Room created', result.id, undefined, {
        code: result.code,
        isPublic,
        maxPlayers,
        hostName,
      });

      return {
        ...result,
        playerCount: 1, // Host is the first player
      };
    } catch (error) {
      logger.error('Failed to create room', { error, params });
      throw new AppError('Failed to create room');
    }
  }

  /**
   * Get room by code with player count
   */
  async getRoomByCode(code: string): Promise<RoomWithPlayerCount | null> {
    if (!isValidRoomCode(code)) {
      throw new AppError(
        'Invalid room code format',
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_ROOM_CODE
      );
    }

    const room = await prisma.room.findUnique({
      where: { code: code.toUpperCase() },
      include: {
        _count: {
          select: { players: true }
        }
      }
    });

    if (!room) {
      return null;
    }

    return {
      ...room,
      playerCount: room._count.players,
    };
  }

  /**
   * Get room by ID with player count
   */
  async getRoomById(id: string): Promise<RoomWithPlayerCount | null> {
    const room = await prisma.room.findUnique({
      where: { id },
      include: {
        _count: {
          select: { players: true }
        }
      }
    });

    if (!room) {
      return null;
    }

    return {
      ...room,
      playerCount: room._count.players,
    };
  }

  /**
   * Get all public rooms with player counts
   */
  async getPublicRooms(): Promise<RoomWithPlayerCount[]> {
    const rooms = await prisma.room.findMany({
      where: {
        isPublic: true,
        isActive: true,
      },
      include: {
        _count: {
          select: { players: true }
        }
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return rooms.map(room => ({
      ...room,
      playerCount: room._count.players,
    }));
  }

  /**
   * Update room settings
   */
  async updateRoom(roomId: string, params: UpdateRoomParams): Promise<RoomWithPlayerCount> {
    const { name, maxPlayers, themeMode, isActive } = params;

    // Validate settings if provided
    if (maxPlayers !== undefined || themeMode !== undefined) {
      const validation = validateRoomSettings({ maxPlayers, themeMode });
      if (!validation.isValid) {
        throw new AppError(
          `Invalid room settings: ${validation.errors.join(', ')}`,
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.VALIDATION_ERROR
        );
      }
    }

    // Check if room exists
    const existingRoom = await this.getRoomById(roomId);
    if (!existingRoom) {
      throw new AppError(
        'Room not found',
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.ROOM_NOT_FOUND
      );
    }

    // Check if reducing maxPlayers would kick existing players
    if (maxPlayers !== undefined && maxPlayers < existingRoom.playerCount) {
      throw new AppError(
        `Cannot reduce max players below current player count (${existingRoom.playerCount})`,
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    try {
      const updatedRoom = await prisma.room.update({
        where: { id: roomId },
        data: {
          ...(name !== undefined && { name: sanitizeString(name) }),
          ...(maxPlayers !== undefined && { maxPlayers }),
          ...(themeMode !== undefined && { themeMode }),
          ...(isActive !== undefined && { isActive }),
        },
        include: {
          _count: {
            select: { players: true }
          }
        }
      });

      logger.gameEvent('Room updated', roomId, undefined, params);

      return {
        ...updatedRoom,
        playerCount: updatedRoom._count.players,
      };
    } catch (error) {
      logger.error('Failed to update room', { error, roomId, params });
      throw new AppError('Failed to update room');
    }
  }

  /**
   * Check if room can accept new players
   */
  async canJoinRoom(roomCode: string): Promise<{ canJoin: boolean; reason?: string; room?: RoomWithPlayerCount }> {
    const room = await this.getRoomByCode(roomCode);

    if (!room) {
      return {
        canJoin: false,
        reason: 'Room not found',
      };
    }

    if (!room.isActive) {
      return {
        canJoin: false,
        reason: 'Room is inactive',
        room,
      };
    }

    if (room.playerCount >= room.maxPlayers) {
      return {
        canJoin: false,
        reason: 'Room is full',
        room,
      };
    }

    return {
      canJoin: true,
      room,
    };
  }

  /**
   * Delete room and all associated data
   */
  async deleteRoom(roomId: string): Promise<void> {
    const room = await this.getRoomById(roomId);
    if (!room) {
      throw new AppError(
        'Room not found',
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.ROOM_NOT_FOUND
      );
    }

    try {
      await prisma.room.delete({
        where: { id: roomId }
      });

      logger.gameEvent('Room deleted', roomId);
    } catch (error) {
      logger.error('Failed to delete room', { error, roomId });
      throw new AppError('Failed to delete room');
    }
  }

  /**
   * Clean up inactive rooms (utility function)
   */
  async cleanupInactiveRooms(maxInactiveTime: number = 3600000): Promise<number> {
    const cutoffTime = new Date(Date.now() - maxInactiveTime);

    try {
      const result = await prisma.room.deleteMany({
        where: {
          updatedAt: {
            lt: cutoffTime,
          },
          players: {
            none: {
              isOnline: true,
            }
          }
        }
      });

      if (result.count > 0) {
        logger.info(`Cleaned up ${result.count} inactive rooms`);
      }

      return result.count;
    } catch (error) {
      logger.error('Failed to cleanup inactive rooms', { error });
      return 0;
    }
  }
}

// Export singleton instance
export const RoomService = new RoomServiceClass();