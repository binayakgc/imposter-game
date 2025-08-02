// client/src/pages/GameRoom.tsx
// COMPLETE FIXED VERSION - Resolves all TypeScript errors and blank page

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import authService, { User } from '../services/authService';
import socketService from '../services/socket';

interface Room {
  id: string;
  code: string;
  name?: string | null;
  maxPlayers: number;
  isPublic: boolean;
  themeMode: boolean;
  playerCount: number;
  isActive: boolean;
  createdAt: string;
}

// ✅ FIXED: Updated Player interface to match both API response AND socket events
interface Player {
  id: string;
  userId: string;
  isHost: boolean;
  isOnline: boolean;
  joinedAt?: string;
  // Support both direct username (API) and nested user structure (socket events)
  username?: string;
  name?: string;
  user?: {
    id: string;
    username: string;
    avatar?: string | null;
  };
  avatar?: string | null;
}

const GameRoom: React.FC = () => {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);

  useEffect(() => {
    // Get current user
    const user = authService.getCurrentUser();
    setCurrentUser(user);

    if (!user) {
      navigate('/login');
      return;
    }

    // Check connection status
    setIsConnected(socketService.isConnected());
    
    // Load room data
    loadRoomData();
    
    // Set up socket listeners
    setupSocketListeners();
    
    return () => {
      // Clean up socket listeners
      cleanupSocketListeners();
    };
  }, [roomCode, navigate]);

  const loadRoomData = async () => {
    if (!roomCode) {
      setError('No room code provided');
      setIsLoading(false);
      return;
    }

    try {
      console.log(`🔍 Loading room data for: ${roomCode}`);
      
      const token = authService.getToken();
      if (!token) {
        throw new Error('No authentication token');
      }

      const response = await fetch(`http://localhost:3001/api/rooms/${roomCode}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();
      console.log('📊 Room data response:', result);

      if (response.ok && result.success && result.room) {
        setRoom(result.room);
        
        // ✅ FIXED: Transform API players to match our interface
        const playersData = (result.players || []).map((p: any) => ({
          ...p,
          username: p.username || p.name || p.user?.username,
          avatar: p.avatar || p.user?.avatar
        }));
        console.log('👥 Players data:', playersData);
        
        setPlayers(playersData);
        
        // Find current player
        const currentUserId = currentUser?.id;
        if (currentUserId) {
          const myPlayer = playersData.find((p: Player) => p.userId === currentUserId);
          setCurrentPlayer(myPlayer || null);
          console.log('👤 Current player:', myPlayer);
        }
        
        setError(null);
      } else {
        const errorMsg = result.error || result.message || 'Room not found';
        console.error('❌ Room load failed:', errorMsg);
        setError(errorMsg);
      }
    } catch (error: any) {
      console.error('❌ Failed to load room data:', error);
      setError('Failed to connect to server. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const setupSocketListeners = () => {
    console.log('🔌 Setting up socket listeners...');
    
    // Room updated
    socketService.on('room_updated', (data: any) => {
      console.log('📡 Room updated:', data);
      setRoom(data.room);
      // ✅ FIXED: Transform socket players to match our interface
      const transformedPlayers = (data.players || []).map((p: any) => ({
        ...p,
        username: p.username || p.name || p.user?.username,
        avatar: p.avatar || p.user?.avatar
      }));
      setPlayers(transformedPlayers);
    });

    // Player joined
    socketService.on('player_joined', (data: any) => {
      console.log('👋 Player joined:', data);
      setRoom(data.room);
      // ✅ FIXED: Transform socket player to match our interface
      const transformedPlayer = {
        ...data.player,
        username: data.player.username || data.player.name || data.player.user?.username,
        avatar: data.player.avatar || data.player.user?.avatar
      };
      setPlayers(prev => {
        // Check if player already exists to avoid duplicates
        const exists = prev.some(p => p.id === transformedPlayer.id);
        if (exists) return prev;
        return [...prev, transformedPlayer];
      });
    });

    // Player left
    socketService.on('player_left', (data: { playerId: string; playerName: string; reason: string }) => {
      console.log('👋 Player left:', data);
      setPlayers(prev => prev.filter(p => p.id !== data.playerId));
    });

    // Connection status
    socketService.on('connected', () => {
      console.log('✅ Socket connected');
      setIsConnected(true);
    });

    socketService.on('disconnected', () => {
      console.log('❌ Socket disconnected');
      setIsConnected(false);
    });

    // Error handling
    socketService.on('error', (error: any) => {
      console.error('🚨 Socket error:', error);
      setError(error.message || 'Connection error');
    });
  };

  const cleanupSocketListeners = () => {
    console.log('🧹 Cleaning up socket listeners...');
    socketService.off('room_updated');
    socketService.off('player_joined');
    socketService.off('player_left');
    socketService.off('connected');
    socketService.off('disconnected');
    socketService.off('error');
  };

  const handleStartGame = () => {
    if (!room || !currentPlayer?.isHost) {
      setError('Only the host can start the game');
      return;
    }

    if (players.length < 4) {
      setError('Need at least 4 players to start the game');
      return;
    }

    console.log('🚀 Starting game...');
    socketService.emit('start_game', {
      roomId: room.id,
    });
  };

  const handleLeaveRoom = () => {
    console.log('🚪 Leaving room...');
    
    if (room) {
      socketService.emit('leave_room', {
        roomId: room.id,
      });
    }
    
    // Navigate back to home
    navigate('/');
  };

  const formatTimeAgo = (dateString?: string) => {
    if (!dateString) return 'Just now';
    
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

      if (diffInSeconds < 60) return 'Just now';
      if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
      if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
      return `${Math.floor(diffInSeconds / 86400)}d ago`;
    } catch {
      return 'Just now';
    }
  };

  const getPlayerAvatar = (player: Player): string => {
    // ✅ FIXED: Handle both API response and socket event structures
    const avatar = player.avatar || player.user?.avatar;
    const username = player.username || player.name || player.user?.username;
    return avatar || username?.charAt(0)?.toUpperCase() || '?';
  };

  const getPlayerDisplayName = (player: Player): string => {
    // ✅ FIXED: Handle both API response and socket event structures  
    return player.username || player.name || player.user?.username || 'Unknown Player';
  };

  // ✅ FIXED: Better loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-game-bg via-slate-900 to-game-surface flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white text-lg mb-2">Loading room...</p>
          <p className="text-gray-400 text-sm">Room code: {roomCode}</p>
        </div>
      </div>
    );
  }

  // ✅ FIXED: Better error state
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-game-bg via-slate-900 to-game-surface flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="text-6xl mb-4">😞</div>
          <h2 className="text-2xl font-bold text-white mb-4">Oops! Something went wrong</h2>
          <p className="text-red-400 mb-6">{error}</p>
          
          <div className="space-y-3">
            <button
              onClick={loadRoomData}
              className="w-full bg-primary-600 hover:bg-primary-700 text-white px-6 py-3 rounded-xl transition-colors duration-200"
            >
              Try Again
            </button>
            
            <Link
              to="/"
              className="block w-full bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-xl transition-colors duration-200 text-center"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ✅ FIXED: Check if room exists
  if (!room) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-game-bg via-slate-900 to-game-surface flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🔍</div>
          <h2 className="text-2xl font-bold text-white mb-4">Room not found</h2>
          <p className="text-gray-400 mb-6">The room "{roomCode}" doesn't exist or has been deleted.</p>
          
          <Link
            to="/"
            className="inline-block bg-primary-600 hover:bg-primary-700 text-white px-6 py-3 rounded-xl transition-colors duration-200"
          >
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-game-bg via-slate-900 to-game-surface">
      {/* Header */}
      <header className="bg-white/10 backdrop-blur-xl border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Room Info */}
            <div className="flex items-center space-x-4">
              <Link 
                to="/"
                className="text-white hover:text-primary-400 transition-colors duration-200"
              >
                ← Back
              </Link>
              
              <div>
                <h1 className="text-xl font-bold text-white">
                  {room.name || `Room ${room.code}`}
                </h1>
                <p className="text-sm text-gray-400">
                  Code: {room.code} • {players.length}/{room.maxPlayers} players
                </p>
              </div>
            </div>

            {/* Connection Status */}
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}></div>
              <span className={`text-sm ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Room Info */}
          <div className="lg:col-span-1">
            <div className="bg-white/5 backdrop-blur-xl border border-white/20 rounded-2xl p-6 mb-6">
              <h2 className="text-xl font-bold text-white mb-4">Room Settings</h2>
              
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-400">Type</span>
                  <span className="text-white">{room.isPublic ? 'Public' : 'Private'}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-gray-400">Max Players</span>
                  <span className="text-white">{room.maxPlayers}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-gray-400">Theme Mode</span>
                  <span className="text-white">{room.themeMode ? 'Enabled' : 'Disabled'}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-gray-400">Status</span>
                  <span className={`${room.isActive ? 'text-green-400' : 'text-red-400'}`}>
                    {room.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            </div>

            {/* Host Controls */}
            {currentPlayer?.isHost && (
              <div className="bg-white/5 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
                <h2 className="text-xl font-bold text-white mb-4">Host Controls</h2>
                
                <div className="space-y-3">
                  <button
                    onClick={handleStartGame}
                    disabled={players.length < 4}
                    className={`w-full py-3 px-4 rounded-xl font-semibold transition-all duration-200 ${
                      players.length >= 4
                        ? 'bg-green-600 hover:bg-green-700 text-white'
                        : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {players.length >= 4 ? 'Start Game' : `Need ${4 - players.length} more players`}
                  </button>
                  
                  <button
                    onClick={handleLeaveRoom}
                    className="w-full bg-red-600 hover:bg-red-700 text-white py-3 px-4 rounded-xl font-semibold transition-colors duration-200"
                  >
                    Close Room
                  </button>
                </div>
              </div>
            )}

            {/* Leave Button for Non-hosts */}
            {!currentPlayer?.isHost && (
              <div className="bg-white/5 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
                <button
                  onClick={handleLeaveRoom}
                  className="w-full bg-gray-600 hover:bg-gray-700 text-white py-3 px-4 rounded-xl font-semibold transition-colors duration-200"
                >
                  Leave Room
                </button>
              </div>
            )}
          </div>

          {/* Right Column - Players List */}
          <div className="lg:col-span-2">
            <div className="bg-white/5 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-white">
                  Players ({players.length}/{room.maxPlayers})
                </h2>
                
                {players.length >= 4 && (
                  <span className="text-green-400 text-sm font-medium">
                    ✅ Ready to start!
                  </span>
                )}
              </div>

              {/* Players Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {players.map((player) => (
                  <div
                    key={player.id}
                    className={`bg-white/5 border rounded-xl p-4 transition-all duration-200 ${
                      player.isHost 
                        ? 'border-yellow-500/50 bg-yellow-500/10' 
                        : 'border-white/20 hover:border-white/30'
                    } ${
                      player.userId === currentUser?.id
                        ? 'ring-2 ring-primary-500/50'
                        : ''
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      {/* Avatar */}
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-white ${
                        player.isHost 
                          ? 'bg-gradient-to-br from-yellow-400 to-yellow-600' 
                          : 'bg-gradient-to-br from-primary-500 to-primary-600'
                      }`}>
                        {getPlayerAvatar(player)}
                      </div>

                      {/* Player Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <p className="text-white font-semibold truncate">
                            {getPlayerDisplayName(player)}
                          </p>
                          
                          {player.userId === currentUser?.id && (
                            <span className="text-xs bg-primary-600 text-white px-2 py-1 rounded-full">
                              You
                            </span>
                          )}
                          
                          {player.isHost && (
                            <span className="text-xs bg-yellow-600 text-white px-2 py-1 rounded-full">
                              Host
                            </span>
                          )}
                        </div>
                        
                        <div className="flex items-center space-x-2 mt-1">
                          <div className={`w-2 h-2 rounded-full ${
                            player.isOnline ? 'bg-green-400' : 'bg-gray-400'
                          }`}></div>
                          <span className="text-xs text-gray-400">
                            {player.isOnline ? 'Online' : 'Offline'} • Joined {formatTimeAgo(player.joinedAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Empty Slots */}
                {Array.from({ length: room.maxPlayers - players.length }).map((_, index) => (
                  <div
                    key={`empty-${index}`}
                    className="bg-white/5 border border-dashed border-white/20 rounded-xl p-4 flex items-center justify-center"
                  >
                    <span className="text-gray-500 text-sm">Waiting for player...</span>
                  </div>
                ))}
              </div>

              {/* Game Start Status */}
              {players.length < 4 && (
                <div className="mt-6 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                  <p className="text-yellow-400 text-sm text-center">
                    ⏳ Waiting for {4 - players.length} more player{4 - players.length !== 1 ? 's' : ''} to start the game
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameRoom;