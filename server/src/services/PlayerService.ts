// server/src/services/PlayerService.ts
// Player management service with CRUD operations

import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { isValidPlayerName, sanitizeString } from '../utils/helpers';

// Local constants
const HTTP_STATUS = {
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
} as const;

const ERROR_CODES = {
  PLAYER_NOT_FOUND: 'PLAYER_NOT_FOUND',
  PLAYER_NAME_TAKEN: 'PLAYER_NAME_TAKEN',
  INVALID_PLAYER_NAME: 'INVALID_PLAYER_NAME',
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_FULL: 'ROOM_FULL',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;

// Player service interfaces
export interface CreatePlayerParams {
  name: string;
  roomId: string;
  socketId?: string;
  isHost?: boolean;
}

export interface UpdatePlayerParams {
  name?: string;
  socketId?: string;
  isOnline?: boolean;
  lastSeen?: Date;
}

export interface PlayerWithRoom {
  id: string;
  name: string;
  roomId: string;
  socketId: string | null;
  isHost: boolean;
  isOnline: boolean;
  joinedAt: Date;
  lastSeen: Date;
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
    const { name, roomId, socketId, isHost = false } = params;

    // Validate player name
    if (!isValidPlayerName(name)) {
      throw new AppError(
        'Player name must be between 2 and 20 characters',
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_PLAYER_NAME
      );
    }

    const sanitizedName = sanitizeString(name);

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

    // Check if player name is already taken in this room
    const existingPlayer = await prisma.player.findFirst({
      where: {
        roomId,
        name: sanitizedName,
      }
    });

    if (existingPlayer) {
      throw new AppError(
        'Player name is already taken in this room',
        HTTP_STATUS.CONFLICT,
        ERROR_CODES.PLAYER_NAME_TAKEN
      );
    }

    try {
      const player = await prisma.player.create({
        data: {
          name: sanitizedName,
          roomId,
          socketId,
          isHost,
        },
        include: {
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

      logger.gameEvent('Player added', roomId, player.id, {
        playerName: sanitizedName,
        isHost,
        roomCode: room.code,
      });

      return player;
    } catch (error) {
      logger.error('Failed to add player', { error, params });
      throw new AppError('Failed to add player to room');
    }
  }

  /**
   * Get player by ID with room information
   */
  async getPlayerById(playerId: string): Promise<PlayerWithRoom | null> {
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      include: {
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
  }

  /**
   * Get player by socket ID
   */
  async getPlayerBySocketId(socketId: string): Promise<PlayerWithRoom | null> {
    const player = await prisma.player.findUnique({
      where: { socketId },
      include: {
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
  }

  /**
   * Get all players in a room
   */
  async getPlayersInRoom(roomId: string): Promise<PlayerWithRoom[]> {
    const players = await prisma.player.findMany({
      where: { roomId },
      include: {
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
      },
      orderBy: {
        joinedAt: 'asc',
      }
    });

    return players;
  }

  /**
   * Get online players in a room
   */
  async getOnlinePlayersInRoom(roomId: string): Promise<PlayerWithRoom[]> {
    const players = await prisma.player.findMany({
      where: {
        roomId,
        isOnline: true,
      },
      include: {
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
      },
      orderBy: {
        joinedAt: 'asc',
      }
    });

    return players;
  }

  /**
   * Update player information
   */
  async updatePlayer(playerId: string, params: UpdatePlayerParams): Promise<PlayerWithRoom> {
    const { name, socketId, isOnline, lastSeen } = params;

    // Validate name if provided
    if (name !== undefined && !isValidPlayerName(name)) {
      throw new AppError(
        'Player name must be between 2 and 20 characters',
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_PLAYER_NAME
      );
    }

    // Check if player exists
    const existingPlayer = await this.getPlayerById(playerId);
    if (!existingPlayer) {
      throw new AppError(
        'Player not found',
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.PLAYER_NOT_FOUND
      );
    }

    // Check for name conflicts if updating name
    if (name !== undefined) {
      const sanitizedName = sanitizeString(name);
      const conflictingPlayer = await prisma.player.findFirst({
        where: {
          roomId: existingPlayer.roomId,
          name: sanitizedName,
          id: { not: playerId },
        }
      });

      if (conflictingPlayer) {
        throw new AppError(
          'Player name is already taken in this room',
          HTTP_STATUS.CONFLICT,
          ERROR_CODES.PLAYER_NAME_TAKEN
        );
      }
    }

    try {
      const updatedPlayer = await prisma.player.update({
        where: { id: playerId },
        data: {
          ...(name !== undefined && { name: sanitizeString(name) }),
          ...(socketId !== undefined && { socketId }),
          ...(isOnline !== undefined && { isOnline }),
          ...(lastSeen !== undefined && { lastSeen }),
          // Always update lastSeen when player is updated
          ...(!lastSeen && { lastSeen: new Date() }),
        },
        include: {
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

      logger.gameEvent('Player updated', existingPlayer.roomId, playerId, params);

      return updatedPlayer;
    } catch (error) {
      logger.error('Failed to update player', { error, playerId, params });
      throw new AppError('Failed to update player');
    }
  }

  /**
   * Remove player from room
   */
  async removePlayer(playerId: string): Promise<{ removedPlayer: PlayerWithRoom; newHost?: PlayerWithRoom }> {
    const player = await this.getPlayerById(playerId);
    if (!player) {
      throw new AppError(
        'Player not found',
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.PLAYER_NOT_FOUND
      );
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        // Remove the player
        await tx.player.delete({
          where: { id: playerId }
        });

        let newHost = undefined;

        // If the removed player was the host, assign a new host
        if (player.isHost) {
          const remainingPlayers = await tx.player.findMany({
            where: { roomId: player.roomId },
            orderBy: { joinedAt: 'asc' },
            take: 1,
          });

          if (remainingPlayers.length > 0) {
            newHost = await tx.player.update({
              where: { id: remainingPlayers[0].id },
              data: { isHost: true },
              include: {
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

        return { newHost };
      });

      logger.gameEvent('Player removed', player.roomId, playerId, {
        playerName: player.name,
        wasHost: player.isHost,
        newHostId: result.newHost?.id,
      });

      return {
        removedPlayer: player,
        newHost: result.newHost,
      };
    } catch (error) {
      logger.error('Failed to remove player', { error, playerId });
      throw new AppError('Failed to remove player');
    }
  }

  /**
   * Set player as host
   */
  async setPlayerAsHost(playerId: string): Promise<PlayerWithRoom> {
    const player = await this.getPlayerById(playerId);
    if (!player) {
      throw new AppError(
        'Player not found',
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.PLAYER_NOT_FOUND
      );
    }

    try {
      // Remove host status from current host and set new host
      await prisma.$transaction(async (tx) => {
        // Remove host status from all players in the room
        await tx.player.updateMany({
          where: { roomId: player.roomId },
          data: { isHost: false },
        });

        // Set the specified player as host
        await tx.player.update({
          where: { id: playerId },
          data: { isHost: true },
        });
      });

      const updatedPlayer = await this.getPlayerById(playerId);
      if (!updatedPlayer) {
        throw new AppError('Failed to retrieve updated player');
      }

      logger.gameEvent('Host changed', player.roomId, playerId, {
        newHostName: updatedPlayer.name,
      });

      return updatedPlayer;
    } catch (error) {
      logger.error('Failed to set player as host', { error, playerId });
      throw new AppError('Failed to set player as host');
    }
  }

  /**
   * Disconnect player (set offline)
   */
  async disconnectPlayer(playerId: string): Promise<PlayerWithRoom | null> {
    try {
      const updatedPlayer = await this.updatePlayer(playerId, {
        isOnline: false,
        socketId: undefined,
        lastSeen: new Date(),
      });

      logger.gameEvent('Player disconnected', updatedPlayer.roomId, playerId);
      return updatedPlayer;
    } catch (error) {
      if (error instanceof AppError && error.errorCode === ERROR_CODES.PLAYER_NOT_FOUND) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Reconnect player (set online)
   */
  async reconnectPlayer(playerId: string, socketId: string): Promise<PlayerWithRoom> {
    const updatedPlayer = await this.updatePlayer(playerId, {
      isOnline: true,
      socketId,
    });

    logger.gameEvent('Player reconnected', updatedPlayer.roomId, playerId);
    return updatedPlayer;
  }

  /**
   * Clean up offline players after timeout
   */
  async cleanupOfflinePlayers(timeoutMs: number = 300000): Promise<number> {
    const cutoffTime = new Date(Date.now() - timeoutMs);

    try {
      const result = await prisma.player.deleteMany({
        where: {
          isOnline: false,
          lastSeen: {
            lt: cutoffTime,
          },
        }
      });

      if (result.count > 0) {
        logger.info(`Cleaned up ${result.count} offline players`);
      }

      return result.count;
    } catch (error) {
      logger.error('Failed to cleanup offline players', { error });
      return 0;
    }
  }
}

// Export singleton instance
export const PlayerService = new PlayerServiceClass();