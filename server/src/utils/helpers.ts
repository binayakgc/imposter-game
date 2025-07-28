// server/src/utils/helpers.ts
// Utility functions for the Imposter game

// Room code generation
const ROOM_CODE_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const ROOM_CODE_LENGTH = 6;

/**
 * Generate a unique room code
 */
export const generateRoomCode = (): string => {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    const randomIndex = Math.floor(Math.random() * ROOM_CODE_CHARACTERS.length);
    code += ROOM_CODE_CHARACTERS[randomIndex];
  }
  return code;
};

/**
 * Validate room code format
 */
export const isValidRoomCode = (code: string): boolean => {
  if (!code || code.length !== ROOM_CODE_LENGTH) {
    return false;
  }
  
  return code.split('').every(char => ROOM_CODE_CHARACTERS.includes(char));
};

/**
 * Validate player name
 */
export const isValidPlayerName = (name: string): boolean => {
  if (!name || typeof name !== 'string') {
    return false;
  }
  
  const trimmedName = name.trim();
  return trimmedName.length >= 2 && trimmedName.length <= 20;
};

/**
 * Shuffle array in place (Fisher-Yates algorithm)
 */
export const shuffleArray = <T>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

/**
 * Get random element from array
 */
export const getRandomElement = <T>(array: T[]): T | undefined => {
  if (array.length === 0) return undefined;
  const randomIndex = Math.floor(Math.random() * array.length);
  return array[randomIndex];
};

/**
 * Remove element from array
 */
export const removeFromArray = <T>(array: T[], element: T): T[] => {
  return array.filter(item => item !== element);
};

/**
 * Check if array contains duplicates
 */
export const hasDuplicates = <T>(array: T[]): boolean => {
  return new Set(array).size !== array.length;
};

/**
 * Create player rotation queue (excludes current word giver from next turn)
 */
export const createRotationQueue = (playerIds: string[], currentWordGiverId?: string): string[] => {
  let availablePlayers = [...playerIds];
  
  // Remove current word giver from immediate next turn
  if (currentWordGiverId) {
    availablePlayers = removeFromArray(availablePlayers, currentWordGiverId);
  }
  
  // Shuffle the available players
  const shuffledPlayers = shuffleArray(availablePlayers);
  
  // Add the current word giver back at the end if they exist
  if (currentWordGiverId) {
    shuffledPlayers.push(currentWordGiverId);
  }
  
  return shuffledPlayers;
};

/**
 * Get next player in rotation queue
 */
export const getNextWordGiver = (queue: string[]): { nextPlayer: string | null; newQueue: string[] } => {
  if (queue.length === 0) {
    return { nextPlayer: null, newQueue: [] };
  }
  
  const nextPlayer = queue[0];
  const newQueue = queue.slice(1);
  
  return { nextPlayer, newQueue };
};

/**
 * Calculate game statistics
 */
export const calculateWinRate = (gamesWon: number, gamesPlayed: number): number => {
  if (gamesPlayed === 0) return 0;
  return Math.round((gamesWon / gamesPlayed) * 100) / 100;
};

/**
 * Validate room settings
 */
export const validateRoomSettings = (settings: {
  maxPlayers?: number;
  themeMode?: boolean;
  timeLimit?: number;
}): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (settings.maxPlayers !== undefined) {
    if (settings.maxPlayers < 4 || settings.maxPlayers > 10) {
      errors.push('Maximum players must be between 4 and 10');
    }
  }
  
  if (settings.timeLimit !== undefined) {
    if (settings.timeLimit < 1 || settings.timeLimit > 60) {
      errors.push('Time limit must be between 1 and 60 minutes');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Check if minimum players requirement is met
 */
export const hasMinimumPlayers = (playerCount: number): boolean => {
  return playerCount >= 4;
};

/**
 * Format time duration in seconds to human readable format
 */
export const formatDuration = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes === 0) {
    return `${remainingSeconds}s`;
  }
  
  return `${minutes}m ${remainingSeconds}s`;
};

/**
 * Sanitize string for database storage
 */
export const sanitizeString = (input: string): string => {
  return input.trim().replace(/[<>]/g, '');
};

/**
 * Generate unique ID (alternative to cuid if needed)
 */
export const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};