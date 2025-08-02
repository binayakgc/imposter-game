// server/src/routes/rooms.ts
// FIXED VERSION - Handles both room IDs and room codes

import { Router, Request, Response } from 'express';
import { RoomService } from '../services/RoomService';
import { PlayerService } from '../services/PlayerService';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { authenticate, optionalAuth } from '../middleware/authMiddleware';
import Joi from 'joi';

const router = Router();

// Validation schemas
const createRoomSchema = Joi.object({
  name: Joi.string().max(50).optional(),
  isPublic: Joi.boolean().optional(),
  maxPlayers: Joi.number().min(4).max(20).optional(),
  themeMode: Joi.boolean().optional(),
});

const joinRoomSchema = Joi.object({
  roomCode: Joi.string().length(6).required(),
  playerName: Joi.string().min(2).max(20).required(),
});

const updateRoomSchema = Joi.object({
  name: Joi.string().max(50).optional(),
  maxPlayers: Joi.number().min(4).max(20).optional(),
  themeMode: Joi.boolean().optional(),
  isPublic: Joi.boolean().optional(),
});

/**
 * Helper function to determine if a string is a UUID or room code
 */
function isUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Create a new room
 */
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { error, value } = createRoomSchema.validate(req.body);
    if (error) {
      throw new AppError(
        error.details[0].message,
        400,
        'VALIDATION_ERROR'
      );
    }

    const { name, isPublic, maxPlayers, themeMode } = value;

    const room = await RoomService.createRoom({
      hostUserId: req.user!.id,
      name,
      isPublic,
      maxPlayers,
      themeMode,
    });

    logger.info('Room created successfully', {
      roomId: room.id,
      code: room.code,
      hostId: req.user!.id,
      hostUsername: req.user!.username,
    });

    res.status(201).json({
      success: true,
      message: 'Room created successfully',
      room,
    });

  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.errorCode,
      });
    } else {
      logger.error('Room creation failed', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user?.id,
      });
      res.status(500).json({
        success: false,
        error: 'Room creation failed',
        code: 'ROOM_CREATION_ERROR',
      });
    }
  }
});

/**
 * Get all public rooms
 */
router.get('/public', async (req: Request, res: Response) => {
  try {
    const rooms = await RoomService.getPublicRooms();

    res.json({
      success: true,
      rooms,
      total: rooms.length,
    });

  } catch (error) {
    logger.error('Failed to get public rooms', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get public rooms',
      code: 'GET_ROOMS_ERROR',
    });
  }
});

/**
 * ✅ FIXED: Get room by ID OR CODE with players
 * This route now handles both room IDs (UUIDs) and room codes (6-char strings)
 */
router.get('/:roomIdOrCode', optionalAuth, async (req: Request, res: Response) => {
  try {
    const { roomIdOrCode } = req.params;
    let room;

    // ✅ FIXED: Determine if parameter is UUID (room ID) or room code
    if (isUUID(roomIdOrCode)) {
      // It's a room ID (UUID)
      room = await RoomService.getRoomWithPlayers(roomIdOrCode);
    } else {
      // It's a room code (6-character string)
      const roomByCode = await RoomService.getRoomByCode(roomIdOrCode.toUpperCase());
      if (roomByCode) {
        room = await RoomService.getRoomWithPlayers(roomByCode.id);
      }
    }

    if (!room) {
      throw new AppError(
        'Room not found',
        404,
        'ROOM_NOT_FOUND'
      );
    }

    // Map players to include usernames
    const playersWithUsernames = room.players.map(player => ({
      id: player.id,
      userId: player.userId,
      username: player.user.username,
      avatar: player.user.avatar,
      isHost: player.isHost,
      isOnline: player.isOnline,
    }));

    res.json({
      success: true,
      room: {
        ...room,
        players: playersWithUsernames,
      },
      players: playersWithUsernames, // ✅ ADDED: Also include players at top level for compatibility
    });

  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.errorCode,
      });
    } else {
      logger.error('Failed to get room', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        roomIdOrCode: req.params.roomIdOrCode,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to get room',
        code: 'GET_ROOM_ERROR',
      });
    }
  }
});

/**
 * Join room by code
 */
