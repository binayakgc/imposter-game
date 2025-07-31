// server/src/sockets/gameEvents.ts
// COMPLETE FIXED VERSION - Resolves all game event errors

import { Socket } from 'socket.io';
import { GameService } from '../services/GameService';
import { PlayerService } from '../services/PlayerService';
import { logger } from '../utils/logger';
import { ConnectionHandler } from './connectionHandler';

export class GameEventsClass {
  /**
   * Set up all game-related socket event handlers
   */
  setupGameEvents(socket: Socket): void {
    // Game control events
    socket.on('start_game', (data) => this.handleStartGame(socket, data));
    socket.on('submit_word', (data) => this.handleSubmitWord(socket, data));
    socket.on('start_voting', (data) => this.handleStartVoting(socket, data));
    socket.on('submit_vote', (data) => this.handleSubmitVote(socket, data));
    socket.on('next_round', (data) => this.handleNextRound(socket, data));
    socket.on('end_game', (data) => this.handleEndGame(socket, data));
    socket.on('restart_game', (data) => this.handleRestartGame(socket, data));
    socket.on('pause_game', (data) => this.handlePauseGame(socket, data));

    console.log(`🎮 Game event handlers set up for socket ${socket.id}`);
  }

  /**
   * Handle game start
   */
  private async handleStartGame(socket: Socket, data: { roomId?: string }): Promise<void> {
    try {
      console.log(`🎮 Starting game for socket ${socket.id}:`, data);

      const roomId = data?.roomId || socket.data.roomId;
      const playerId = socket.data.playerId;

      if (!roomId || !playerId) {
        socket.emit('error', {
          message: 'Not in a room',
          code: 'NOT_IN_ROOM'
        });
        return;
      }

      // ✅ FIXED: Use validateSocketPlayer method correctly
      const validation = ConnectionHandler.validateSocketPlayer(socket);
      if (!validation.success) {
        socket.emit('error', {
          message: validation.message || 'Invalid player session',
          code: 'INVALID_SESSION'
        });
        return;
      }

      // Verify player is host
      const player = await PlayerService.getPlayerById(playerId);
      if (!player || !player.isHost) {
        socket.emit('error', {
          message: 'Only the host can start the game',
          code: 'HOST_REQUIRED'
        });
        return;
      }

      console.log(`🎯 Host ${player.user.username} starting game in room ${roomId}`);

      // Start the game
      const gameWithPlayers = await GameService.startGame(roomId, playerId);

      console.log(`✅ Game started with ${gameWithPlayers.players.length} players`);

      // Prepare game start data
      const gameStartData = {
        game: {
          id: gameWithPlayers.id,
          state: gameWithPlayers.state,
          roundNumber: gameWithPlayers.roundNumber,
          wordGiverId: gameWithPlayers.wordGiverId,
        },
        players: gameWithPlayers.players.map(gamePlayer => ({
          id: gamePlayer.id,
          userId: gamePlayer.userId,
          username: gamePlayer.user.username,
          avatar: gamePlayer.user.avatar,
          isHost: gamePlayer.isHost,
          isOnline: gamePlayer.isOnline,
          isWordGiver: gamePlayer.isWordGiver,
          isImposter: gamePlayer.isImposter,
        })),
      };

      // ✅ FIXED: Broadcast with correct signature (3 parameters)
      ConnectionHandler.broadcastToRoom(roomId, 'game_started', gameStartData);

      // Send role assignments to individual players
      for (const gamePlayer of gameWithPlayers.players) {
        // ✅ FIXED: Use getSocketByPlayerId with single parameter
        const playerSocket = ConnectionHandler.getSocketByPlayerId(gamePlayer.id);
        if (playerSocket) {
          playerSocket.emit('role_assigned', {
            isWordGiver: gamePlayer.isWordGiver,
            isImposter: gamePlayer.isImposter,
          });
        }
      }

      logger.gameEvent('Game started', roomId, playerId, {
        totalPlayers: gameWithPlayers.players.length,
        wordGiverId: gameWithPlayers.wordGiverId,
        imposterId: gameWithPlayers.imposterId,
      });

    } catch (error) {
      console.error('❌ Error starting game:', error);
      logger.error('Failed to start game', { error, data, socketId: socket.id });
      socket.emit('error', {
        message: 'Failed to start game',
        code: 'START_GAME_FAILED'
      });
    }
  }

