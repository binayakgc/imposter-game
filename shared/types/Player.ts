// shared/types/Player.ts
// Player-related types for the Imposter game - UPDATED to match current schema

// ✅ UPDATED: Base Player interface to match current User auth schema
export interface Player {
  id: string;
  userId: string;  // ✅ UPDATED: Links to User table
  roomId: string;
  socketId?: string;
  isHost: boolean;
  isOnline: boolean;
  joinedAt: Date;
  lastSeen: Date;
}

// ✅ NEW: Player with populated user data (for API responses)
export interface PlayerWithUser extends Player {
  user: {
    id: string;
    username: string;
    email?: string | null;
    avatar?: string | null;
  };
}

// ✅ NEW: Flattened player interface for frontend (combines user data)
export interface PlayerFlat {
  id: string;
  userId: string;
  roomId: string;
  socketId?: string;
  isHost: boolean;
  isOnline: boolean;
  joinedAt: Date | string;
  lastSeen: Date | string;
  username: string;
  email?: string | null;
  avatar?: string | null;
}

// ✅ UPDATED: Game player extends the base with game-specific properties
export interface PlayerInGame extends PlayerFlat {
  isImposter?: boolean;
  isWordGiver?: boolean;
  hasVoted?: boolean;
  votedFor?: string; // Player ID they voted for
}

// ✅ LEGACY: Keep old interface for backward compatibility
export interface LegacyPlayer {
  id: string;
  name: string;
  roomId: string;
  socketId?: string;
  isHost: boolean;
  isOnline: boolean;
  joinedAt: Date;
  lastSeen: Date;
}

export interface UpdatePlayerRequest {
  name?: string;
  isOnline?: boolean;
}

export interface UpdatePlayerResponse {
  success: boolean;
  player?: PlayerWithUser;
  error?: string;
}

export interface PlayerStats {
  gamesPlayed: number;
  gamesWon: number;
  timesImposter: number;
  imposterWins: number;
  winRate: number; // calculated field
}

// ✅ NEW: Helper type for socket events that can handle both structures
export type SocketPlayer = PlayerFlat | PlayerWithUser | LegacyPlayer;