// shared/types/Socket.ts
// Socket.io event types for real-time communication - UPDATED for User schema

import { SocketPlayer, PlayerInGame } from './Player';
import { Game, GameState, GameResults } from './Game';
import { Room } from './Room';

// Client to Server Events
export interface ClientToServerEvents {
  // Room events
  join_room: (data: { roomCode: string; playerName?: string }) => void;
  leave_room: (data: { roomId: string }) => void;
  
  // Game events
  start_game: (data: { roomId: string }) => void;
  submit_word: (data: { gameId: string; word: string }) => void;
  submit_vote: (data: { gameId: string; votedFor: string }) => void;
  next_round: (data: { gameId: string }) => void;
  
  // General events
  player_typing: (data: { roomId: string; isTyping: boolean }) => void;
  heartbeat: () => void;
  get_public_rooms: () => void;
  get_room_details: (data: { roomId: string }) => void;
}

// Server to Client Events - ✅ UPDATED to use flexible player types
export interface ServerToClientEvents {
  // Connection events
  connected: (data: { playerId: string; room: Room }) => void;
  disconnected: (data: { playerId: string }) => void;
  
  // Room events - ✅ UPDATED: Use SocketPlayer for flexibility
  room_updated: (data: { room: Room; players: SocketPlayer[] }) => void;
  player_joined: (data: { player: SocketPlayer; room: Room }) => void;
  player_left: (data: { playerId: string; playerName: string; reason: string }) => void;
  room_joined: (data: { 
    success: boolean; 
    room: Room; 
    player: SocketPlayer; 
    players: SocketPlayer[] 
  }) => void;
  room_left: (data: { success: boolean; message: string }) => void;
  host_changed: (data: { newHost: SocketPlayer; message: string }) => void;
  
  // Public rooms
  public_rooms_updated: () => void;
  public_rooms: (data: { success: boolean; rooms: Room[] }) => void;
  room_details: (data: { 
    success: boolean; 
    room: Room; 
    players: SocketPlayer[]; 
    currentGame?: Game 
  }) => void;
  
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

// Socket Data (attached to each socket connection) - ✅ UPDATED for User schema
export interface SocketData {
  playerId?: string;
  roomId?: string;
  userId?: string;
  playerName?: string;
  lastActivity?: Date;
}

// Common event payloads
export interface RoomEventData {
  roomId: string;
  playerId: string;
}

export interface GameEventData extends RoomEventData {
  gameId: string;
}