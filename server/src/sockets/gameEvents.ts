// server/src/sockets/gameEvents.ts
// Socket events for game management

import { Socket } from 'socket.io';
import { logger } from '../utils/logger';
import { GameService } from '../services/GameService';
import { PlayerService } from '../services/PlayerService';
import { ConnectionHandler } from './connectionHandler';
import { getSocketIOServer } from './index';

interface SocketData {
  playerId?: string;
  roomId?: string;
  playerName?: string;
}

export class GameEventHandlers {
  /**
   * Set up game-related socket event handlers
   */
  static setupGameEvents(socket: Socket): void {
    // Handle starting a game
    socket.on('start_game', async (data: { roomId: string }) => {
      await this.handleStartGame(socket, data);
    });

    // Handle word submission
    socket.on('submit_word', async (data: { gameId: string; word: string }) => {
      await this.handleSubmitWord(socket, data);
    });

    // Handle starting voting phase
    socket.on('start_voting', async (data: { gameId: string }) => {
      await this.handleStartVoting(socket, data);
    });

    // Handle vote submission
    socket.on('submit_vote', async (data: { gameId: string; votedFor: string }) => {
      await this.handleSubmitVote(socket, data);
    });

    // Handle starting next round
    socket.on('next_round', async (data: { gameId: string }) => {
      await this.handleNextRound(socket, data);
    });

    // Handle ending game
    socket.on('end_game', async (data: { gameId: string }) => {
      await this.handleEndGame(socket, data);
    });

    // Handle getting current game state
    socket.on('get_game_state', async (data: { roomId: string }) => {
      await this.handleGetGameState(socket, data);
    });

    // Handle player typing indicator
    socket.on('player_typing', async (data: { roomId: string; isTyping: boolean }) => {
      await this.handlePlayerTyping(socket, data);
    });
  }

