// server/src/routes/games.ts
// REST API routes for game management

import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { GameService } from '../services/GameService';
import { PlayerService } from '../services/PlayerService';
import { RoomService } from '../services/RoomService';
import { asyncHandler } from '../middleware/errorHandler';
import { validateRequest, validationSchemas } from '../middleware/validation';
import { logger } from '../utils/logger';
import { broadcastToRoom } from '../sockets';

// HTTP Status codes
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
} as const;

const router = Router();

/**
 * @route   POST /api/games/start
 * @desc    Start a new game in a room
 * @access  Private (host only)
 */
router.post(
  '/start',
  validateRequest({ 
    body: Joi.object({
      roomId: Joi.string().required(),
      hostPlayerId: Joi.string().required(),
    })
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const { roomId, hostPlayerId } = req.body;

    // Start the game
    const gameWithPlayers = await GameService.startGame(roomId, hostPlayerId);

    // Broadcast game start via Socket.io
    const gameStartData = {
      game: {
        id: gameWithPlayers.id,
        state: gameWithPlayers.state,
        roundNumber: gameWithPlayers.roundNumber,
        wordGiverId: gameWithPlayers.wordGiverId,
      },
      players: gameWithPlayers.players.map(p => ({
        id: p.id,
        name: p.name,
        isHost: p.isHost,
        isOnline: p.isOnline,
        isWordGiver: p.isWordGiver,
      })),
    };

    broadcastToRoom(roomId, 'game_started', gameStartData);

    logger.info('Game started via API', {
      gameId: gameWithPlayers.id,
      roomId,
      hostPlayerId,
      playerCount: gameWithPlayers.players.length,
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: 'Game started successfully',
      game: {
        id: gameWithPlayers.id,
        state: gameWithPlayers.state,
        roundNumber: gameWithPlayers.roundNumber,
        wordGiverId: gameWithPlayers.wordGiverId,
        createdAt: gameWithPlayers.createdAt,
      },
      players: gameWithPlayers.players.map(p => ({
        id: p.id,
        name: p.name,
        isHost: p.isHost,
        isOnline: p.isOnline,
        isWordGiver: p.isWordGiver,
        // Don't reveal imposter via REST API
      })),
    });
  })
);

/**
 * @route   GET /api/games/:gameId
 * @desc    Get game details
 * @access  Public
 */
router.get(
  '/:gameId',
  validateRequest({ params: validationSchemas.gameId }),
  asyncHandler(async (req: Request, res: Response) => {
    const { gameId } = req.params;

    const gameWithPlayers = await GameService.getGameWithPlayers(gameId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Game details retrieved successfully',
      game: {
        id: gameWithPlayers.id,
        roomId: gameWithPlayers.roomId,
        state: gameWithPlayers.state,
        roundNumber: gameWithPlayers.roundNumber,
        wordGiverId: gameWithPlayers.wordGiverId,
        winner: gameWithPlayers.winner,
        createdAt: gameWithPlayers.createdAt,
        completedAt: gameWithPlayers.completedAt,
        // Don't expose sensitive info like currentWord, imposterId via REST
      },
      players: gameWithPlayers.players.map(p => ({
        id: p.id,
        name: p.name,
        isHost: p.isHost,
        isOnline: p.isOnline,
        isWordGiver: p.isWordGiver,
        hasVoted: p.hasVoted,
        // Don't reveal imposter via REST API
      })),
    });
  })
);

/**
 * @route   GET /api/games/room/:roomId/current
 * @desc    Get current game in a room
 * @access  Public
 */
router.get(
  '/room/:roomId/current',
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

    const currentGame = await GameService.getCurrentGame(roomId);

    if (!currentGame) {
      return res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'No active game in this room',
        hasGame: false,
        room: {
          id: room.id,
          code: room.code,
          name: room.name,
        },
      });
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Current game retrieved successfully',
      hasGame: true,
      game: {
        id: currentGame.id,
        state: currentGame.state,
        roundNumber: currentGame.roundNumber,
        wordGiverId: currentGame.wordGiverId,
        winner: currentGame.winner,
        createdAt: currentGame.createdAt,
        completedAt: currentGame.completedAt,
      },
      players: currentGame.players.map(p => ({
        id: p.id,
        name: p.name,
        isHost: p.isHost,
        isOnline: p.isOnline,
        isWordGiver: p.isWordGiver,
        hasVoted: p.hasVoted,
      })),
      room: {
        id: room.id,
        code: room.code,
        name: room.name,
      },
    });
  })
);

