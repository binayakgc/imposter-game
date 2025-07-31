// server/src/services/GameService.ts
// Game management service with game logic

import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { createRotationQueue, getRandomElement, hasMinimumPlayers, sanitizeString } from '../utils/helpers';
import { PlayerService } from './PlayerService';
import { RoomService } from './RoomService';

// Game state enum
enum GameState {
  WAITING = 'WAITING',
  WORD_SUBMISSION = 'WORD_SUBMISSION',
  DISCUSSION = 'DISCUSSION',
  VOTING = 'VOTING',
  RESULTS = 'RESULTS',
  COMPLETED = 'COMPLETED'
}

// Local constants
const HTTP_STATUS = {
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
} as const;

const ERROR_CODES = {
  GAME_NOT_FOUND: 'GAME_NOT_FOUND',
  GAME_NOT_STARTED: 'GAME_NOT_STARTED',
  GAME_ALREADY_STARTED: 'GAME_ALREADY_STARTED',
  NOT_ENOUGH_PLAYERS: 'NOT_ENOUGH_PLAYERS',
  INVALID_GAME_STATE: 'INVALID_GAME_STATE',
  WORD_ALREADY_SUBMITTED: 'WORD_ALREADY_SUBMITTED',
  VOTE_ALREADY_SUBMITTED: 'VOTE_ALREADY_SUBMITTED',
  NOT_WORD_GIVER: 'NOT_WORD_GIVER',
  INVALID_VOTE_TARGET: 'INVALID_VOTE_TARGET',
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  PLAYER_NOT_FOUND: 'PLAYER_NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;

// Game service interfaces
export interface GameWithPlayers {
  id: string;
  roomId: string;
  currentWord: string | null;
  wordGiverId: string | null;
  imposterId: string | null;
  state: GameState;
  roundNumber: number;
  wordGiverQueue: string[];
  votes: any;
  winner: string | null;
  createdAt: Date;
  completedAt: Date | null;
  timeLimit: number | null;
  players: {
    id: string;
    name: string;
    isHost: boolean;
    isOnline: boolean;
    isImposter?: boolean;
    isWordGiver?: boolean;
    hasVoted?: boolean;
  }[];
}

export interface GameResults {
  winner: 'players' | 'imposter';
  correctWord?: string;
  imposterId: string;
  votes: Record<string, string>;
  playerStats: Record<string, {
    wasImposter: boolean;
    wasWordGiver: boolean;
    votedCorrectly: boolean;
  }>;
}

class GameServiceClass {
  /**
   * Start a new game in a room
   */
  async startGame(roomId: string, hostPlayerId: string): Promise<GameWithPlayers> {
    // Verify room exists
    const room = await RoomService.getRoomById(roomId);
    if (!room) {
      throw new AppError(
        'Room not found',
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.ROOM_NOT_FOUND
      );
    }

    // Get online players
    const players = await PlayerService.getOnlinePlayersInRoom(roomId);
    
    // Check minimum players
    if (!hasMinimumPlayers(players.length)) {
      throw new AppError(
        'At least 4 players are required to start a game',
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.NOT_ENOUGH_PLAYERS
      );
    }

    // Verify host is in the room
    const hostPlayer = players.find(p => p.id === hostPlayerId);
    if (!hostPlayer || !hostPlayer.isHost) {
      throw new AppError(
        'Only the room host can start the game',
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    // Check if there's already an active game
    const existingGame = await prisma.game.findFirst({
      where: {
        roomId,
        state: { not: GameState.COMPLETED }
      }
    });

    if (existingGame) {
      throw new AppError(
        'A game is already in progress in this room',
        HTTP_STATUS.CONFLICT,
        ERROR_CODES.GAME_ALREADY_STARTED
      );
    }

    try {
      // Create player rotation queue
      const playerIds = players.map(p => p.id);
      const wordGiverQueue = createRotationQueue(playerIds);
      const firstWordGiver = wordGiverQueue[0];

      // Create the game
      const game = await prisma.game.create({
        data: {
          roomId,
          state: GameState.WORD_SUBMISSION,
          wordGiverId: firstWordGiver,
          wordGiverQueue: wordGiverQueue.slice(1), // Remove first player from queue
          roundNumber: 1,
        }
      });

      logger.gameEvent('Game started', roomId, hostPlayerId, {
        gameId: game.id,
        playerCount: players.length,
        wordGiverId: firstWordGiver,
      });

      return await this.getGameWithPlayers(game.id);
    } catch (error) {
      logger.error('Failed to start game', { error, roomId, hostPlayerId });
      throw new AppError('Failed to start game');
    }
  }

  /**
   * Submit a word for the current round
   */
  async submitWord(gameId: string, playerId: string, word: string): Promise<GameWithPlayers> {
    const sanitizedWord = sanitizeString(word).toLowerCase();
    
    if (!sanitizedWord || sanitizedWord.length < 2 || sanitizedWord.length > 50) {
      throw new AppError(
        'Word must be between 2 and 50 characters',
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    // Get game
    const game = await this.getGameById(gameId);
    if (!game) {
      throw new AppError(
        'Game not found',
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.GAME_NOT_FOUND
      );
    }

    // Check game state
    if (game.state !== GameState.WORD_SUBMISSION) {
      throw new AppError(
        'Words can only be submitted during word submission phase',
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_GAME_STATE
      );
    }

    // Check if player is the word giver
    if (game.wordGiverId !== playerId) {
      throw new AppError(
        'Only the word giver can submit a word',
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.NOT_WORD_GIVER
      );
    }

    // Check if word already submitted
    if (game.currentWord) {
      throw new AppError(
        'Word has already been submitted for this round',
        HTTP_STATUS.CONFLICT,
        ERROR_CODES.WORD_ALREADY_SUBMITTED
      );
    }

    try {
      // Get online players for imposter assignment
      const players = await PlayerService.getOnlinePlayersInRoom(game.roomId);
      const playerIds = players.map(p => p.id);
      
      // Randomly select imposter (can be anyone, including word giver)
      const imposterId = getRandomElement(playerIds);
      if (!imposterId) {
        throw new AppError('Failed to assign imposter');
      }

      // Update game with word and imposter
      await prisma.game.update({
        where: { id: gameId },
        data: {
          currentWord: sanitizedWord,
          imposterId,
          state: GameState.DISCUSSION,
        }
      });

      logger.gameEvent('Word submitted', game.roomId, playerId, {
        gameId,
        wordLength: sanitizedWord.length,
        imposterId,
        roundNumber: game.roundNumber,
      });

      return await this.getGameWithPlayers(gameId);
    } catch (error) {
      logger.error('Failed to submit word', { error, gameId, playerId });
      throw new AppError('Failed to submit word');
    }
  }

  /**
   * Submit a vote for a player
   */
  async submitVote(gameId: string, voterId: string, targetPlayerId: string): Promise<GameWithPlayers> {
    // Get game
    const game = await this.getGameById(gameId);
    if (!game) {
      throw new AppError(
        'Game not found',
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.GAME_NOT_FOUND
      );
    }

    // Check game state
    if (game.state !== GameState.VOTING) {
      throw new AppError(
        'Votes can only be submitted during voting phase',
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_GAME_STATE
      );
    }

    // Verify both players are in the game
    const players = await PlayerService.getOnlinePlayersInRoom(game.roomId);
    const voter = players.find(p => p.id === voterId);
    const target = players.find(p => p.id === targetPlayerId);

    if (!voter) {
      throw new AppError(
        'Voter not found in game',
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.PLAYER_NOT_FOUND
      );
    }

    if (!target) {
      throw new AppError(
        'Vote target not found in game',
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.INVALID_VOTE_TARGET
      );
    }

    // Players cannot vote for themselves
    if (voterId === targetPlayerId) {
      throw new AppError(
        'Players cannot vote for themselves',
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_VOTE_TARGET
      );
    }

    try {
      // Get current votes
      const currentVotes = (game.votes as Record<string, string>) || {};
      
      // Check if player already voted
      if (currentVotes[voterId]) {
        throw new AppError(
          'Player has already voted',
          HTTP_STATUS.CONFLICT,
          ERROR_CODES.VOTE_ALREADY_SUBMITTED
        );
      }

      // Add the vote
      currentVotes[voterId] = targetPlayerId;

      // Update game with new votes
      await prisma.game.update({
        where: { id: gameId },
        data: {
          votes: currentVotes,
        }
      });

      logger.gameEvent('Vote submitted', game.roomId, voterId, {
        gameId,
        targetPlayerId,
        totalVotes: Object.keys(currentVotes).length,
      });

      // Check if all players have voted
      const totalPlayers = players.length;
      const totalVotes = Object.keys(currentVotes).length;

      if (totalVotes >= totalPlayers) {
        // All votes submitted, calculate results
        return await this.calculateGameResults(gameId);
      }

      return await this.getGameWithPlayers(gameId);
    } catch (error) {
      logger.error('Failed to submit vote', { error, gameId, voterId, targetPlayerId });
      throw new AppError('Failed to submit vote');
    }
  }

  /**
   * Start voting phase
   */
  async startVoting(gameId: string): Promise<GameWithPlayers> {
    const game = await this.getGameById(gameId);
    if (!game) {
      throw new AppError(
        'Game not found',
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.GAME_NOT_FOUND
      );
    }

    if (game.state !== GameState.DISCUSSION) {
      throw new AppError(
        'Can only start voting from discussion phase',
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_GAME_STATE
      );
    }

    try {
      await prisma.game.update({
        where: { id: gameId },
        data: { state: GameState.VOTING }
      });

      logger.gameEvent('Voting started', game.roomId, undefined, { gameId });

      return await this.getGameWithPlayers(gameId);
    } catch (error) {
      logger.error('Failed to start voting', { error, gameId });
      throw new AppError('Failed to start voting');
    }
  }

  /**
   * Start next round
   */
  async startNextRound(gameId: string): Promise<GameWithPlayers> {
    const game = await this.getGameById(gameId);
    if (!game) {
      throw new AppError(
        'Game not found',
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.GAME_NOT_FOUND
      );
    }

    if (game.state !== GameState.RESULTS) {
      throw new AppError(
        'Can only start next round from results phase',
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_GAME_STATE
      );
    }

    try {
      // Get next word giver from queue
      const queue = game.wordGiverQueue;
      const nextWordGiver = queue.length > 0 ? queue[0] : null;

      if (!nextWordGiver) {
        // No more players in queue, game is complete
        await prisma.game.update({
          where: { id: gameId },
          data: { state: GameState.COMPLETED }
        });

        return await this.getGameWithPlayers(gameId);
      }

      // Start new round
      await prisma.game.update({
        where: { id: gameId },
        data: {
          state: GameState.WORD_SUBMISSION,
          wordGiverId: nextWordGiver,
          wordGiverQueue: queue.slice(1), // Remove the next word giver from queue
          roundNumber: game.roundNumber + 1,
          currentWord: null,
          imposterId: null,
          votes: undefined,
          winner: null,
        }
      });

      logger.gameEvent('Next round started', game.roomId, undefined, {
        gameId,
        roundNumber: game.roundNumber + 1,
        wordGiverId: nextWordGiver,
      });

      return await this.getGameWithPlayers(gameId);
    } catch (error) {
      logger.error('Failed to start next round', { error, gameId });
      throw new AppError('Failed to start next round');
    }
  }

  /**
   * Get game by ID
   */
  async getGameById(gameId: string): Promise<any | null> {
    const game = await prisma.game.findUnique({
      where: { id: gameId }
    });
    return game;
  }

  /**
   * Get current game in room
   */
  async getCurrentGame(roomId: string): Promise<GameWithPlayers | null> {
    const game = await prisma.game.findFirst({
      where: {
        roomId,
        state: { not: GameState.COMPLETED }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!game) {
      return null;
    }

    return await this.getGameWithPlayers(game.id);
  }

  /**
   * Get game with player information
   */
  async getGameWithPlayers(gameId: string): Promise<GameWithPlayers> {
    const game = await this.getGameById(gameId);
    if (!game) {
      throw new AppError(
        'Game not found',
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.GAME_NOT_FOUND
      );
    }

    const players = await PlayerService.getOnlinePlayersInRoom(game.roomId);
    const votes = (game.votes as Record<string, string>) || {};

    const playersWithGameInfo = players.map(player => ({
      id: player.id,
      name: player.user.username,
      isHost: player.isHost,
      isOnline: player.isOnline,
      isImposter: player.id === game.imposterId,
      isWordGiver: player.id === game.wordGiverId,
      hasVoted: votes[player.id] !== undefined,
    }));

    return {
      ...game,
      players: playersWithGameInfo,
    };
  }

  /**
   * Calculate game results and determine winner
   */
  private async calculateGameResults(gameId: string): Promise<GameWithPlayers> {
    const game = await this.getGameById(gameId);
    if (!game) {
      throw new AppError('Game not found');
    }

    const players = await PlayerService.getOnlinePlayersInRoom(game.roomId);
    const votes = (game.votes as Record<string, string>) || {};

    // Count votes for each player
    const voteCounts: Record<string, number> = {};
    Object.values(votes).forEach(targetId => {
      voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
    });

    // Find player with most votes
    let maxVotes = 0;
    let eliminatedPlayerId: string | null = null;
    
    for (const [playerId, count] of Object.entries(voteCounts)) {
      if (count > maxVotes) {
        maxVotes = count;
        eliminatedPlayerId = playerId;
      }
    }

    // Determine winner
    const isImposterEliminated = eliminatedPlayerId === game.imposterId;
    const winner = isImposterEliminated ? 'players' : 'imposter';

    try {
      // Update game with results
      await prisma.game.update({
        where: { id: gameId },
        data: {
          state: GameState.RESULTS,
          winner,
          completedAt: new Date(),
        }
      });

      logger.gameEvent('Game completed', game.roomId, undefined, {
        gameId,
        winner,
        eliminatedPlayerId,
        imposterId: game.imposterId,
        roundNumber: game.roundNumber,
      });

      return await this.getGameWithPlayers(gameId);
    } catch (error) {
      logger.error('Failed to calculate game results', { error, gameId });
      throw new AppError('Failed to calculate game results');
    }
  }

  /**
   * End game (for host or system)
   */
  async endGame(gameId: string): Promise<GameWithPlayers> {
    const game = await this.getGameById(gameId);
    if (!game) {
      throw new AppError(
        'Game not found',
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.GAME_NOT_FOUND
      );
    }

    if (game.state === GameState.COMPLETED) {
      return await this.getGameWithPlayers(gameId);
    }

    try {
      await prisma.game.update({
        where: { id: gameId },
        data: {
          state: GameState.COMPLETED,
          completedAt: new Date(),
        }
      });

      logger.gameEvent('Game ended', game.roomId, undefined, { gameId });

      return await this.getGameWithPlayers(gameId);
    } catch (error) {
      logger.error('Failed to end game', { error, gameId });
      throw new AppError('Failed to end game');
    }
  }

  /**
   * Get game results for display
   */
  async getGameResults(gameId: string): Promise<GameResults> {
    const gameWithPlayers = await this.getGameWithPlayers(gameId);
    const votes = (gameWithPlayers.votes as Record<string, string>) || {};

    // Calculate player statistics
    const playerStats: Record<string, any> = {};
    gameWithPlayers.players.forEach(player => {
      playerStats[player.id] = {
        wasImposter: player.isImposter,
        wasWordGiver: player.isWordGiver,
        votedCorrectly: votes[player.id] === gameWithPlayers.imposterId,
      };
    });

    return {
      winner: gameWithPlayers.winner as 'players' | 'imposter',
      correctWord: gameWithPlayers.currentWord || undefined,
      imposterId: gameWithPlayers.imposterId || '',
      votes,
      playerStats,
    };
  }

  /**
   * Clean up completed games (utility function)
   */
  async cleanupCompletedGames(maxAge: number = 86400000): Promise<number> {
    const cutoffTime = new Date(Date.now() - maxAge);

    try {
      const result = await prisma.game.deleteMany({
        where: {
          state: GameState.COMPLETED,
          completedAt: {
            lt: cutoffTime,
          }
        }
      });

      if (result.count > 0) {
        logger.info(`Cleaned up ${result.count} completed games`);
      }

      return result.count;
    } catch (error) {
      logger.error('Failed to cleanup completed games', { error });
      return 0;
    }
  }
}

// Export singleton instance
export const GameService = new GameServiceClass();