  /**
   * Handle word submission
   */
  private async handleSubmitWord(socket: Socket, data: {
    roomId?: string;
    word: string;
  }): Promise<void> {
    try {
      const roomId = data?.roomId || socket.data.roomId;
      const playerId = socket.data.playerId;

      if (!roomId || !playerId) {
        socket.emit('error', {
          message: 'Not in a room',
          code: 'NOT_IN_ROOM'
        });
        return;
      }

      // ✅ FIXED: Use validateSocketPlayer method correctly
      const validation = ConnectionHandler.validateSocketPlayer(socket);
      if (!validation.success) {
        socket.emit('error', {
          message: validation.message || 'Invalid player session',
          code: 'INVALID_SESSION'
        });
        return;
      }

      console.log(`📝 Player ${validation.playerName} submitting word: ${data.word}`);

      // Submit word
      const gameWithPlayers = await GameService.submitWord(roomId, playerId, data.word);

      const gameStateData = {
        gameState: gameWithPlayers.state,
        currentWord: gameWithPlayers.currentWord,
        wordGiverId: gameWithPlayers.wordGiverId,
      };

      // ✅ FIXED: Broadcast with correct signature (3 parameters)
      ConnectionHandler.broadcastToRoom(roomId, 'game_state_changed', gameStateData);

      // Send word to each player with their role
      for (const gamePlayer of gameWithPlayers.players) {
        // ✅ FIXED: Use getSocketByPlayerId with single parameter
        const playerSocket = ConnectionHandler.getSocketByPlayerId(gamePlayer.id);
        if (playerSocket) {
          playerSocket.emit('word_revealed', {
            word: gamePlayer.isImposter ? null : gameWithPlayers.currentWord,
            isImposter: gamePlayer.isImposter || false,
            gameState: gameWithPlayers.state,
          });
        }
      }

      // ✅ FIXED: Broadcast with correct signature (3 parameters)
      ConnectionHandler.broadcastToRoom(roomId, 'word_submitted', {
        wordGiverId: gameWithPlayers.wordGiverId,
        gameState: gameWithPlayers.state,
      });

      logger.gameEvent('Word submitted', roomId, playerId, {
        word: data.word,
        gameState: gameWithPlayers.state,
      });

    } catch (error) {
      console.error('❌ Error submitting word:', error);
      logger.error('Failed to submit word', { error, data, socketId: socket.id });
      socket.emit('error', {
        message: 'Failed to submit word',
        code: 'SUBMIT_WORD_FAILED'
      });
    }
  }

  /**
   * Handle start voting
   */
  private async handleStartVoting(socket: Socket, data: { roomId?: string }): Promise<void> {
    try {
      const roomId = data?.roomId || socket.data.roomId;
      const playerId = socket.data.playerId;

      if (!roomId || !playerId) {
        socket.emit('error', {
          message: 'Not in a room',
          code: 'NOT_IN_ROOM'
        });
        return;
      }

      // ✅ FIXED: Use validateSocketPlayer method correctly
      const validation = ConnectionHandler.validateSocketPlayer(socket);
      if (!validation.success) {
        socket.emit('error', {
          message: validation.message || 'Invalid player session',
          code: 'INVALID_SESSION'
        });
        return;
      }

      console.log(`🗳️ Starting voting in room ${roomId}`);

      // Start voting phase
      const gameWithPlayers = await GameService.startVoting(roomId);

      // ✅ FIXED: Broadcast with correct signature (3 parameters)
      ConnectionHandler.broadcastToRoom(roomId, 'voting_started', {
        gameState: gameWithPlayers.state,
        timeLimit: gameWithPlayers.timeLimit || 60,
        players: gameWithPlayers.players.map(p => ({
          id: p.id,
          userId: p.userId,
          username: p.user.username,
          avatar: p.user.avatar,
          isOnline: p.isOnline,
        })),
      });

      logger.gameEvent('Voting started', roomId, playerId, {
        totalPlayers: gameWithPlayers.players.length,
      });

    } catch (error) {
      console.error('❌ Error starting voting:', error);
      logger.error('Failed to start voting', { error, data, socketId: socket.id });
      socket.emit('error', {
        message: 'Failed to start voting',
        code: 'START_VOTING_FAILED'
      });
    }
  }

