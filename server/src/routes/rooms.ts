// server/src/routes/rooms.ts
// REST API routes for room management

import { Router, Request, Response } from 'express';
import { RoomService } from '../services/RoomService';
import { PlayerService } from '../services/PlayerService';
import { GameService } from '../services/GameService';
import { asyncHandler } from '../middleware/errorHandler';
import { validateRequest, validationSchemas } from '../middleware/validation';
import { logger } from '../utils/logger';
import { broadcastToRoom } from '../sockets';
import Joi from 'joi';

// HTTP Status codes
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
} as const;

const router = Router();

/**
 * @route   POST /api/rooms
 * @desc    Create a new room
 * @access  Public
 */
router.post(
  '/',
  validateRequest({ body: validationSchemas.createRoom }),
  asyncHandler(async (req: Request, res: Response) => {
    const { name, isPublic, maxPlayers, themeMode, hostName } = req.body;

    const room = await RoomService.createRoom({
      name,
      isPublic,
      maxPlayers,
      themeMode,
      hostName,
    });

    logger.info('Room created via API', {
      roomId: room.id,
      roomCode: room.code,
      isPublic,
      hostName,
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: 'Room created successfully',
      room: {
        id: room.id,
        code: room.code,
        name: room.name,
        isPublic: room.isPublic,
        maxPlayers: room.maxPlayers,
        themeMode: room.themeMode,
        playerCount: room.playerCount,
        createdAt: room.createdAt,
      },
    });
  })
);

/**
 * @route   GET /api/rooms/public
 * @desc    Get all public rooms
 * @access  Public
 */
router.get(
  '/public',
  validateRequest({ query: validationSchemas.roomQuery }),
  asyncHandler(async (req: Request, res: Response) => {
    const publicRooms = await RoomService.getPublicRooms();

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Public rooms retrieved successfully',
      rooms: publicRooms.map(room => ({
        id: room.id,
        code: room.code,
        name: room.name,
        maxPlayers: room.maxPlayers,
        themeMode: room.themeMode,
        playerCount: room.playerCount,
        createdAt: room.createdAt,
      })),
      total: publicRooms.length,
    });
  })
);

/**
 * @route   GET /api/rooms/:roomCode
 * @desc    Get room details by code
 * @access  Public
 */
router.get(
  '/:roomCode',
  validateRequest({ params: validationSchemas.roomCode }),
  asyncHandler(async (req: Request, res: Response) => {
    const { roomCode } = req.params;

    const room = await RoomService.getRoomByCode(roomCode);
    if (!room) {
      return res.status(404).json({
        success: false,
        error: 'Room not found',
        code: 'ROOM_NOT_FOUND',
      });
    }

    // Get players in the room
    const players = await PlayerService.getPlayersInRoom(room.id);
    
    // Get current game if any
    const currentGame = await GameService.getCurrentGame(room.id);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Room details retrieved successfully',
      room: {
        id: room.id,
        code: room.code,
        name: room.name,
        isPublic: room.isPublic,
        maxPlayers: room.maxPlayers,
        themeMode: room.themeMode,
        isActive: room.isActive,
        playerCount: room.playerCount,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
      },
      players: players.map(player => ({
        id: player.id,
        name: player.name,
        isHost: player.isHost,
        isOnline: player.isOnline,
        joinedAt: player.joinedAt,
      })),
      currentGame: currentGame ? {
        id: currentGame.id,
        state: currentGame.state,
        roundNumber: currentGame.roundNumber,
        // Don't expose sensitive game info via REST API
      } : null,
    });
  })
);

/**
 * @route   POST /api/rooms/:roomCode/join
 * @desc    Join a room
 * @access  Public
 */