/**
 * @route   POST /api/games/:gameId/word
 * @desc    Submit a word for the current round
 * @access  Private (word giver only)
 */
router.post(
  '/:gameId/word',
  validateRequest({ 
    params: validationSchemas.gameId,
    body: Joi.object({
      playerId: Joi.string().required(),
      word: Joi.string().min(2).max(50).required(),
    })
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const { gameId } = req.params;
    const { playerId, word } = req.body;

    // Submit the word
    const gameWithPlayers = await GameService.submitWord(gameId, playerId, word);

    // Broadcast word submission via Socket.io
    broadcastToRoom(gameWithPlayers.roomId, 'game_state_changed', {
      gameState: gameWithPlayers.state,
      roundNumber: gameWithPlayers.roundNumber,
      wordGiverId: gameWithPlayers.wordGiverId,
    });

    broadcastToRoom(gameWithPlayers.roomId, 'word_submitted', {
      wordGiverId: gameWithPlayers.wordGiverId,
      gameState: gameWithPlayers.state,
    });

    logger.info('Word submitted via API', {
      gameId,
      playerId,
      wordLength: word.length,
      roundNumber: gameWithPlayers.roundNumber,
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Word submitted successfully',
      game: {
        id: gameWithPlayers.id,
        state: gameWithPlayers.state,
        roundNumber: gameWithPlayers.roundNumber,
        wordGiverId: gameWithPlayers.wordGiverId,
      },
    });
  })
);

/**
 * @route   POST /api/games/:gameId/vote
 * @desc    Submit a vote for a player
 * @access  Private (players only)
 */
router.post(
  '/:gameId/vote',
  validateRequest({ 
    params: validationSchemas.gameId,
    body: Joi.object({
      voterId: Joi.string().required(),
      votedFor: Joi.string().required(),
    })
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const { gameId } = req.params;
    const { voterId, votedFor } = req.body;

    // Submit the vote
    const gameWithPlayers = await GameService.submitVote(gameId, voterId, votedFor);

    // Broadcast vote submission via Socket.io
    broadcastToRoom(gameWithPlayers.roomId, 'vote_submitted', {
      playerId: voterId,
      hasVoted: true,
      totalVotes: Object.keys(gameWithPlayers.votes || {}).length,
      totalPlayers: gameWithPlayers.players.length,
    });

    // If game moved to results phase, broadcast results
    if (gameWithPlayers.state === 'RESULTS') {
      const results = await GameService.getGameResults(gameId);
      broadcastToRoom(gameWithPlayers.roomId, 'game_ended', {
        results: {
          winner: results.winner,
          correctWord: results.correctWord,
          imposterId: results.imposterId,
          votes: results.votes,
        },
        gameState: gameWithPlayers.state,
      });
    }

    logger.info('Vote submitted via API', {
      gameId,
      voterId,
      votedFor,
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Vote submitted successfully',
      game: {
        id: gameWithPlayers.id,
        state: gameWithPlayers.state,
        roundNumber: gameWithPlayers.roundNumber,
      },
      voteStatus: {
        totalVotes: Object.keys(gameWithPlayers.votes || {}).length,
        totalPlayers: gameWithPlayers.players.length,
        votingComplete: gameWithPlayers.state === 'RESULTS',
      },
    });
  })
);

/**
 * @route   POST /api/games/:gameId/voting/start
 * @desc    Start voting phase
 * @access  Private (host or system)
 */
router.post(
  '/:gameId/voting/start',
  validateRequest({ 
    params: validationSchemas.gameId,
    body: Joi.object({
      requesterId: Joi.string().required(),
    })
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const { gameId } = req.params;

    // Start voting phase
    const gameWithPlayers = await GameService.startVoting(gameId);

    // Broadcast voting start via Socket.io
    broadcastToRoom(gameWithPlayers.roomId, 'voting_started', {
      gameState: gameWithPlayers.state,
      timeLimit: 120, // 2 minutes
      players: gameWithPlayers.players.map(p => ({
        id: p.id,
        name: p.name,
        isOnline: p.isOnline,
      })),
    });

    logger.info('Voting started via API', { gameId });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Voting phase started',
      game: {
        id: gameWithPlayers.id,
        state: gameWithPlayers.state,
        roundNumber: gameWithPlayers.roundNumber,
      },
      votingInfo: {
        timeLimit: 120,
        eligiblePlayers: gameWithPlayers.players.filter(p => p.isOnline).length,
      },
    });
  })
);

