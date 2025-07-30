// client/src/services/socket.ts
// Socket.io client service with TypeScript errors fixed

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

// Socket event handlers type
type SocketEventHandlers = {
  // Connection events
  connected: (data: { playerId: string; room: Room }) => void;
  disconnected: (data: { playerId: string }) => void;
  
  // Room events
  room_joined: (data: { success: boolean; room: Room; player: Player; players: Player[] }) => void;
  room_updated: (data: { room: Room; players: Player[] }) => void;
  player_joined: (data: { player: Player; room: Room }) => void;
  player_left: (data: { playerId: string; playerName: string; reason: string }) => void;
  host_changed: (data: { newHost: { id: string; name: string } }) => void;
  
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
  heartbeat_ack: () => void;
  player_typing: (data: { playerId: string; playerName: string; isTyping: boolean }) => void;
};

class SocketService {
  private socket: SocketInstance | null = null;
  private eventHandlers: Map<string, Function[]> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private connectionPromise: Promise<void> | null = null;

  /**
   * Connect to the Socket.io server with enhanced debugging
   */
  connect(serverUrl: string = 'http://localhost:3001'): Promise<void> {
    // Return existing connection promise if already connecting
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = new Promise((resolve, reject) => {
      try {
        console.log('🔄 Attempting to connect to Socket.io server:', serverUrl);
        
        // Disconnect existing connection
        if (this.socket) {
          console.log('🔌 Disconnecting existing socket connection');
          this.socket.disconnect();
          this.socket = null;
        }

        this.socket = io(serverUrl, {
          transports: ['websocket', 'polling'],
          timeout: 10000, // Reduced timeout for faster debugging
          reconnection: true,
          reconnectionAttempts: this.maxReconnectAttempts,
          reconnectionDelay: 1000,
          forceNew: true, // Force new connection
          autoConnect: true, // Auto connect immediately
        });

        // Debug: Log socket creation
        console.log('🔧 Socket.io client created with options:', {
          url: serverUrl,
          transports: ['websocket', 'polling'],
          timeout: 10000,
        });

        // Connection success
        this.socket.on('connect', () => {
          console.log('✅ Successfully connected to Socket.io server');
          console.log('🔗 Socket ID:', this.socket?.id);
          console.log('🚚 Transport:', this.socket?.io?.engine?.transport?.name);
          
          this.reconnectAttempts = 0;
          this.setupHeartbeat();
          this.connectionPromise = null;
          resolve();
        });

        // Connection error
        this.socket.on('connect_error', (error: Error) => {
          console.error('❌ Socket.io connection error:', error);
          console.error('🔍 Error details:', {
            message: error.message,
            description: error.message,
            type: error.name,
          });
          this.connectionPromise = null;
          reject(error);
        });

        // Disconnection
        this.socket.on('disconnect', (reason: string) => {
          console.log('📴 Disconnected from Socket.io server:', reason);
          console.log('🔍 Disconnect reason details:', reason);
          this.cleanup();
          
          // Emit disconnect event to handlers
          this.emitToHandlers('disconnected', { reason });
        });

        // Reconnection attempts
        this.socket.on('reconnect_attempt', (attemptNumber: number) => {
          console.log(`🔄 Socket.io reconnection attempt ${attemptNumber}/${this.maxReconnectAttempts}`);
          this.reconnectAttempts = attemptNumber;
        });

        // Successful reconnection
        this.socket.on('reconnect', (attemptNumber: number) => {
          console.log(`✅ Socket.io reconnected after ${attemptNumber} attempts`);
          console.log('🔗 New Socket ID:', this.socket?.id);
          this.reconnectAttempts = 0;
          this.setupHeartbeat();
        });

        // Failed to reconnect
        this.socket.on('reconnect_failed', () => {
          console.error('❌ Socket.io failed to reconnect after maximum attempts');
        });

        // Setup default event handlers
        this.setupDefaultHandlers();

        // Debug: Log transport changes
        this.socket.on('upgrade', () => {
          console.log('🚀 Socket.io transport upgraded to:', this.socket?.io?.engine?.transport?.name);
        });

        this.socket.on('upgradeError', (error: Error) => {
          console.error('⚠️ Socket.io transport upgrade error:', error);
        });

      } catch (error) {
        console.error('💥 Socket.io setup error:', error);
        this.connectionPromise = null;
        reject(error);
      }
    });

    return this.connectionPromise;
  }

  /**
   * Disconnect from the server
   */
  disconnect(): void {
    console.log('🔌 Manually disconnecting Socket.io client');
    if (this.socket) {
      this.socket.disconnect();
      this.cleanup();
    }
    this.connectionPromise = null;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    const connected = this.socket?.connected || false;
    console.log('🔍 Socket connection status:', connected ? 'CONNECTED' : 'DISCONNECTED');
    return connected;
  }

