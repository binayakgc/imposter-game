// shared/types/Game.ts
// Game-related types for the Imposter game

export enum GameState {
  WAITING = 'WAITING',
  WORD_SUBMISSION = 'WORD_SUBMISSION',
  DISCUSSION = 'DISCUSSION',
  VOTING = 'VOTING',
  RESULTS = 'RESULTS',
  COMPLETED = 'COMPLETED'
}

export interface Game {
  id: string;
  roomId: string;
  currentWord?: string;
  wordGiverId?: string;
  imposterId?: string;
  state: GameState;
  roundNumber: number;
  wordGiverQueue: string[]; // Player IDs in rotation order
  votes?: Record<string, string>; // voter ID -> voted for ID
  winner?: string; // 'players' | 'imposter' | specific player ID
  createdAt: Date;
  completedAt?: Date;
  timeLimit?: number;
}

export interface GameWithPlayers extends Game {
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

export interface StartGameRequest {
  roomId: string;
}

export interface StartGameResponse {
  success: boolean;
  game?: GameWithPlayers;
  error?: string;
}

export interface SubmitWordRequest {
  gameId: string;
  word: string;
}

export interface SubmitWordResponse {
  success: boolean;
  error?: string;
}

export interface SubmitVoteRequest {
  gameId: string;
  votedFor: string; // Player ID
}

export interface SubmitVoteResponse {
  success: boolean;
  error?: string;
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