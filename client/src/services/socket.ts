// client/src/services/socket.ts
// COMPLETE FIXED VERSION - Resolves all emit method signature issues

import io from 'socket.io-client';

// Define Socket type manually to avoid import issues
type SocketInstance = typeof io extends (...args: any[]) => infer R ? R : any;

// Basic types for the client (updated to match User auth schema)
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
  userId: string;
  isHost: boolean;
  isOnline: boolean;
  joinedAt: string;
  user: {
    id: string;
    username: string;
    avatar?: string | null;
  };
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
  room_left: (data: { success: boolean; message: string }) => void;
  host_changed: (data: { newHost: { id: string; name: string }; message: string }) => void;
  public_rooms_updated: () => void;
  public_rooms: (data: { success: boolean; rooms: Room[] }) => void;
  room_details: (data: { success: boolean; room: Room; players: Player[]; currentGame?: Game }) => void;
  
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
  success: (data: { message: string }) => void;
};

class SocketService {
  private socket: SocketInstance | null = null;
  private eventHandlers: Map<string, Function[]> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  /**
   * Connect to the Socket.io server
   */
  connect(serverUrl: string = 'http://localhost:3001', token?: string): void {
    console.log('🔌 Connecting to Socket.io server at:', serverUrl);
    
    this.socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      upgrade: true,
      rememberUpgrade: true,
      timeout: 10000,
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 2000,
      query: token ? { token } : undefined,
    });

    this.setupConnectionEvents();
  }

  /**
   * Setup connection event handlers
   */
  private setupConnectionEvents(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('✅ Socket connected successfully');
      console.log('🔗 Socket ID:', this.socket?.id);
      this.reconnectAttempts = 0;
      this.reregisterEventHandlers();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('❌ Socket disconnected:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('🔥 Socket connection error:', error);
      this.reconnectAttempts++;
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('💀 Max reconnection attempts reached');
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
  emit(event: string, data?: any): void {
    if (this.socket && this.socket.connected) {
      console.log(`📤 Emitting event '${event}':`, data);
      // ✅ FIXED: Handle both cases - with and without data
      if (data !== undefined) {
        this.socket.emit(event, data);
      } else {
        this.socket.emit(event);  // ✅ FIXED: Emit without data parameter
      }
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
        (handler as Function)(data);
      });
    }
  }

  /**
   * Remove event listener
   */
  off(event: string, handler?: Function): void {
    if (this.socket) {
      if (handler) {
        this.socket.off(event, handler as any);
      } else {
        this.socket.off(event);
      }
    }

    if (handler) {
      const handlers = this.eventHandlers.get(event);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      }
    } else {
      this.eventHandlers.delete(event);
    }
  }

  // ✅ FIXED: Room management methods with proper data handling
  createRoom(roomData: { 
    name?: string; 
    isPublic?: boolean; 
    maxPlayers?: number; 
    themeMode?: boolean;
  }): void {
    this.emit('create_room', roomData);
  }

  joinRoom(roomCode: string, userId: string): void {  // ✅ FIXED: Use userId instead of playerName
    this.emit('join_room', { roomCode, userId });
  }

  leaveRoom(roomId: string): void {
    this.emit('leave_room', { roomId });
  }

  updateRoom(roomId: string, updates: { 
    name?: string; 
    maxPlayers?: number; 
    themeMode?: boolean;
    isPublic?: boolean;
  }): void {
    this.emit('update_room', { roomId, ...updates });
  }

  getPublicRooms(): void {
    this.emit('get_public_rooms');  // ✅ FIXED: No data needed
  }

  getRoomDetails(roomId: string): void {
    this.emit('get_room_details', { roomId });
  }

  // ✅ FIXED: Game management methods
  startGame(roomId: string): void {
    this.emit('start_game', { roomId });
  }

  submitWord(roomId: string, word: string): void {
    this.emit('submit_word', { roomId, word });
  }

  submitVote(roomId: string, targetPlayerId: string): void {
    this.emit('submit_vote', { roomId, targetPlayerId });
  }

  nextRound(roomId: string): void {
    this.emit('next_round', { roomId });
  }

  endGame(roomId: string): void {
    this.emit('end_game', { roomId });
  }

  // ✅ FIXED: Authentication methods
  authenticate(token: string): void {
    this.emit('authenticate', { token });
  }

  // ✅ FIXED: Player actions
  setPlayerReady(roomId: string, isReady: boolean): void {
    this.emit('player_ready', { roomId, isReady });
  }

  sendChatMessage(roomId: string, message: string): void {
    this.emit('chat_message', { roomId, message });
  }

  // ✅ FIXED: Additional utility methods
  ping(): void {
    this.emit('ping');  // No data needed
  }

  requestRoomUpdate(roomId: string): void {
    this.emit('request_room_update', { roomId });
  }

  updatePlayerStatus(roomId: string, status: 'online' | 'away' | 'busy'): void {
    this.emit('update_player_status', { roomId, status });
  }

  // ✅ FIXED: Host-only actions
  kickPlayer(roomId: string, playerId: string): void {
    this.emit('kick_player', { roomId, playerId });
  }

  transferHost(roomId: string, newHostId: string): void {
    this.emit('transfer_host', { roomId, newHostId });
  }

  changeGameSettings(roomId: string, settings: {
    timeLimit?: number;
    maxRounds?: number;
    difficulty?: string;
  }): void {
    this.emit('change_game_settings', { roomId, ...settings });
  }

  // ✅ FIXED: Connection management
  heartbeat(): void {
    if (this.isConnected()) {
      this.emit('heartbeat', { timestamp: Date.now() });
    }
  }

  requestReconnect(): void {
    if (this.socket && !this.socket.connected) {
      console.log('🔄 Requesting manual reconnection...');
      this.socket.connect();
    }
  }

  // ✅ FIXED: Error recovery
  reportError(error: string, context?: any): void {
    this.emit('client_error', { 
      error, 
      context,
      timestamp: Date.now(),
      userAgent: navigator.userAgent
    });
  }
}

// Export singleton instance
export const socketService = new SocketService();
export default socketService;