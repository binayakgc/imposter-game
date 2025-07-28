// shared/types/Socket.ts
// Socket.io event types for real-time communication

import { Player, PlayerInGame } from './Player';
import { Game, GameState, GameResults } from './Game';
import { Room } from './Room';

// Client to Server Events
export interface ClientToServerEvents {
  // Room events
  join_room: (data: { roomCode: string; playerName: string }) => void;
  leave_room: (data: { roomId: string }) => void;
  
  // Game events
  start_game: (data: { roomId: string }) => void;
  submit_word: (data: { gameId: string; word: string }) => void;
  submit_vote: (data: { gameId: string; votedFor: string }) => void;
  next_round: (data: { gameId: string }) => void;
  
  // General events
  player_typing: (data: { roomId: string; isTyping: boolean }) => void;
  heartbeat: () => void;
}

// Server to Client Events
export interface ServerToClientEvents {
  // Connection events
  connected: (data: { playerId: string; room: Room }) => void;
  disconnected: (data: { playerId: string }) => void;
  
  // Room events
  room_updated: (data: { room: Room; players: Player[] }) => void;
  player_joined: (data: { player: Player }) => void;
  player_left: (data: { playerId: string; playerName: string }) => void;
  
  // Game events
  game_started: (data: { game: Game; players: PlayerInGame[] }) => void;
  game_state_changed: (data: { 
    gameState: GameState; 
    currentWord?: string;
    wordGiverId?: string;
    timeRemaining?: number;
  }) => void;
  word_submitted: (data: { wordGiverId: string }) => void;
  voting_started: (data: { timeLimit: number }) => void;
  vote_submitted: (data: { playerId: string; hasVoted: boolean }) => void;
  game_ended: (data: { results: GameResults }) => void;
  
  // Error events
  error: (data: { message: string; code?: string }) => void;
  
  // General events
  player_typing: (data: { playerId: string; playerName: string; isTyping: boolean }) => void;
}

// Socket Data (attached to each socket connection)
export interface SocketData {
  playerId?: string;
  roomId?: string;
  playerName?: string;
}

// Common event payloads
export interface RoomEventData {
  roomId: string;
  playerId: string;
}

export interface GameEventData extends RoomEventData {
  gameId: string;
}