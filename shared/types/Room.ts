// shared/types/Room.ts
// Room-related types for the Imposter game

export interface Room {
  id: string;
  code: string;
  name?: string;
  isPublic: boolean;
  maxPlayers: number;
  themeMode: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  playerCount?: number; // Virtual field for API responses
}

export interface CreateRoomRequest {
  name?: string;
  isPublic: boolean;
  maxPlayers?: number;
  themeMode?: boolean;
}

export interface CreateRoomResponse {
  success: boolean;
  room?: Room;
  error?: string;
}

export interface JoinRoomRequest {
  roomCode: string;
  playerName: string;
}

export interface JoinRoomResponse {
  success: boolean;
  room?: Room;
  player?: {
    id: string;
    name: string;
    isHost: boolean;
  };
  error?: string;
}

export interface GetPublicRoomsResponse {
  success: boolean;
  rooms?: Room[];
  error?: string;
}

export interface RoomSettings {
  maxPlayers: number;
  themeMode: boolean;
  timeLimit?: number; // in minutes
}