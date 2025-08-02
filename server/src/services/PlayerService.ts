// server/src/services/PlayerService.ts
// COMPLETE FIXED VERSION - Resolves all remaining TypeScript errors

import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { isValidPlayerName, sanitizeString } from '../utils/helpers';

// ✅ FIXED: Complete HTTP status constants
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,  // ✅ FIXED: Added missing constant
} as const;

const ERROR_CODES = {
  PLAYER_NOT_FOUND: 'PLAYER_NOT_FOUND',
  PLAYER_NAME_TAKEN: 'PLAYER_NAME_TAKEN',
  INVALID_PLAYER_NAME: 'INVALID_PLAYER_NAME',
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_FULL: 'ROOM_FULL',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
} as const;

// Updated Player service interfaces to match User auth schema
export interface CreatePlayerParams {
  userId: string;
  roomId: string;
  socketId?: string;
  isHost?: boolean;
}

export interface UpdatePlayerParams {
  socketId?: string | null;
  isOnline?: boolean;
  lastSeen?: Date;
}

// ✅ FIXED: Updated interface to match actual schema
export interface PlayerWithRoom {
  id: string;
  userId: string;
  roomId: string;
  socketId: string | null;
  isHost: boolean;
  isOnline: boolean;
  joinedAt: Date;
  lastSeen: Date;
  user: {
    id: string;
    username: string;
    avatar?: string | null;
  };
  room: {
    id: string;
    code: string;
    name: string | null;
    isPublic: boolean;
    maxPlayers: number;
    themeMode: boolean;
  };
}

class PlayerServiceClass {
  /**
   * Add a new player to a room
   */
  async addPlayer(params: CreatePlayerParams): Promise<PlayerWithRoom> {
    const { userId, roomId, socketId, isHost = false } = params;

    // ✅ FIXED: Verify user exists first
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new AppError(
        'User not found',
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.USER_NOT_FOUND
      );
    }

    // Validate username (from user, not direct name)
    if (!isValidPlayerName(user.username)) {
      throw new AppError(
        'Username must be between 2 and 20 characters',
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_PLAYER_NAME
      );
    }

    // Check if room exists and get room info
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        _count: {
          select: { players: true }
        }
      }
    });

    if (!room) {
      throw new AppError(
        'Room not found',
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.ROOM_NOT_FOUND
      );
    }

    // Check if room is full
    if (room._count.players >= room.maxPlayers) {
      throw new AppError(
        'Room is full',
        HTTP_STATUS.CONFLICT,
        ERROR_CODES.ROOM_FULL
      );
    }

    // ✅ FIXED: Check if user is already in this room (using userId + roomId unique constraint)
    const existingPlayer = await prisma.player.findFirst({
      where: {
        userId,
        roomId,
      }
    });

    if (existingPlayer) {
      throw new AppError(
        'User is already in this room',
        HTTP_STATUS.CONFLICT,
        ERROR_CODES.PLAYER_NAME_TAKEN
      );
    }

    try {
      // ✅ FIXED: Create player with correct fields
      const player = await prisma.player.create({
        data: {
          userId,
          roomId,
          socketId,
          isHost,
          isOnline: true,
          lastSeen: new Date(),
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatar: true,
            }
          },
          room: {
            select: {
              id: true,
              code: true,
              name: true,
              isPublic: true,
              maxPlayers: true,
              themeMode: true,
            }
          }
        }
      });

      // ✅ FIXED: Log with correct structure
      logger.info('Player added to room', {
        playerId: player.id,
        userId: player.userId,
        username: player.user.username,
        roomId: player.roomId,
        roomCode: player.room.code,
      });

      return player;

    } catch (error) {
      logger.error('Failed to add player to room', {
        error: error instanceof Error ? error.message : 'Unknown error',
        params,
      });
      throw new AppError(
        'Failed to add player to room',
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        ERROR_CODES.VALIDATION_ERROR
      );
    }
  }

  // Add this method to your existing PlayerService class