router.post('/join', authenticate, async (req: Request, res: Response) => {
  try {
    const { error, value } = joinRoomSchema.validate(req.body);
    if (error) {
      throw new AppError(
        error.details[0].message,
        400,
        'VALIDATION_ERROR'
      );
    }

    const { roomCode } = value;

    // Check if room exists and is joinable
    const room = await RoomService.getRoomByCode(roomCode.toUpperCase());
    if (!room) {
      throw new AppError(
        'Room not found',
        404,
        'ROOM_NOT_FOUND'
      );
    }

    if (room.playerCount >= room.maxPlayers) {
      throw new AppError(
        'Room is full',
        409,
        'ROOM_FULL'
      );
    }

    // Add player to room
    const player = await PlayerService.addPlayer({
      userId: req.user!.id,
      roomId: room.id,
      isHost: false,
    });

    logger.info('Player joined room', {
      playerId: player.id,
      userId: player.userId,
      username: player.user.username,
      roomId: room.id,
      roomCode: room.code,
    });

    // Get updated room data
    const updatedRoom = await RoomService.getRoomWithPlayers(room.id);
    const playersWithUsernames = updatedRoom!.players.map(p => ({
      id: p.id,
      userId: p.userId,
      username: p.user.username,
      avatar: p.user.avatar,
      isHost: p.isHost,
      isOnline: p.isOnline,
    }));

    res.json({
      success: true,
      message: 'Joined room successfully',
      room: {
        ...updatedRoom,
        players: playersWithUsernames,
      },
      player: {
        id: player.id,
        userId: player.userId,
        username: player.user.username,
        avatar: player.user.avatar,
        isHost: player.isHost,
        isOnline: player.isOnline,
      },
    });

  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.errorCode,
      });
    } else {
      logger.error('Failed to join room', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user?.id,
        roomCode: req.body.roomCode,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to join room',
        code: 'JOIN_ROOM_ERROR',
      });
    }
  }
});

/**
 * Update room settings
 */
router.put('/:roomId', authenticate, async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const { error, value } = updateRoomSchema.validate(req.body);
    
    if (error) {
      throw new AppError(
        error.details[0].message,
        400,
        'VALIDATION_ERROR'
      );
    }

    const { name, maxPlayers, themeMode, isPublic } = value;

    // Check if user is host of the room
    const player = await PlayerService.getPlayerByUserAndRoom(req.user!.id, roomId);
    if (!player || !player.isHost) {
      throw new AppError(
        'Only the room host can update settings',
        403,
        'HOST_REQUIRED'
      );
    }

    const updatedRoom = await RoomService.updateRoom(roomId, {
      name,
      maxPlayers,
      themeMode,
      isPublic,
    });

    logger.info('Room updated', {
      roomId,
      updates: value,
      hostId: req.user!.id,
    });

    res.json({
      success: true,
      message: 'Room updated successfully',
      room: updatedRoom,
    });

  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.errorCode,
      });
    } else {
      logger.error('Failed to update room', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        roomId: req.params.roomId,
        userId: req.user?.id,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to update room',
        code: 'UPDATE_ROOM_ERROR',
      });
    }
  }
});

/**
 * Get players in room
 */
router.get('/:roomId/players', optionalAuth, async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;

    const players = await PlayerService.getPlayersInRoom(roomId);

    // Map players to include usernames
    const playersWithUsernames = players.map(player => ({
      id: player.id,
      userId: player.userId,
      username: player.user.username,
      avatar: player.user.avatar,
      isHost: player.isHost,
      isOnline: player.isOnline,
      joinedAt: player.joinedAt,
    }));

    res.json({
      success: true,
      players: playersWithUsernames,
      total: players.length,
    });

  } catch (error) {
    logger.error('Failed to get room players', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      roomId: req.params.roomId,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get room players',
      code: 'GET_PLAYERS_ERROR',
    });
  }
});

/**
 * Delete room (host only)
 */
router.delete('/:roomId', authenticate, async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;

    // Check if user is host of the room
    const player = await PlayerService.getPlayerByUserAndRoom(req.user!.id, roomId);
    if (!player || !player.isHost) {
      throw new AppError(
        'Only the room host can delete the room',
        403,
        'HOST_REQUIRED'
      );
    }

    await RoomService.deleteRoom(roomId);

    logger.info('Room deleted', {
      roomId,
      hostId: req.user!.id,
    });

    res.json({
      success: true,
      message: 'Room deleted successfully',
    });

  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.errorCode,
      });
    } else {
      logger.error('Failed to delete room', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        roomId: req.params.roomId,
        userId: req.user?.id,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to delete room',
        code: 'DELETE_ROOM_ERROR',
      });
    }
  }
});

export default router;