  /**
   * Handle starting a new game
   */
  private static async handleStartGame(
    socket: Socket,
    data: { roomId: string }
  ): Promise<void> {
    try {
      const validation = ConnectionHandler.validateSocketPlayer(socket);
      if (!validation.isValid) {
        socket.emit('error', {
          message: validation.error,
          code: 'VALIDATION_ERROR'
        });
        return;
      }

      const { playerId, roomId } = validation;

      // Verify the room ID matches
      if (roomId !== data.roomId) {
        socket.emit('error', {
          message: 'Player not in specified room',
          code: 'PLAYER_NOT_IN_ROOM'
        });
        return;
      }

      // Verify player is host
      const player = await PlayerService.getPlayerById(playerId!);
      if (!player || !player.isHost) {
        socket.emit('error', {
          message: 'Only the host can start the game',
          code: 'NOT_HOST'
        });
        return;
      }

      // Start the game
      const gameWithPlayers = await GameService.startGame(roomId!, playerId!);

      // Notify all players in the room about the game start
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
          // Don't send isImposter to clients yet
        })),
      };

      ConnectionHandler.broadcastToRoom(socket, roomId!, 'game_started', gameStartData, true);

      // Send role-specific information to each player
      for (const gamePlayer of gameWithPlayers.players) {
        const playerSocket = await ConnectionHandler.getSocketByPlayerId(getSocketIOServer(), gamePlayer.id);
        if (playerSocket) {
          playerSocket.emit('role_assigned', {
            isWordGiver: gamePlayer.isWordGiver,
            // Don't reveal imposter role until word is submitted
          });
        }
      }

      logger.gameEvent('Game started via socket', roomId!, playerId!, {
        gameId: gameWithPlayers.id,
        playerCount: gameWithPlayers.players.length,
        wordGiverId: gameWithPlayers.wordGiverId,
      });

    } catch (error) {
      logger.error('Failed to start game', { error, data, socketId: socket.id });
      socket.emit('error', {
        message: error instanceof Error ? error.message : 'Failed to start game',
        code: 'START_GAME_FAILED'
      });
    }
  }

  /**
   * Handle word submission
   */
  private static async handleSubmitWord(
    socket: Socket,
    data: { gameId: string; word: string }
  ): Promise<void> {
    try {
      const validation = ConnectionHandler.validateSocketPlayer(socket);
      if (!validation.isValid) {
        socket.emit('error', {
          message: validation.error,
          code: 'VALIDATION_ERROR'
        });
        return;
      }

      const { playerId, roomId } = validation;

      // Submit the word
      const gameWithPlayers = await GameService.submitWord(data.gameId, playerId!, data.word);

      // Notify all players that word was submitted and discussion phase started
      const gameStateData = {
        gameState: gameWithPlayers.state,
        roundNumber: gameWithPlayers.roundNumber,
        wordGiverId: gameWithPlayers.wordGiverId,
        // Don't send the actual word to players yet
      };

      ConnectionHandler.broadcastToRoom(socket, roomId!, 'game_state_changed', gameStateData, true);

      // Send role-specific information to each player
      for (const gamePlayer of gameWithPlayers.players) {
        const playerSocket = await ConnectionHandler.getSocketByPlayerId(getSocketIOServer(), gamePlayer.id);
        if (playerSocket) {
          // Send the word to regular players, "IMPOSTER" to the imposter
          const wordToSend = gamePlayer.isImposter ? 'IMPOSTER' : gameWithPlayers.currentWord;
          
          playerSocket.emit('word_revealed', {
            word: wordToSend,
            isImposter: gamePlayer.isImposter,
            gameState: gameWithPlayers.state,
          });
        }
      }

      // Notify that word was submitted
      ConnectionHandler.broadcastToRoom(socket, roomId!, 'word_submitted', {
        wordGiverId: gameWithPlayers.wordGiverId,
        gameState: gameWithPlayers.state,
      });

      logger.gameEvent('Word submitted via socket', roomId!, playerId!, {
        gameId: data.gameId,
        wordLength: data.word.length,
        roundNumber: gameWithPlayers.roundNumber,
      });

    } catch (error) {
      logger.error('Failed to submit word', { error, data, socketId: socket.id });
      socket.emit('error', {
        message: error instanceof Error ? error.message : 'Failed to submit word',
        code: 'SUBMIT_WORD_FAILED'
      });
    }
  }

  /**
   * Handle starting voting phase
   */
  private static async handleStartVoting(
    socket: Socket,
    data: { gameId: string }
  ): Promise<void> {
    try {
      const validation = ConnectionHandler.validateSocketPlayer(socket);
      if (!validation.isValid) {
        socket.emit('error', {
          message: validation.error,
          code: 'VALIDATION_ERROR'
        });
        return;
      }

      const { roomId } = validation;

      // Start voting phase
      const gameWithPlayers = await GameService.startVoting(data.gameId);

      // Notify all players that voting has started
      ConnectionHandler.broadcastToRoom(socket, roomId!, 'voting_started', {
        gameState: gameWithPlayers.state,
        timeLimit: 120, // 2 minutes for voting
        players: gameWithPlayers.players.map(p => ({
          id: p.id,
          name: p.name,
          isOnline: p.isOnline,
        })),
      }, true);

      logger.gameEvent('Voting started via socket', roomId!, undefined, {
        gameId: data.gameId,
      });

    } catch (error) {
      logger.error('Failed to start voting', { error, data, socketId: socket.id });
      socket.emit('error', {
        message: error instanceof Error ? error.message : 'Failed to start voting',
        code: 'START_VOTING_FAILED'
      });
    }
  }

  /**
   * Handle vote submission
   */
  private static async handleSubmitVote(
    socket: Socket,
    data: { gameId: string; votedFor: string }
  ): Promise<void> {
    try {
      const validation = ConnectionHandler.validateSocketPlayer(socket);
      if (!validation.isValid) {
        socket.emit('error', {
          message: validation.error,
          code: 'VALIDATION_ERROR'
        });
        return;
      }

      const { playerId, roomId } = validation;

      // Submit the vote
      const gameWithPlayers = await GameService.submitVote(data.gameId, playerId!, data.votedFor);

      // Notify all players that a vote was submitted (without revealing who voted for whom)
      ConnectionHandler.broadcastToRoom(socket, roomId!, 'vote_submitted', {
        playerId: playerId,
        hasVoted: true,
        totalVotes: Object.keys(gameWithPlayers.votes || {}).length,
        totalPlayers: gameWithPlayers.players.length,
      });

      // If game moved to results phase, handle game completion
      if (gameWithPlayers.state === 'RESULTS') {
        // Get game results
        const results = await GameService.getGameResults(data.gameId);

        // Notify all players of the results
        ConnectionHandler.broadcastToRoom(socket, roomId!, 'game_ended', {
          results: {
            winner: results.winner,
            correctWord: results.correctWord,
            imposterId: results.imposterId,
            votes: results.votes,
          },
          gameState: gameWithPlayers.state,
        }, true);
      }

      logger.gameEvent('Vote submitted via socket', roomId!, playerId!, {
        gameId: data.gameId,
        votedFor: data.votedFor,
      });

    } catch (error) {
      logger.error('Failed to submit vote', { error, data, socketId: socket.id });
      socket.emit('error', {
        message: error instanceof Error ? error.message : 'Failed to submit vote',
        code: 'SUBMIT_VOTE_FAILED'
      });
    }
  }

  /**
   * Handle starting next round
   */
  private static async handleNextRound(
    socket: Socket,
    data: { gameId: string }
  ): Promise<void> {
    try {
      const validation = ConnectionHandler.validateSocketPlayer(socket);
      if (!validation.isValid) {
        socket.emit('error', {
          message: validation.error,
          code: 'VALIDATION_ERROR'
        });
        return;
      }

      const { roomId } = validation;

      // Start next round
      const gameWithPlayers = await GameService.startNextRound(data.gameId);

      if (gameWithPlayers.state === 'COMPLETED') {
        // Game is complete
        ConnectionHandler.broadcastToRoom(socket, roomId!, 'game_completed', {
          gameState: gameWithPlayers.state,
          message: 'All players have had their turn. Game completed!',
        }, true);
      } else {
        // New round started
        ConnectionHandler.broadcastToRoom(socket, roomId!, 'next_round_started', {
          gameState: gameWithPlayers.state,
          roundNumber: gameWithPlayers.roundNumber,
          wordGiverId: gameWithPlayers.wordGiverId,
        }, true);

        // Send role information to the new word giver
        const wordGiverSocket = await ConnectionHandler.getSocketByPlayerId(getSocketIOServer(), gameWithPlayers.wordGiverId!);
        if (wordGiverSocket) {
          wordGiverSocket.emit('role_assigned', {
            isWordGiver: true,
          });
        }
      }

      logger.gameEvent('Next round started via socket', roomId!, undefined, {
        gameId: data.gameId,
        roundNumber: gameWithPlayers.roundNumber,
        wordGiverId: gameWithPlayers.wordGiverId,
      });

    } catch (error) {
      logger.error('Failed to start next round', { error, data, socketId: socket.id });
      socket.emit('error', {
        message: error instanceof Error ? error.message : 'Failed to start next round',
        code: 'NEXT_ROUND_FAILED'
      });
    }
  }

  /**
   * Handle ending game
   */
  private static async handleEndGame(
    socket: Socket,
    data: { gameId: string }
  ): Promise<void> {
    try {
      const validation = ConnectionHandler.validateSocketPlayer(socket);
      if (!validation.isValid) {
        socket.emit('error', {
          message: validation.error,
          code: 'VALIDATION_ERROR'
        });
        return;
      }

      const { playerId, roomId } = validation;

      // Verify player is host
      const player = await PlayerService.getPlayerById(playerId!);
      if (!player || !player.isHost) {
        socket.emit('error', {
          message: 'Only the host can end the game',
          code: 'NOT_HOST'
        });
        return;
      }

      // End the game
      const gameWithPlayers = await GameService.endGame(data.gameId);

      // Notify all players that the game ended
      ConnectionHandler.broadcastToRoom(socket, roomId!, 'game_ended', {
        gameState: gameWithPlayers.state,
        reason: 'ended_by_host',
        message: 'Game ended by host',
      }, true);

      logger.gameEvent('Game ended via socket', roomId!, playerId!, {
        gameId: data.gameId,
      });

    } catch (error) {
      logger.error('Failed to end game', { error, data, socketId: socket.id });
      socket.emit('error', {
        message: error instanceof Error ? error.message : 'Failed to end game',
        code: 'END_GAME_FAILED'
      });
    }
  }

  /**
   * Handle getting current game state
   */
  private static async handleGetGameState(
    socket: Socket,
    data: { roomId: string }
  ): Promise<void> {
    try {
      const validation = ConnectionHandler.validateSocketPlayer(socket);
      if (!validation.isValid) {
        socket.emit('error', {
          message: validation.error,
          code: 'VALIDATION_ERROR'
        });
        return;
      }

      const { playerId, roomId } = validation;

      // Verify the room ID matches
      if (roomId !== data.roomId) {
        socket.emit('error', {
          message: 'Player not in specified room',
          code: 'PLAYER_NOT_IN_ROOM'
        });
        return;
      }

      const currentGame = await GameService.getCurrentGame(data.roomId);

      if (!currentGame) {
        socket.emit('game_state', {
          hasGame: false,
          message: 'No active game in this room',
        });
        return;
      }

      // Find the requesting player in the game
      const requestingPlayer = currentGame.players.find(p => p.id === playerId);
      if (!requestingPlayer) {
        socket.emit('error', {
          message: 'Player not in game',
          code: 'PLAYER_NOT_IN_GAME'
        });
        return;
      }

      // Send game state with player-specific information
      socket.emit('game_state', {
        hasGame: true,
        game: {
          id: currentGame.id,
          state: currentGame.state,
          roundNumber: currentGame.roundNumber,
          wordGiverId: currentGame.wordGiverId,
        },
        playerRole: {
          isWordGiver: requestingPlayer.isWordGiver,
          isImposter: requestingPlayer.isImposter,
          hasVoted: requestingPlayer.hasVoted,
        },
        word: requestingPlayer.isImposter ? 'IMPOSTER' : currentGame.currentWord,
        players: currentGame.players.map(p => ({
          id: p.id,
          name: p.name,
          isHost: p.isHost,
          isOnline: p.isOnline,
          isWordGiver: p.isWordGiver,
          hasVoted: p.hasVoted,
          // Don't reveal who is imposter
        })),
      });

    } catch (error) {
      logger.error('Failed to get game state', { error, data, socketId: socket.id });
      socket.emit('error', {
        message: 'Failed to get game state',
        code: 'GET_GAME_STATE_FAILED'
      });
    }
  }

  /**
   * Handle player typing indicator
   */
  private static async handlePlayerTyping(
    socket: Socket,
    data: { roomId: string; isTyping: boolean }
  ): Promise<void> {
    try {
      const validation = ConnectionHandler.validateSocketPlayer(socket);
      if (!validation.isValid) {
        return; // Don't emit error for typing indicator
      }

     const { playerId, roomId } = validation;
     const playerName = (socket.data as any).playerName;

      // Verify the room ID matches
      if (roomId !== data.roomId) {
        return; // Don't emit error for typing indicator
      }

      // Broadcast typing indicator to other players in the room
      socket.to(roomId!).emit('player_typing', {
        playerId: playerId,
        playerName: playerName,
        isTyping: data.isTyping,
      });

    } catch (error) {
      // Don't log errors for typing indicators to avoid spam
      logger.debug('Failed to handle typing indicator', { error, data, socketId: socket.id });
    }
  }
}