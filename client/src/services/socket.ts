// client/src/services/socket.ts
// Socket.io client service with complete TypeScript typing - FIXED VERSION

import io from 'socket.io-client';

// Define Socket type manually to avoid import issues
type SocketInstance = typeof io extends (...args: any[]) => infer R ? R : any;

// Basic types for the client
interface Room {
  id: string;
  code: string;
  name?: string;
  isPublic: boolean;
  maxPlayers: number;
  themeMode: boolean;
  isActive: boolean;
  playerCount: number;
  createdAt: string;
  updatedAt: string;
}

interface Player {
  id: string;
  name: string;
  isHost: boolean;
  isOnline: boolean;
  joinedAt: string;
}

interface GamePlayer extends Player {
  isWordGiver?: boolean;
  isImposter?: boolean;
  hasVoted?: boolean;
}

interface Game {
  id: string;
  state: string;
  roundNumber: number;
  wordGiverId?: string;
}

interface GameResults {
  winner: 'players' | 'imposter';
  correctWord?: string;
  imposterId: string;
  votes: Record<string, string>;
}

// Socket event handlers type - COMPLETE FIXED VERSION
type SocketEventHandlers = {
  // Connection events
  connected: (data: { playerId: string; room: Room }) => void;
  disconnected: (data: { playerId: string }) => void;
  
  // Room events
  room_joined: (data: { success: boolean; room: Room; player: Player; players: Player[] }) => void;
  room_updated: (data: { room: Room; players: Player[] }) => void;
  player_joined: (data: { player: Player; room: Room }) => void;
  player_left: (data: { playerId: string; playerName: string; reason: string }) => void;
  room_left: (data: { success: boolean; message: string }) => void; // ✅ FIXED: Added missing event
  host_changed: (data: { newHost: { id: string; name: string }; message: string }) => void; // ✅ FIXED: Added message property
  public_rooms_updated: () => void; // ✅ FIXED: Added missing event
  
  // Game events
  game_started: (data: { game: Game; players: GamePlayer[] }) => void;
  game_state_changed: (data: { gameState: string; currentWord?: string; wordGiverId?: string }) => void;
  word_revealed: (data: { word: string; isImposter: boolean; gameState: string }) => void;
  word_submitted: (data: { wordGiverId: string; gameState: string }) => void;
  voting_started: (data: { gameState: string; timeLimit: number; players: Player[] }) => void;
  vote_submitted: (data: { playerId: string; hasVoted: boolean; totalVotes: number; totalPlayers: number }) => void;
  game_ended: (data: { results: GameResults; gameState: string }) => void;
  next_round_started: (data: { gameState: string; roundNumber: number; wordGiverId: string }) => void;
  game_completed: (data: { gameState: string; message: string }) => void;
  role_assigned: (data: { isWordGiver?: boolean; isImposter?: boolean }) => void;
  
  // General events
  error: (data: { message: string; code?: string }) => void;
  heartbeat: () => void;
  player_typing: (data: { playerId: string; playerName: string; isTyping: boolean }) => void;
};