/**
 * ✅ NEW: Get online player by user ID (for reconnection)
 */
async getOnlinePlayerByUserId(userId: string): Promise<PlayerWithRoom | null> {
  try {
    const player = await prisma.player.findFirst({
      where: {
        userId: userId,
        isOnline: true,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatar: true,
          }
        },
        room: {
          select: {
            id: true,
            code: true,
            name: true,
            isPublic: true,
            maxPlayers: true,
            themeMode: true,
          }
        }
      }
    });

    return player;
  } catch (error) {
    logger.error('Failed to get online player by user ID', { 
      error: error instanceof Error ? error.message : 'Unknown error', 
      userId 
    });
    return null;
  }
}

  /**
   * Get all players in a room
   */
  async getPlayersInRoom(roomId: string): Promise<PlayerWithRoom[]> {
    try {
      const players = await prisma.player.findMany({
        where: { roomId },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatar: true,
            }
          },
          room: {
            select: {
              id: true,
              code: true,
              name: true,
              isPublic: true,
              maxPlayers: true,
              themeMode: true,
            }
          }
        }
      });

      return players;
    } catch (error) {
      logger.error('Failed to get players in room', { 
        error: error instanceof Error ? error.message : 'Unknown error', 
        roomId 
      });
      throw new AppError(
        'Failed to get players',
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR
      );
    }
  }

  /**
   * Get online players in a room
   */
  async getOnlinePlayersInRoom(roomId: string): Promise<PlayerWithRoom[]> {
    try {
      const players = await prisma.player.findMany({
        where: { 
          roomId,
          isOnline: true 
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatar: true,
            }
          },
          room: {
            select: {
              id: true,
              code: true,
              name: true,
              isPublic: true,
              maxPlayers: true,
              themeMode: true,
            }
          }
        }
      });

      return players;
    } catch (error) {
      logger.error('Failed to get online players in room', { 
        error: error instanceof Error ? error.message : 'Unknown error', 
        roomId 
      });
      throw new AppError(
        'Failed to get online players',
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR
      );
    }
  }

  /**
   * Update player information
   */
  async updatePlayer(playerId: string, params: UpdatePlayerParams): Promise<PlayerWithRoom> {
    try {
      const updatedPlayer = await prisma.player.update({
        where: { id: playerId },
        data: params,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatar: true,
            }
          },
          room: {
            select: {
              id: true,
              code: true,
              name: true,
              isPublic: true,
              maxPlayers: true,
              themeMode: true,
            }
          }
        }
      });

      return updatedPlayer;
    } catch (error) {
      logger.error('Failed to update player', { 
        error: error instanceof Error ? error.message : 'Unknown error', 
        playerId, 
        params 
      });
      throw new AppError(
        'Player not found',
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.PLAYER_NOT_FOUND
      );
    }
  }

  /**
   * Remove player from room with host transfer handling
   */
  async removePlayerWithDetails(playerId: string): Promise<{
    removedPlayer: PlayerWithRoom;
    newHost?: PlayerWithRoom;
  }> {
    try {
      // Get player with user info before deletion
      const player = await prisma.player.findUnique({
        where: { id: playerId },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatar: true,
            }
          },
          room: {
            select: {
              id: true,
              code: true,
              name: true,
              isPublic: true,
              maxPlayers: true,
              themeMode: true,
            }
          }
        }
      });

      if (!player) {
        throw new AppError(
          'Player not found',
          HTTP_STATUS.NOT_FOUND,
          ERROR_CODES.PLAYER_NOT_FOUND
        );
      }

      let newHost: PlayerWithRoom | undefined;

      // Handle host transfer if player is host
      if (player.isHost) {
        const remainingPlayers = await prisma.player.findMany({
          where: {
            roomId: player.roomId,
            id: { not: playerId },
            isOnline: true,
          },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatar: true,
              }
            },
            room: {
              select: {
                id: true,
                code: true,
                name: true,
                isPublic: true,
                maxPlayers: true,
                themeMode: true,
              }
            }
          }
        });

        if (remainingPlayers.length > 0) {
          // Transfer host to first remaining player
          newHost = await prisma.player.update({
            where: { id: remainingPlayers[0].id },
            data: { isHost: true },
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  avatar: true,
                }
              },
              room: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  isPublic: true,
                  maxPlayers: true,
                  themeMode: true,
                }
              }
            }
          });
        }
      }

      // Remove the player
      await prisma.player.delete({
        where: { id: playerId }
      });

      logger.info('Player removed from room with details', {
        playerId: player.id,
        userId: player.userId,
        username: player.user.username,
        roomId: player.roomId,
        roomCode: player.room.code,
        wasHost: player.isHost,
        newHostId: newHost?.id,
      });

      return {
        removedPlayer: player,
        newHost,
      };

    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      
      logger.error('Failed to remove player with details', { 
        error: error instanceof Error ? error.message : 'Unknown error', 
        playerId 
      });
      
      throw new AppError(
        'Failed to remove player',
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        ERROR_CODES.VALIDATION_ERROR
      );
    }
  }

  /**
   * Reconnect player (update socket and online status)
   */
  async reconnectPlayer(playerId: string, socketId: string): Promise<PlayerWithRoom> {
    try {
      const player = await prisma.player.update({
        where: { id: playerId },
        data: {
          socketId,
          isOnline: true,
          lastSeen: new Date(),
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatar: true,
            }
          },
          room: {
            select: {
              id: true,
              code: true,
              name: true,
              isPublic: true,
              maxPlayers: true,
              themeMode: true,
            }
          }
        }
      });

      logger.debug('Player reconnected', {
        playerId: player.id,
        userId: player.userId,
        username: player.user.username,
        socketId,
      });

      return player;

    } catch (error) {
      logger.error('Failed to reconnect player', { 
        error: error instanceof Error ? error.message : 'Unknown error', 
        playerId,
        socketId,
      });
      throw new AppError(
        'Failed to reconnect player',
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.PLAYER_NOT_FOUND
      );
    }
  }

  /**
   * Disconnect player (mark as offline)
   */
  async disconnectPlayer(playerId: string): Promise<PlayerWithRoom> {
    try {
      const player = await prisma.player.update({
        where: { id: playerId },
        data: {
          isOnline: false,
          socketId: null,
          lastSeen: new Date(),
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatar: true,
            }
          },
          room: {
            select: {
              id: true,
              code: true,
              name: true,
              isPublic: true,
              maxPlayers: true,
              themeMode: true,
            }
          }
        }
      });

      logger.debug('Player disconnected', {
        playerId: player.id,
        userId: player.userId,
        username: player.user.username,
      });

      return player;

    } catch (error) {
      logger.error('Failed to disconnect player', { 
        error: error instanceof Error ? error.message : 'Unknown error', 
        playerId 
      });
      throw new AppError(
        'Failed to disconnect player',
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.PLAYER_NOT_FOUND
      );
    }
  }

  /**
   * Remove player from room
   */
  async removePlayer(playerId: string): Promise<void> {  // ✅ FIXED: Proper return type
    try {
      // ✅ FIXED: Get player with user info before deletion
      const player = await prisma.player.findUnique({
        where: { id: playerId },
        include: {
          user: {
            select: {
              id: true,
              username: true,
            }
          },
          room: {
            select: {
              id: true,
              code: true,
            }
          }
        }
      });

      if (!player) {
        throw new AppError(
          'Player not found',
          HTTP_STATUS.NOT_FOUND,
          ERROR_CODES.PLAYER_NOT_FOUND
        );
      }

      await prisma.player.delete({
        where: { id: playerId }
      });

      logger.info('Player removed from room', {
        playerId: player.id,
        userId: player.userId,
        username: player.user.username,
        roomId: player.roomId,
        roomCode: player.room.code,
      });

      // ✅ FIXED: No return statement (void return type)

    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      
      logger.error('Failed to remove player', { 
        error: error instanceof Error ? error.message : 'Unknown error', 
        playerId 
      });
      
      throw new AppError(
        'Failed to remove player',
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        ERROR_CODES.VALIDATION_ERROR
      );
    }
  }

  /**
   * Transfer host to another player
   */
  async transferHost(currentHostId: string, newHostId: string): Promise<void> {
    try {
      await prisma.$transaction([
        // Remove host from current host
        prisma.player.update({
          where: { id: currentHostId },
          data: { isHost: false }
        }),
        // Set new host
        prisma.player.update({
          where: { id: newHostId },
          data: { isHost: true }
        })
      ]);

      logger.info('Host transferred', {
        fromPlayerId: currentHostId,
        toPlayerId: newHostId,
      });

    } catch (error) {
      logger.error('Failed to transfer host', {
        error: error instanceof Error ? error.message : 'Unknown error',
        currentHostId,
        newHostId,
      });
      throw new AppError(
        'Failed to transfer host',
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        ERROR_CODES.VALIDATION_ERROR
      );
    }
  }

  /**
   * Get player by ID
   */
  async getPlayerById(playerId: string): Promise<PlayerWithRoom | null> {
    try {
      const player = await prisma.player.findUnique({
        where: { id: playerId },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatar: true,
            }
          },
          room: {
            select: {
              id: true,
              code: true,
              name: true,
              isPublic: true,
              maxPlayers: true,
              themeMode: true,
            }
          }
        }
      });

      return player;
    } catch (error) {
      logger.error('Failed to get player by ID', { 
        error: error instanceof Error ? error.message : 'Unknown error', 
        playerId 
      });
      return null;
    }
  }

  /**
   * Get player by user ID and room ID
   */
  async getPlayerByUserAndRoom(userId: string, roomId: string): Promise<PlayerWithRoom | null> {
    try {
      const player = await prisma.player.findFirst({
        where: { 
          userId,
          roomId 
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatar: true,
            }
          },
          room: {
            select: {
              id: true,
              code: true,
              name: true,
              isPublic: true,
              maxPlayers: true,
              themeMode: true,
            }
          }
        }
      });

      return player;
    } catch (error) {
      logger.error('Failed to get player by user and room', { 
        error: error instanceof Error ? error.message : 'Unknown error', 
        userId,
        roomId 
      });
      return null;
    }
  }

  /**
   * Update player online status
   */
  async updatePlayerOnlineStatus(playerId: string, isOnline: boolean): Promise<void> {
    try {
      await prisma.player.update({
        where: { id: playerId },
        data: { 
          isOnline,
          lastSeen: new Date()
        }
      });

      logger.debug('Player online status updated', {
        playerId,
        isOnline,
      });

    } catch (error) {
      logger.error('Failed to update player online status', { 
        error: error instanceof Error ? error.message : 'Unknown error', 
        playerId,
        isOnline 
      });
    }
  }

  /**
   * Get host player in a room
   */
  async getHostPlayer(roomId: string): Promise<PlayerWithRoom | null> {
    try {
      const hostPlayer = await prisma.player.findFirst({
        where: { 
          roomId,
          isHost: true 
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatar: true,
            }
          },
          room: {
            select: {
              id: true,
              code: true,
              name: true,
              isPublic: true,
              maxPlayers: true,
              themeMode: true,
            }
          }
        }
      });

      return hostPlayer;
    } catch (error) {
      logger.error('Failed to get host player', { 
        error: error instanceof Error ? error.message : 'Unknown error', 
        roomId 
      });
      return null;
    }
  }
}

export const PlayerService = new PlayerServiceClass();