router.post(
  '/:roomCode/join',
  validateRequest({ 
    params: validationSchemas.roomCode,
    body: Joi.object({
      playerName: Joi.string().min(2).max(20).required(),
    })
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const { roomCode } = req.params;
    const { playerName } = req.body;

    // Check if room can accept new players
    const roomCheck = await RoomService.canJoinRoom(roomCode);
    if (!roomCheck.canJoin) {
      return res.status(400).json({
        success: false,
        error: roomCheck.reason,
        code: 'CANNOT_JOIN_ROOM',
      });
    }

    const room = roomCheck.room!;

    // Add player to the room
    const player = await PlayerService.addPlayer({
      name: playerName,
      roomId: room.id,
      isHost: false,
    });

    // Get updated room and players
    const updatedRoom = await RoomService.getRoomById(room.id);
    const allPlayers = await PlayerService.getPlayersInRoom(room.id);

    // Broadcast room update via Socket.io
    broadcastToRoom(room.id, 'player_joined', {
      player: {
        id: player.id,
        name: player.name,
        isHost: player.isHost,
        isOnline: player.isOnline,
        joinedAt: player.joinedAt,
      },
      room: updatedRoom,
    });

    broadcastToRoom(room.id, 'room_updated', {
      room: updatedRoom,
      players: allPlayers,
    });

    logger.info('Player joined room via API', {
      roomId: room.id,
      roomCode: room.code,
      playerId: player.id,
      playerName: player.name,
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Joined room successfully',
      room: {
        id: updatedRoom?.id,
        code: updatedRoom?.code,
        name: updatedRoom?.name,
        isPublic: updatedRoom?.isPublic,
        maxPlayers: updatedRoom?.maxPlayers,
        themeMode: updatedRoom?.themeMode,
        playerCount: updatedRoom?.playerCount,
      },
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
  })
);

/**
 * @route   PUT /api/rooms/:roomId
 * @desc    Update room settings (host only)
 * @access  Private (host only)
 */
router.put(
  '/:roomId',
  validateRequest({ 
    params: validationSchemas.roomId,
    body: validationSchemas.updateRoom,
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const { roomId } = req.params;
    const { name, maxPlayers, themeMode, isActive } = req.body;

    // Note: In a full implementation, you'd verify the requester is the host
    // For now, we'll update directly through the service
    const updatedRoom = await RoomService.updateRoom(roomId, {
      name,
      maxPlayers,
      themeMode,
      isActive,
    });

    // Get all players
    const allPlayers = await PlayerService.getPlayersInRoom(roomId);

    // Broadcast room update via Socket.io
    broadcastToRoom(roomId, 'room_updated', {
      room: updatedRoom,
      players: allPlayers,
    });

    logger.info('Room updated via API', {
      roomId,
      updates: req.body,
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Room updated successfully',
      room: {
        id: updatedRoom.id,
        code: updatedRoom.code,
        name: updatedRoom.name,
        isPublic: updatedRoom.isPublic,
        maxPlayers: updatedRoom.maxPlayers,
        themeMode: updatedRoom.themeMode,
        isActive: updatedRoom.isActive,
        playerCount: updatedRoom.playerCount,
        updatedAt: updatedRoom.updatedAt,
      },
    });
  })
);

/**
 * @route   DELETE /api/rooms/:roomId
 * @desc    Delete a room (host only)
 * @access  Private (host only)
 */
router.delete(
  '/:roomId',
  validateRequest({ params: validationSchemas.roomId }),
  asyncHandler(async (req: Request, res: Response) => {
    const { roomId } = req.params;

    // Note: In a full implementation, you'd verify the requester is the host
    await RoomService.deleteRoom(roomId);

    // Broadcast room deletion via Socket.io
    broadcastToRoom(roomId, 'room_deleted', {
      roomId,
      message: 'Room has been deleted',
    });

    logger.info('Room deleted via API', { roomId });

    res.status(HTTP_STATUS.NO_CONTENT).send();
  })
);

/**
 * @route   GET /api/rooms/:roomId/players
 * @desc    Get all players in a room
 * @access  Public
 */
router.get(
  '/:roomId/players',
  validateRequest({ params: validationSchemas.roomId }),
  asyncHandler(async (req: Request, res: Response) => {
    const { roomId } = req.params;

    // Verify room exists
    const room = await RoomService.getRoomById(roomId);
    if (!room) {
      return res.status(404).json({
        success: false,
        error: 'Room not found',
        code: 'ROOM_NOT_FOUND',
      });
    }

    const players = await PlayerService.getPlayersInRoom(roomId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Players retrieved successfully',
      players: players.map(player => ({
        id: player.id,
        name: player.name,
        isHost: player.isHost,
        isOnline: player.isOnline,
        joinedAt: player.joinedAt,
        lastSeen: player.lastSeen,
      })),
      total: players.length,
      room: {
        id: room.id,
        code: room.code,
        name: room.name,
      },
    });
  })
);

/**
 * @route   POST /api/rooms/:roomId/leave
 * @desc    Leave a room
 * @access  Public
 */
router.post(
  '/:roomId/leave',
  validateRequest({ 
    params: validationSchemas.roomId,
    body: Joi.object({
      playerId: Joi.string().required(),
    })
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const { roomId } = req.params;
    const { playerId } = req.body;

    // Verify player is in the room
    const player = await PlayerService.getPlayerById(playerId);
    if (!player || player.roomId !== roomId) {
      return res.status(400).json({
        success: false,
        error: 'Player not in specified room',
        code: 'PLAYER_NOT_IN_ROOM',
      });
    }

    // Remove player from room
    const result = await PlayerService.removePlayer(playerId);

    // Broadcast player left via Socket.io
    broadcastToRoom(roomId, 'player_left', {
      playerId,
      playerName: result.removedPlayer.name,
      reason: 'left',
    });

    // If there was a new host, broadcast that too
    if (result.newHost) {
      broadcastToRoom(roomId, 'host_changed', {
        newHost: {
          id: result.newHost.id,
          name: result.newHost.name,
        }
      });
    }

    logger.info('Player left room via API', {
      roomId,
      playerId,
      playerName: result.removedPlayer.name,
      wasHost: result.removedPlayer.isHost,
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Left room successfully',
      newHost: result.newHost ? {
        id: result.newHost.id,
        name: result.newHost.name,
      } : null,
    });
  })
);

export default router;