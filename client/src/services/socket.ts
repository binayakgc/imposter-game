// client/src/services/socket.ts
// ENHANCED VERSION - Better reconnection and authentication

import io, { Socket } from 'socket.io-client';
import authService from './authService';

// Types
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
  username?: string;
  name?: string;
  user?: {
    id: string;
    username: string;
    avatar?: string | null;
  };
  avatar?: string | null;
  isHost: boolean;
  isOnline: boolean;
  joinedAt?: string;
}

class SocketService {
  private socket: Socket | null = null;
  private serverUrl: string = '';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectInterval = 2000; // Start with 2 seconds
  private isManuallyDisconnected = false;
  private currentRoomId: string | null = null;
  private connectionListeners: Array<(connected: boolean) => void> = [];

  /**
   * ✅ ENHANCED: Connect with authentication and better error handling
   */
  async connect(serverUrl: string): Promise<void> {
    try {
      this.serverUrl = serverUrl;
      this.isManuallyDisconnected = false;

      console.log('🔌 Connecting to socket server:', serverUrl);

      // Get authentication token
      const token = authService.getToken();
      const user = authService.getCurrentUser();

      // ✅ ENHANCED: Include auth token in connection
      this.socket = io(serverUrl, {
        auth: {
          token: token,
          userId: user?.id,
          username: user?.username,
        },
        query: {
          token: token,
        },
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: this.reconnectInterval,
        reconnectionDelayMax: 10000,
        timeout: 10000,
        forceNew: false, // ✅ Allow reusing existing connection
      });

      this.setupSocketListeners();
      this.setupReconnectionLogic();

      // Wait for connection
      await new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 10000);

        this.socket!.on('connect', () => {
          clearTimeout(timeoutId);
          console.log('✅ Socket connected:', this.socket!.id);
          this.reconnectAttempts = 0;
          this.notifyConnectionListeners(true);
          resolve();
        });

        this.socket!.on('connect_error', (error) => {
          clearTimeout(timeoutId);
          console.error('❌ Socket connection error:', error);
          reject(error);
        });
      });

    } catch (error) {
      console.error('❌ Failed to connect socket:', error);
      throw error;
    }
  }

  /**
   * ✅ ENHANCED: Setup socket listeners with better error handling
   */
  private setupSocketListeners(): void {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect', () => {
      console.log('✅ Socket connected:', this.socket!.id);
      this.reconnectAttempts = 0;
      this.notifyConnectionListeners(true);
      
      // ✅ ENHANCED: Auto-rejoin room if we were in one
      if (this.currentRoomId) {
        console.log('🔄 Auto-rejoining room after reconnection:', this.currentRoomId);
        this.rejoinCurrentRoom();
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.log('❌ Socket disconnected:', reason);
      this.notifyConnectionListeners(false);
      
      // ✅ ENHANCED: Only attempt reconnection if not manually disconnected
      if (!this.isManuallyDisconnected && reason !== 'io client disconnect') {
        console.log('🔄 Will attempt to reconnect...');
      }
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log(`✅ Socket reconnected after ${attemptNumber} attempts`);
      this.reconnectAttempts = 0;
      this.notifyConnectionListeners(true);
    });

    this.socket.on('reconnect_attempt', (attemptNumber) => {
      console.log(`🔄 Reconnection attempt ${attemptNumber}/${this.maxReconnectAttempts}`);
    });

    this.socket.on('reconnect_error', (error) => {
      console.error('❌ Reconnection error:', error);
    });

    this.socket.on('reconnect_failed', () => {
      console.error('❌ Max reconnection attempts reached');
      this.notifyConnectionListeners(false);
    });

    // ✅ ENHANCED: Handle authentication events
    this.socket.on('authenticated', (data) => {
      console.log('🔐 Socket authenticated:', data);
    });

    this.socket.on('authentication_error', (error) => {
      console.error('🔐 Socket authentication error:', error);
      // Try to re-authenticate
      this.authenticateSocket();
    });

    // Room events - emit to notify components
    this.socket.on('room_joined', (data) => {
      console.log('🚪 Room joined:', data);
      if (data.room) {
        this.currentRoomId = data.room.id;
      }
    });

    this.socket.on('room_left', (data) => {
      console.log('🚪 Room left:', data);
      this.currentRoomId = null;
    });

    // ✅ ENHANCED: Handle public rooms updates
    this.socket.on('public_rooms_updated', (data) => {
      console.log('📡 Public rooms updated');
      // Re-emit for components to catch
      this.socket?.emit('public_rooms_updated', data);
    });

    // Error handling
    this.socket.on('error', (error) => {
      console.error('🚨 Socket error:', error);
    });
  }

  /**
   * ✅ NEW: Auto-rejoin room after reconnection
   */
  private async rejoinCurrentRoom(): Promise<void> {
    if (!this.currentRoomId || !this.socket) return;

    try {
      const user = authService.getCurrentUser();
      if (!user) {
        console.log('❌ No user found for room rejoin');
        this.currentRoomId = null;
        return;
      }

      console.log('🔄 Attempting to rejoin room:', this.currentRoomId);
      
      // Try to get room details first
      this.socket.emit('get_room_details', { roomId: this.currentRoomId });
      
    } catch (error) {
      console.error('❌ Failed to rejoin room:', error);
      this.currentRoomId = null;
    }
  }

  /**
   * ✅ NEW: Authenticate socket with current user
   */
  private authenticateSocket(): void {
    if (!this.socket) return;

    const token = authService.getToken();
    const user = authService.getCurrentUser();

    if (token && user) {
      console.log('🔐 Authenticating socket...');
      this.socket.emit('authenticate', {
        token,
        userId: user.id,
        username: user.username,
      });
    }
  }

  /**
   * ✅ ENHANCED: Setup reconnection logic
   */
  private setupReconnectionLogic(): void {
    if (!this.socket) return;

    // Handle page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.socket && !this.socket.connected) {
        console.log('🔄 Page became visible, checking connection...');
        if (!this.isManuallyDisconnected) {
          this.socket.connect();
        }
      }
    });

    // Handle online/offline events
    window.addEventListener('online', () => {
      console.log('🌐 Internet connection restored');
      if (this.socket && !this.socket.connected && !this.isManuallyDisconnected) {
        this.socket.connect();
      }
    });

    window.addEventListener('offline', () => {
      console.log('🌐 Internet connection lost');
    });
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    console.log('🔌 Manually disconnecting socket...');
    this.isManuallyDisconnected = true;
    this.currentRoomId = null;
    
    if (this.socket) {
      this.socket.disconnect();
      this.socket.removeAllListeners();
      this.socket = null;
    }
    
    this.notifyConnectionListeners(false);
  }

  /**
   * Check if socket is connected
   */
  isConnected(): boolean {
    return !!this.socket?.connected;
  }

  /**
   * ✅ ENHANCED: Emit event with authentication check
   */
  emit(event: string, data?: any): void {
    if (!this.socket) {
      console.warn('⚠️ Socket not connected, cannot emit:', event);
      return;
    }

    if (!this.socket.connected) {
      console.warn('⚠️ Socket not connected, attempting to reconnect...');
      if (!this.isManuallyDisconnected) {
        this.socket.connect();
      }
      return;
    }

    // ✅ ENHANCED: Add authentication data to relevant events
    const user = authService.getCurrentUser();
    if (user && (event === 'join_room' || event === 'create_room' || event === 'leave_room')) {
      data = {
        ...data,
        userId: user.id,
        username: user.username,
      };
    }

    console.log(`📤 Emitting event: ${event}`, data);
    this.socket.emit(event, data);
  }

  /**
   * Listen for events
   */
  on(event: string, callback: (...args: any[]) => void): void {
    if (!this.socket) {
      console.warn('⚠️ Socket not connected, cannot listen for:', event);
      return;
    }

    this.socket.on(event, callback);
  }

  /**
   * Remove event listener
   */
  off(event: string, callback?: (...args: any[]) => void): void {
    if (!this.socket) return;

    if (callback) {
      this.socket.off(event, callback);
    } else {
      this.socket.removeAllListeners(event);
    }
  }

  /**
   * ✅ NEW: Subscribe to connection status changes
   */
  onConnectionChange(callback: (connected: boolean) => void): () => void {
    this.connectionListeners.push(callback);
    
    // Immediately call with current status
    callback(this.isConnected());
    
    // Return unsubscribe function
    return () => {
      this.connectionListeners = this.connectionListeners.filter(cb => cb !== callback);
    };
  }

  /**
   * ✅ NEW: Notify connection listeners
   */
  private notifyConnectionListeners(connected: boolean): void {
    this.connectionListeners.forEach(callback => {
      try {
        callback(connected);
      } catch (error) {
        console.error('Error in connection listener:', error);
      }
    });
  }

  /**
   * ✅ NEW: Get current room ID
   */
  getCurrentRoomId(): string | null {
    return this.currentRoomId;
  }

  /**
   * ✅ NEW: Set current room ID
   */
  setCurrentRoomId(roomId: string | null): void {
    this.currentRoomId = roomId;
  }

  /**
   * ✅ NEW: Force reconnection
   */
  forceReconnect(): void {
    if (this.socket && !this.isManuallyDisconnected) {
      console.log('🔄 Force reconnecting socket...');
      this.socket.disconnect();
      this.socket.connect();
    }
  }
}

// Export singleton instance
const socketService = new SocketService();
export default socketService;