  /**
   * Handle vote submission
   */
  private async handleSubmitVote(socket: Socket, data: {
    roomId?: string;
    targetPlayerId: string;
  }): Promise<void> {
    try {
      const roomId = data?.roomId || socket.data.roomId;
      const playerId = socket.data.playerId;

      if (!roomId || !playerId) {
        socket.emit('error', {
          message: 'Not in a room',
          code: 'NOT_IN_ROOM'
        });
        return;
      }

      // ✅ FIXED: Use validateSocketPlayer method correctly
      const validation = ConnectionHandler.validateSocketPlayer(socket);
      if (!validation.success) {
        socket.emit('error', {
          message: validation.message || 'Invalid player session',
          code: 'INVALID_SESSION'
        });
        return;
      }

      console.log(`🗳️ Player ${validation.playerName} voting for player ${data.targetPlayerId}`);

      // Submit vote
      const gameWithPlayers = await GameService.submitVote(roomId, playerId, data.targetPlayerId);

      // ✅ FIXED: Broadcast with correct signature (3 parameters)
      ConnectionHandler.broadcastToRoom(roomId, 'vote_submitted', {
        playerId: playerId,
        hasVoted: true,
        totalVotes: gameWithPlayers.votes ? Object.keys(gameWithPlayers.votes).length : 0,
        totalPlayers: gameWithPlayers.players.length,
      });

      // Check if voting is complete and handle game end
      if (gameWithPlayers.state === 'RESULTS') {
        // ✅ FIXED: Broadcast with correct signature (3 parameters)
        ConnectionHandler.broadcastToRoom(roomId, 'game_ended', {
          results: {
            winner: gameWithPlayers.winner,
            correctWord: gameWithPlayers.currentWord,
            imposterId: gameWithPlayers.imposterId,
            votes: gameWithPlayers.votes || {},
          },
          gameState: gameWithPlayers.state,
        });
      }

      logger.gameEvent('Vote submitted', roomId, playerId, {
        targetPlayerId: data.targetPlayerId,
        gameState: gameWithPlayers.state,
      });

    } catch (error) {
      console.error('❌ Error submitting vote:', error);
      logger.error('Failed to submit vote', { error, data, socketId: socket.id });
      socket.emit('error', {
        message: 'Failed to submit vote',
        code: 'SUBMIT_VOTE_FAILED'
      });
    }
  }

  /**
   * Handle next round
   */
  private async handleNextRound(socket: Socket, data: { roomId?: string }): Promise<void> {
    try {
      const roomId = data?.roomId || socket.data.roomId;
      const playerId = socket.data.playerId;

      if (!roomId || !playerId) {
        socket.emit('error', {
          message: 'Not in a room',
          code: 'NOT_IN_ROOM'
        });
        return;
      }

      // ✅ FIXED: Use validateSocketPlayer method correctly
      const validation = ConnectionHandler.validateSocketPlayer(socket);
      if (!validation.success) {
        socket.emit('error', {
          message: validation.message || 'Invalid player session',
          code: 'INVALID_SESSION'
        });
        return;
      }

      console.log(`➡️ Starting next round in room ${roomId}`);

      // Start next round
      const gameWithPlayers = await GameService.nextRound(roomId);

      if (gameWithPlayers.state === 'COMPLETED') {
        // ✅ FIXED: Broadcast with correct signature (3 parameters)
        ConnectionHandler.broadcastToRoom(roomId, 'game_completed', {
          gameState: gameWithPlayers.state,
          message: 'All players have had their turn. Game completed!',
        });
      } else {
        // ✅ FIXED: Broadcast with correct signature (3 parameters)
        ConnectionHandler.broadcastToRoom(roomId, 'next_round_started', {
          gameState: gameWithPlayers.state,
          roundNumber: gameWithPlayers.roundNumber,
          wordGiverId: gameWithPlayers.wordGiverId,
        });

        // Notify new word giver
        // ✅ FIXED: Use getSocketByPlayerId with single parameter
        const wordGiverSocket = ConnectionHandler.getSocketByPlayerId(gameWithPlayers.wordGiverId!);
        if (wordGiverSocket) {
          wordGiverSocket.emit('role_assigned', {
            isWordGiver: true,
            isImposter: false,
          });
        }
      }

      logger.gameEvent('Next round started', roomId, playerId, {
        roundNumber: gameWithPlayers.roundNumber,
        gameState: gameWithPlayers.state,
      });

    } catch (error) {
      console.error('❌ Error starting next round:', error);
      logger.error('Failed to start next round', { error, data, socketId: socket.id });
      socket.emit('error', {
        message: 'Failed to start next round',
        code: 'NEXT_ROUND_FAILED'
      });
    }
  }

