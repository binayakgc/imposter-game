// shared/constants/index.ts
// Shared constants for the Imposter game

// Game Configuration
export const GAME_CONFIG = {
  MIN_PLAYERS: 4,
  MAX_PLAYERS: 10,
  DEFAULT_MAX_PLAYERS: 8,
  ROOM_CODE_LENGTH: 6,
  DEFAULT_TIME_LIMIT: 10, // minutes
  DISCUSSION_TIME: 300, // 5 minutes in seconds
  VOTING_TIME: 120, // 2 minutes in seconds
} as const;

// Player Configuration
export const PLAYER_CONFIG = {
  MIN_NAME_LENGTH: 2,
  MAX_NAME_LENGTH: 20,
  HEARTBEAT_INTERVAL: 30000, // 30 seconds
  DISCONNECT_TIMEOUT: 60000, // 1 minute
} as const;

// Room Configuration
export const ROOM_CONFIG = {
  MIN_NAME_LENGTH: 3,
  MAX_NAME_LENGTH: 30,
  CODE_CHARACTERS: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  MAX_INACTIVE_TIME: 3600000, // 1 hour in milliseconds
} as const;

// Socket Events (for consistency)
export const SOCKET_EVENTS = {
  // Connection
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',
  
  // Room events
  JOIN_ROOM: 'join_room',
  LEAVE_ROOM: 'leave_room',
  ROOM_UPDATED: 'room_updated',
  PLAYER_JOINED: 'player_joined',
  PLAYER_LEFT: 'player_left',
  
  // Game events
  START_GAME: 'start_game',
  GAME_STARTED: 'game_started',
  GAME_STATE_CHANGED: 'game_state_changed',
  SUBMIT_WORD: 'submit_word',
  WORD_SUBMITTED: 'word_submitted',
  SUBMIT_VOTE: 'submit_vote',
  VOTE_SUBMITTED: 'vote_submitted',
  VOTING_STARTED: 'voting_started',
  GAME_ENDED: 'game_ended',
  NEXT_ROUND: 'next_round',
  
  // General
  ERROR: 'error',
  HEARTBEAT: 'heartbeat',
  PLAYER_TYPING: 'player_typing',
} as const;

// HTTP Status Codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
} as const;

// Error Codes
export const ERROR_CODES = {
  // Room errors
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_FULL: 'ROOM_FULL',
  ROOM_INACTIVE: 'ROOM_INACTIVE',
  INVALID_ROOM_CODE: 'INVALID_ROOM_CODE',
  
  // Player errors
  PLAYER_NOT_FOUND: 'PLAYER_NOT_FOUND',
  PLAYER_NAME_TAKEN: 'PLAYER_NAME_TAKEN',
  INVALID_PLAYER_NAME: 'INVALID_PLAYER_NAME',
  PLAYER_NOT_IN_ROOM: 'PLAYER_NOT_IN_ROOM',
  
  // Game errors
  GAME_NOT_FOUND: 'GAME_NOT_FOUND',
  GAME_NOT_STARTED: 'GAME_NOT_STARTED',
  GAME_ALREADY_STARTED: 'GAME_ALREADY_STARTED',
  NOT_ENOUGH_PLAYERS: 'NOT_ENOUGH_PLAYERS',
  INVALID_GAME_STATE: 'INVALID_GAME_STATE',
  WORD_ALREADY_SUBMITTED: 'WORD_ALREADY_SUBMITTED',
  VOTE_ALREADY_SUBMITTED: 'VOTE_ALREADY_SUBMITTED',
  NOT_WORD_GIVER: 'NOT_WORD_GIVER',
  INVALID_VOTE_TARGET: 'INVALID_VOTE_TARGET',
  
  // General errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

// Success Messages
export const SUCCESS_MESSAGES = {
  ROOM_CREATED: 'Room created successfully',
  ROOM_JOINED: 'Joined room successfully',
  GAME_STARTED: 'Game started successfully',
  WORD_SUBMITTED: 'Word submitted successfully',
  VOTE_SUBMITTED: 'Vote submitted successfully',
  PLAYER_UPDATED: 'Player updated successfully',
} as const;