/**
 * @route   POST /api/games/:gameId/next-round
 * @desc    Start next round
 * @access  Private (host only)
 */
router.post(
  '/:gameId/next-round',
  validateRequest({ 
    params: validationSchemas.gameId,
    body: Joi.object({
      requesterId: Joi.string().required(),
    })
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const { gameId } = req.params;

    // Start next round
    const gameWithPlayers = await GameService.startNextRound(gameId);

    if (gameWithPlayers.state === 'COMPLETED') {
      // Game is complete
      broadcastToRoom(gameWithPlayers.roomId, 'game_completed', {
        gameState: gameWithPlayers.state,
        message: 'All players have had their turn. Game completed!',
      });
    } else {
      // New round started
      broadcastToRoom(gameWithPlayers.roomId, 'next_round_started', {
        gameState: gameWithPlayers.state,
        roundNumber: gameWithPlayers.roundNumber,
        wordGiverId: gameWithPlayers.wordGiverId,
      });
    }

    logger.info('Next round started via API', {
      gameId,
      roundNumber: gameWithPlayers.roundNumber,
      wordGiverId: gameWithPlayers.wordGiverId,
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: gameWithPlayers.state === 'COMPLETED' 
        ? 'Game completed successfully' 
        : 'Next round started successfully',
      game: {
        id: gameWithPlayers.id,
        state: gameWithPlayers.state,
        roundNumber: gameWithPlayers.roundNumber,
        wordGiverId: gameWithPlayers.wordGiverId,
      },
    });
  })
);

/**
 * @route   POST /api/games/:gameId/end
 * @desc    End a game (host only)
 * @access  Private (host only)
 */
router.post(
  '/:gameId/end',
  validateRequest({ 
    params: validationSchemas.gameId,
    body: Joi.object({
      hostPlayerId: Joi.string().required(),
    })
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const { gameId } = req.params;
    const { hostPlayerId } = req.body;

    // Verify player is host
    const player = await PlayerService.getPlayerById(hostPlayerId);
    if (!player || !player.isHost) {
      return res.status(403).json({
        success: false,
        error: 'Only the host can end the game',
        code: 'NOT_HOST',
      });
    }

    // End the game
    const gameWithPlayers = await GameService.endGame(gameId);

    // Broadcast game end via Socket.io
    broadcastToRoom(gameWithPlayers.roomId, 'game_ended', {
      gameState: gameWithPlayers.state,
      reason: 'ended_by_host',
      message: 'Game ended by host',
    });

    logger.info('Game ended via API', {
      gameId,
      hostPlayerId,
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Game ended successfully',
      game: {
        id: gameWithPlayers.id,
        state: gameWithPlayers.state,
        completedAt: gameWithPlayers.completedAt,
      },
    });
  })
);

/**
 * @route   GET /api/games/:gameId/results
 * @desc    Get game results
 * @access  Public
 */
router.get(
  '/:gameId/results',
  validateRequest({ params: validationSchemas.gameId }),
  asyncHandler(async (req: Request, res: Response) => {
    const { gameId } = req.params;

    // Get game first to check if it's completed
    const game = await GameService.getGameWithPlayers(gameId);
    
    if (game.state !== 'RESULTS' && game.state !== 'COMPLETED') {
      return res.status(400).json({
        success: false,
        error: 'Game results not available yet',
        code: 'GAME_NOT_COMPLETED',
        currentState: game.state,
      });
    }

    const results = await GameService.getGameResults(gameId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Game results retrieved successfully',
      results: {
        winner: results.winner,
        correctWord: results.correctWord,
        imposterId: results.imposterId,
        votes: results.votes,
        playerStats: results.playerStats,
      },
      game: {
        id: game.id,
        state: game.state,
        roundNumber: game.roundNumber,
        completedAt: game.completedAt,
      },
    });
  })
);

/**
 * @route   GET /api/games/stats
 * @desc    Get game statistics (for admin/monitoring)
 * @access  Public
 */
router.get(
  '/stats',
  asyncHandler(async (req: Request, res: Response) => {
    // This would typically require admin authentication
    // For now, we'll provide basic stats

    // You could add methods to services to get these stats
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Game statistics retrieved',
      stats: {
        message: 'Game statistics feature coming soon',
        // Could add: active games, total games played, etc.
      },
    });
  })
);

export default router;