  /**
   * Handle end game
   */
  private async handleEndGame(socket: Socket, data: { roomId?: string }): Promise<void> {
    try {
      const roomId = data?.roomId || socket.data.roomId;
      const playerId = socket.data.playerId;

      if (!roomId || !playerId) {
        socket.emit('error', {
          message: 'Not in a room',
          code: 'NOT_IN_ROOM'
        });
        return;
      }

      // ✅ FIXED: Use validateSocketPlayer method correctly
      const validation = ConnectionHandler.validateSocketPlayer(socket);
      if (!validation.success) {
        socket.emit('error', {
          message: validation.message || 'Invalid player session',
          code: 'INVALID_SESSION'
        });
        return;
      }

      // Verify player is host
      const player = await PlayerService.getPlayerById(playerId);
      if (!player || !player.isHost) {
        socket.emit('error', {
          message: 'Only the host can end the game',
          code: 'HOST_REQUIRED'
        });
        return;
      }

      console.log(`🛑 Host ${player.user.username} ending game in room ${roomId}`);

      // End the game
      const gameWithPlayers = await GameService.endGame(roomId);

      // ✅ FIXED: Broadcast with correct signature (3 parameters)
      ConnectionHandler.broadcastToRoom(roomId, 'game_ended', {
        gameState: gameWithPlayers.state,
        results: null,
        message: 'Game ended by host',
      });

      logger.gameEvent('Game ended by host', roomId, playerId, {
        gameState: gameWithPlayers.state,
      });

    } catch (error) {
      console.error('❌ Error ending game:', error);
      logger.error('Failed to end game', { error, data, socketId: socket.id });
      socket.emit('error', {
        message: 'Failed to end game',
        code: 'END_GAME_FAILED'
      });
    }
  }

  /**
   * Handle restart game
   */
  private async handleRestartGame(socket: Socket, data: { roomId?: string }): Promise<void> {
    try {
      const roomId = data?.roomId || socket.data.roomId;
      const playerId = socket.data.playerId;

      if (!roomId || !playerId) {
        socket.emit('error', {
          message: 'Not in a room',
          code: 'NOT_IN_ROOM'
        });
        return;
      }

      // ✅ FIXED: Use validateSocketPlayer method correctly
      const validation = ConnectionHandler.validateSocketPlayer(socket);
      if (!validation.success) {
        socket.emit('error', {
          message: validation.message || 'Invalid player session',
          code: 'INVALID_SESSION'
        });
        return;
      }

      console.log(`🔄 Restarting game in room ${roomId}`);

      // This would restart a game - implement if needed
      socket.emit('error', {
        message: 'Game restart not implemented yet',
        code: 'NOT_IMPLEMENTED'
      });

    } catch (error) {
      console.error('❌ Error restarting game:', error);
      logger.error('Failed to restart game', { error, data, socketId: socket.id });
      socket.emit('error', {
        message: 'Failed to restart game',
        code: 'RESTART_GAME_FAILED'
      });
    }
  }

  /**
   * Handle pause game
   */
  private async handlePauseGame(socket: Socket, data: { roomId?: string }): Promise<void> {
    try {
      const roomId = data?.roomId || socket.data.roomId;
      const playerId = socket.data.playerId;

      if (!roomId || !playerId) {
        socket.emit('error', {
          message: 'Not in a room',
          code: 'NOT_IN_ROOM'
        });
        return;
      }

      // ✅ FIXED: Use validateSocketPlayer method correctly
      const validation = ConnectionHandler.validateSocketPlayer(socket);
      if (!validation.success) {
        socket.emit('error', {
          message: validation.message || 'Invalid player session',
          code: 'INVALID_SESSION'
        });
        return;
      }

      console.log(`⏸️ Pausing game in room ${roomId}`);

      // This would pause a game - implement if needed
      socket.emit('error', {
        message: 'Game pause not implemented yet',
        code: 'NOT_IMPLEMENTED'
      });

    } catch (error) {
      console.error('❌ Error pausing game:', error);
      logger.error('Failed to pause game', { error, data, socketId: socket.id });
      socket.emit('error', {
        message: 'Failed to pause game',
        code: 'PAUSE_GAME_FAILED'
      });
    }
  }
}

export const GameEvents = new GameEventsClass();