class SocketService {
  private socket: SocketInstance | null = null;
  private eventHandlers: Map<string, Function[]> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  /**
   * Connect to the Socket.io server
   */
  async connect(serverUrl: string = 'http://localhost:3001'): Promise<void> {
    try {
      console.log(`🔌 Connecting to Socket.io server: ${serverUrl}`);
      
      this.socket = io(serverUrl, {
        transports: ['websocket', 'polling'],
        timeout: 20000,
        forceNew: true,
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: this.reconnectDelay,
      });

      // Set up connection event handlers
      this.setupConnectionHandlers();

      // Re-register all event handlers
      this.reregisterEventHandlers();

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 20000);

        this.socket!.on('connect', () => {
          clearTimeout(timeout);
          console.log('✅ Connected to Socket.io server');
          this.reconnectAttempts = 0;
          resolve();
        });

        this.socket!.on('connect_error', (error) => {
          clearTimeout(timeout);
          console.error('❌ Socket.io connection error:', error);
          reject(error);
        });
      });

    } catch (error) {
      console.error('❌ Failed to create socket connection:', error);
      throw error;
    }
  }

  /**
   * Set up connection event handlers
   */
  private setupConnectionHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('🔗 Socket connected');
      this.reconnectAttempts = 0;
    });

    this.socket.on('disconnect', (reason) => {
      console.log('🔌 Socket disconnected:', reason);
      
      // Emit disconnected event to listeners
      this.eventHandlers.get('disconnected')?.forEach(handler => {
        handler({ playerId: 'unknown' });
      });
    });

    this.socket.on('connect_error', (error) => {
      console.error('🚨 Socket connection error:', error);
      this.reconnectAttempts++;
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('❌ Max reconnection attempts reached');
        this.eventHandlers.get('error')?.forEach(handler => {
          handler({ message: 'Connection failed after multiple attempts', code: 'MAX_RECONNECT_ATTEMPTS' });
        });
      }
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log(`🔄 Socket reconnected after ${attemptNumber} attempts`);
      this.reconnectAttempts = 0;
    });

    this.socket.on('reconnect_error', (error) => {
      console.error('🔄 Socket reconnection error:', error);
    });
  }

  /**
   * Re-register all event handlers after reconnection
   */
  private reregisterEventHandlers(): void {
    if (!this.socket) return;

    for (const [event, handlers] of this.eventHandlers.entries()) {
      handlers.forEach(handler => {
        this.socket!.on(event, (data: any) => {
          console.log(`📥 Received event '${event}':`, data);
          handler(data);
        });
      });
    }
  }

  /**
   * Disconnect from the server
   */
  disconnect(): void {
    if (this.socket) {
      console.log('🔌 Disconnecting from Socket.io server');
      this.socket.disconnect();
      this.socket = null;
    }
    this.eventHandlers.clear();
  }

  /**
   * Check if socket is connected
   */
  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  /**
   * Get detailed connection information
   */
  getDetailedConnectionInfo(): object {
    return {
      connected: this.isConnected(),
      socketId: this.socket?.id || null,
      reconnectAttempts: this.reconnectAttempts,
      hasSocket: !!this.socket,
      eventHandlersCount: this.eventHandlers.size,
    };
  }

  /**
   * Emit an event to the server
   */
  emit(event: string, data: any): void {
    if (this.socket && this.socket.connected) {
      console.log(`📤 Emitting event '${event}':`, data);
      this.socket.emit(event, data);
    } else {
      console.warn(`⚠️ Cannot emit event '${event}': Socket not connected`);
      console.log('🔍 Current connection status:', this.getDetailedConnectionInfo());
    }
  }

  /**
   * Listen for an event from the server - FIXED TypeScript typing
   */
  on<K extends keyof SocketEventHandlers>(
    event: K, 
    handler: SocketEventHandlers[K]
  ): void {
    console.log(`👂 Setting up listener for event: '${event}'`);
    
    if (!this.eventHandlers.has(event as string)) {
      this.eventHandlers.set(event as string, []);
    }
    
    this.eventHandlers.get(event as string)!.push(handler as Function);

    // Also register with socket if connected
    if (this.socket) {
      this.socket.on(event as string, (data: any) => {
        console.log(`📥 Received event '${event}':`, data);
        // ✅ FIXED: Proper TypeScript typing for handler calls
        (handler as Function)(data);
      });
    }
  }

  /**
   * Remove event listener
   */
  off(event: string, handler?: Function): void {
    console.log(`🚫 Removing listener for event: '${event}'`);
    
    if (handler) {
      const handlers = this.eventHandlers.get(event);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      }
      
      if (this.socket) {
        this.socket.off(event, handler as any);
      }
    } else {
      // Remove all handlers for this event
      this.eventHandlers.delete(event);
      if (this.socket) {
        this.socket.off(event);
      }
    }
  }

  /**
   * Room management methods
   */
  joinRoom(roomCode: string, playerName: string): void {
    console.log('🚪 Joining room:', { roomCode, playerName });
    this.emit('join_room', { roomCode, playerName });
  }

  leaveRoom(roomId: string): void {
    console.log('🚪 Leaving room:', roomId);
    this.emit('leave_room', { roomId });
  }

  updateRoom(roomId: string, updates: any): void {
    console.log('🔄 Updating room:', roomId, updates);
    this.emit('update_room', { roomId, ...updates });
  }

  getPublicRooms(): void {
    console.log('📋 Getting public rooms');
    this.emit('get_public_rooms');
  }

  getRoomDetails(roomId: string): void {
    console.log('📋 Getting room details:', roomId);
    this.emit('get_room_details', { roomId });
  }

  /**
   * Game management methods
   */
  startGame(roomId: string): void {
    console.log('🎮 Starting game in room:', roomId);
    this.emit('start_game', { roomId });
  }

  submitWord(gameId: string, word: string): void {
    console.log('📝 Submitting word:', { gameId, word });
    this.emit('submit_word', { gameId, word });
  }

  submitVote(gameId: string, votedFor: string): void {
    console.log('🗳️ Submitting vote:', { gameId, votedFor });
    this.emit('submit_vote', { gameId, votedFor });
  }

  nextRound(gameId: string): void {
    console.log('➡️ Starting next round:', gameId);
    this.emit('next_round', { gameId });
  }

  /**
   * General utility methods
   */
  sendHeartbeat(): void {
    this.emit('heartbeat', {});
  }

  setPlayerTyping(roomId: string, isTyping: boolean): void {
    this.emit('player_typing', { roomId, isTyping });
  }
}

// Create and export singleton instance
const socketService = new SocketService();
export default socketService;