  /**
   * Get detailed connection info for debugging
   */
  getDetailedConnectionInfo() {
    const info = {
      connected: this.socket?.connected || false,
      socketId: this.socket?.id || null,
      transport: this.socket?.io?.engine?.transport?.name || null,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
      hasSocket: !!this.socket,
      readyState: this.socket?.io?.engine?.readyState || null,
    };
    console.log('📊 Detailed Socket.io connection info:', info);
    return info;
  }

  /**
   * Test connection with detailed logging
   */
  testConnection(): void {
    console.log('🧪 Testing Socket.io connection...');
    
    if (!this.socket) {
      console.error('❌ No socket instance found');
      return;
    }

    const info = this.getDetailedConnectionInfo();
    
    if (this.socket.connected) {
      console.log('✅ Socket.io connection test: SUCCESS');
      
      // Test emit
      this.socket.emit('test', { message: 'Test from client', timestamp: new Date().toISOString() });
      console.log('📤 Test emit sent to server');
    } else {
      console.error('❌ Socket.io connection test: FAILED - Not connected');
    }
  }

  /**
   * Emit an event to the server
   */
  emit(event: string, data?: any): void {
    if (this.socket && this.socket.connected) {
      console.log(`📤 Emitting event '${event}':`, data);
      this.socket.emit(event, data);
    } else {
      console.warn(`⚠️ Cannot emit event '${event}': Socket not connected`);
      console.log('🔍 Current connection status:', this.getDetailedConnectionInfo());
    }
  }

  /**
   * Listen for an event from the server - FIXED TypeScript error
   */
  on<K extends keyof SocketEventHandlers>(
    event: K, 
    handler: SocketEventHandlers[K]
  ): void {
    console.log(`👂 Setting up listener for event: '${event}'`);
    
    if (!this.eventHandlers.has(event as string)) {
      this.eventHandlers.set(event as string, []);
    }
    
    this.eventHandlers.get(event as string)!.push(handler);

    // Also register with socket if connected
    if (this.socket) {
      this.socket.on(event as string, (data: any) => {
        console.log(`📥 Received event '${event}':`, data);
        // Fixed: Call handler with proper typing
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

  startVoting(gameId: string): void {
    console.log('🗳️ Starting voting:', gameId);
    this.emit('start_voting', { gameId });
  }

  submitVote(gameId: string, votedFor: string): void {
    console.log('🗳️ Submitting vote:', { gameId, votedFor });
    this.emit('submit_vote', { gameId, votedFor });
  }

  nextRound(gameId: string): void {
    console.log('⏭️ Next round:', gameId);
    this.emit('next_round', { gameId });
  }

  endGame(gameId: string): void {
    console.log('🏁 Ending game:', gameId);
    this.emit('end_game', { gameId });
  }

  getGameState(roomId: string): void {
    console.log('📊 Getting game state:', roomId);
    this.emit('get_game_state', { roomId });
  }

  /**
   * Utility methods
   */
  setPlayerTyping(roomId: string, isTyping: boolean): void {
    this.emit('player_typing', { roomId, isTyping });
  }

  /**
   * Private methods
   */
  private setupDefaultHandlers(): void {
    if (!this.socket) return;

    console.log('⚙️ Setting up default Socket.io event handlers');

    // Handle heartbeat
    this.socket.on('heartbeat', () => {
      console.log('💓 Heartbeat received from server');
      this.socket?.emit('heartbeat_ack');
    });

    // Handle errors
    this.socket.on('error', (data: any) => {
      console.error('🚨 Socket.io server error:', data);
    });

    // Handle all events for debugging
    this.socket.onAny((eventName: string, data: any) => {
      console.log(`📥 Socket.io event received: '${eventName}'`, data);
    });
  }

  private setupHeartbeat(): void {
    this.cleanup(); // Clear existing heartbeat
    
    console.log('💓 Setting up heartbeat interval');
    this.heartbeatInterval = setInterval(() => {
      if (this.socket && this.socket.connected) {
        this.socket.emit('heartbeat');
        console.log('💓 Heartbeat sent to server');
      }
    }, 30000); // Every 30 seconds
  }

  private cleanup(): void {
    if (this.heartbeatInterval) {
      console.log('🧹 Cleaning up heartbeat interval');
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private emitToHandlers(event: string, data: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      console.log(`📢 Emitting to ${handlers.length} handlers for event: '${event}'`);
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`❌ Error in event handler for '${event}':`, error);
        }
      });
    }
  }
}

// Export singleton instance
export const socketService = new SocketService();
export default socketService;

// Export types for use in components
export type { Room, Player, GamePlayer, Game, GameResults, SocketEventHandlers };