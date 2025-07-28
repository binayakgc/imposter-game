// shared/types/Player.ts
// Player-related types for the Imposter game

export interface Player {
  id: string;
  name: string;
  roomId: string;
  socketId?: string;
  isHost: boolean;
  isOnline: boolean;
  joinedAt: Date;
  lastSeen: Date;
}

export interface PlayerInGame extends Player {
  isImposter?: boolean;
  isWordGiver?: boolean;
  hasVoted?: boolean;
  votedFor?: string; // Player ID they voted for
}

export interface UpdatePlayerRequest {
  name?: string;
  isOnline?: boolean;
}

export interface UpdatePlayerResponse {
  success: boolean;
  player?: Player;
  error?: string;
}

export interface PlayerStats {
  gamesPlayed: number;
  gamesWon: number;
  timesImposter: number;
  imposterWins: number;
  winRate: number; // calculated field
}