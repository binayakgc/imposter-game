// client/src/pages/GameRoom.tsx
// Complete game room lobby with real-time updates and proper connection handling

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import socketService from '../services/socket';

interface Room {
  id: string;
  code: string;
  name?: string;
  maxPlayers: number;
  isPublic: boolean;
  themeMode: boolean;
  playerCount: number;
  isActive: boolean;
  createdAt: string;
}

interface Player {
  id: string;
  name: string;
  isHost: boolean;
  isOnline: boolean;
  joinedAt: string;
}

const GameRoom: React.FC = () => {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  useEffect(() => {
    console.log(`🎮 GameRoom component mounted for room: ${roomCode}`);
    
    // Set up socket connection and event listeners
    setupSocketConnection();
    
    // Load initial room data
    loadRoomData();

    // Cleanup on unmount
    return () => {
      console.log('🧹 GameRoom component unmounting, cleaning up...');
      cleanupSocketListeners();
    };
  }, [roomCode]);

  const setupSocketConnection = () => {
    console.log('🔌 Setting up socket connection...');
    
    // Monitor connection status
    const updateConnectionStatus = () => {
      const connected = socketService.isConnected();
      setIsConnected(connected);
      setConnectionStatus(connected ? 'connected' : 'disconnected');
      console.log(`📡 Connection status: ${connected ? 'connected' : 'disconnected'}`);
    };

    // Set up connection listeners
    socketService.on('connected', () => {
      console.log('✅ Socket connected in GameRoom');
      updateConnectionStatus();
    });

    socketService.on('disconnected', () => {
      console.log('❌ Socket disconnected in GameRoom');
      updateConnectionStatus();
    });

    socketService.on('error', (error) => {
      console.error('🚨 Socket error in GameRoom:', error);
      setError(error.message || 'Connection error');
    });

    // 🔧 CRITICAL: Room update listeners
    socketService.on('room_updated', (data) => {
      console.log('📊 Room updated:', data);
      if (data.room) {
        setRoom(data.room);
      }
      if (data.players) {
        setPlayers(data.players);
        console.log(`👥 Updated player list: ${data.players.length} players`);
        data.players.forEach(p => console.log(`  - ${p.name} (${p.isHost ? 'Host' : 'Player'}) - ${p.isOnline ? 'Online' : 'Offline'}`));
      }
    });

    // 🔧 CRITICAL: Player joined listener
    socketService.on('player_joined', (data) => {
      console.log('👋 Player joined:', data.player);
      // The room_updated event will handle the full update
    });

    // 🔧 CRITICAL: Player left listener
    socketService.on('player_left', (data) => {
      console.log('👋 Player left:', data);
      // The room_updated event will handle the full update
    });

    // 🔧 CRITICAL: Host changed listener
    socketService.on('host_changed', (data) => {
      console.log('👑 Host changed:', data);
      setError(null); // Clear any errors
      // Show notification
      alert(data.message || `${data.newHost.name} is now the host`);
    });

    // 🔧 CRITICAL: Room joined listener (for this client)
    socketService.on('room_joined', (data) => {
      console.log('🚪 Successfully joined room:', data);
      if (data.success) {
        setRoom(data.room);
        setPlayers(data.players || []);
        setCurrentPlayer(data.player);
        setIsLoading(false);
        setError(null);
      }
    });

    // 🔧 CRITICAL: Room left listener (for this client)
    socketService.on('room_left', (data) => {
      console.log('🚪 Left room:', data);
      if (data.success) {
        navigate('/');
      }
    });

    // Initialize connection
    updateConnectionStatus();
    if (!socketService.isConnected()) {
      console.log('🔌 Socket not connected, attempting to connect...');
      setConnectionStatus('connecting');
      socketService.connect('http://localhost:3001').catch(err => {
        console.error('❌ Failed to connect:', err);
        setConnectionStatus('disconnected');
        setError('Failed to connect to server');
      });
    }
  };

  const cleanupSocketListeners = () => {
    console.log('🧹 Cleaning up socket listeners...');
    socketService.off('connected');
    socketService.off('disconnected');
    socketService.off('error');
    socketService.off('room_updated');
    socketService.off('player_joined');
    socketService.off('player_left');
    socketService.off('host_changed');
    socketService.off('room_joined');
    socketService.off('room_left');
  };

  const loadRoomData = async () => {
    if (!roomCode) {
      setError('No room code provided');
      setIsLoading(false);
      return;
    }

    console.log(`📋 Loading room data for: ${roomCode}`);

    try {
      // Try to get room details via REST API first (fallback)
      const response = await fetch(`http://localhost:3001/api/rooms/${roomCode}`);
      
      if (response.ok) {
        const result = await response.json();
        console.log('📊 Room data loaded via REST:', result);
        
        if (result.success) {
          setRoom(result.room);
          setPlayers(result.players || []);
        } else {
          setError(result.error || 'Room not found');
        }
      } else if (response.status === 404) {
        setError('Room not found');
      } else {
        setError('Failed to load room data');
      }
    } catch (error) {
      console.error('❌ Error loading room data:', error);
      setError('Failed to connect to server');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLeaveRoom = async () => {
    if (!room || !socketService.isConnected()) {
      navigate('/');
      return;
    }

    console.log(`🚪 Leaving room: ${room.id}`);
    
    try {
      // Emit leave room event
      socketService.emit('leave_room', { roomId: room.id });
      
      // Don't wait for response, just navigate
      setTimeout(() => {
        navigate('/');
      }, 1000);
      
    } catch (error) {
      console.error('❌ Error leaving room:', error);
      // Navigate anyway
      navigate('/');
    }
  };

  const handleStartGame = () => {
    if (!room) return;
    
    if (players.length < 4) {
      alert('Need at least 4 players to start the game');
      return;
    }

    console.log('🎮 Starting game...');
    socketService.emit('start_game', { roomId: room.id });
  };

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const joined = new Date(dateString);
    const diffMs = now.getTime() - joined.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours}h ago`;
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-game-dark via-game-primary to-game-secondary flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white text-xl">Loading room...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error || !room) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-game-dark via-game-primary to-game-secondary flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">😵</div>
          <h1 className="text-2xl font-bold text-white mb-4">Room Error</h1>
          <p className="text-gray-300 mb-6">{error || 'Room not found'}</p>
          <button
            onClick={() => navigate('/')}
            className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  const isHost = currentPlayer?.isHost || false;
  const canStartGame = isHost && players.length >= 4;

  return (
    <div className="min-h-screen bg-gradient-to-br from-game-dark via-game-primary to-game-secondary relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-game-accent/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <div className="relative z-10 container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={handleLeaveRoom}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            ← Leave Room
          </button>
          
          <div className={`px-4 py-2 rounded-full text-sm font-semibold ${
            connectionStatus === 'connected' 
              ? 'bg-green-500/20 text-green-400' 
              : connectionStatus === 'connecting'
              ? 'bg-yellow-500/20 text-yellow-400'
              : 'bg-red-500/20 text-red-400'
          }`}>
            {connectionStatus === 'connected' ? '🟢 Connected' : 
             connectionStatus === 'connecting' ? '🟡 Connecting...' : '🔴 Disconnected'}
          </div>
        </div>

        {/* Room Info */}
        <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-8 mb-8 shadow-2xl border border-white/10">
          {/* Room Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center space-x-3 mb-4">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl ${
                room.isPublic 
                  ? 'bg-gradient-to-br from-green-500 to-green-600' 
                  : 'bg-gradient-to-br from-yellow-500 to-yellow-600'
              }`}>
                {room.isPublic ? '🌐' : '🔐'}
              </div>
              <div>
                <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${
                  room.isPublic 
                    ? 'bg-green-500/20 text-green-300' 
                    : 'bg-yellow-500/20 text-yellow-300'
                }`}>
                  {room.isPublic ? 'Public Room' : 'Private Room'}
                </div>
              </div>
            </div>
            
            <h1 className="text-4xl font-bold text-white mb-2">
              {room.name || `Room ${room.code}`}
            </h1>
            
            {/* Room Code Section - Different for Public vs Private */}
            {room.isPublic ? (
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 mb-6">
                <p className="text-green-300 text-sm mb-1">✨ Public Room</p>
                <p className="text-gray-300 text-sm">
                  This room is visible to everyone in the lobby<br/>
                  Players can join directly without needing a code
                </p>
              </div>
            ) : (
              <div className="bg-white/10 rounded-xl p-4 mb-6">
                <p className="text-gray-300 text-sm mb-2">Share this code with friends:</p>
                <div className="flex items-center justify-center gap-4">
                  <div className="bg-game-surface/50 px-6 py-3 rounded-lg border border-white/20">
                    <span className="text-2xl font-mono font-bold text-white tracking-wider">
                      {room.code}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/join/${room.code}`);
                      alert('Room link copied to clipboard!');
                    }}
                    className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                  >
                    Copy Link
                  </button>
                </div>
              </div>
            )}

            {/* Room Stats */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="bg-white/10 p-4 rounded-xl">
                <div className="text-2xl font-bold text-primary-400">{players.length}</div>
                <div className="text-xs text-gray-400">Players</div>
              </div>
              <div className="bg-white/10 p-4 rounded-xl">
                <div className="text-2xl font-bold text-game-accent">{room.maxPlayers}</div>
                <div className="text-xs text-gray-400">Max</div>
              </div>
              <div className="bg-white/10 p-4 rounded-xl">
                <div className="text-lg font-bold text-green-400">
                  {room.isPublic ? 'Public' : 'Private'}
                </div>
                <div className="text-xs text-gray-400">Visibility</div>
              </div>
              <div className="bg-white/10 p-4 rounded-xl">
                <div className="text-lg font-bold text-purple-400">
                  {room.themeMode ? 'Theme' : 'Custom'}
                </div>
                <div className="text-xs text-gray-400">Mode</div>
              </div>
            </div>
          </div>
        </div>

        {/* Players Section */}
        <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/10 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">
              Players ({players.length}/{room.maxPlayers})
            </h2>
            
            {isHost && (
              <div className="flex items-center gap-2 text-sm text-yellow-400">
                <span>👑</span>
                <span>You are the host</span>
              </div>
            )}
          </div>

          {/* Player Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {players.map((player, index) => (
              <div
                key={player.id}
                className={`p-4 rounded-xl border transition-all duration-200 ${
                  player.isOnline
                    ? player.isHost
                      ? 'bg-yellow-500/20 border-yellow-500/40 shadow-yellow-500/20'
                      : 'bg-blue-500/20 border-blue-500/40 shadow-blue-500/20'
                    : 'bg-gray-500/20 border-gray-500/40'
                } ${
                  currentPlayer?.id === player.id ? 'ring-2 ring-primary-500' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl ${
                    player.isOnline 
                      ? player.isHost ? 'bg-yellow-500' : 'bg-blue-500'
                      : 'bg-gray-500'
                  }`}>
                    {player.isHost ? '👑' : '👤'}
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-white">{player.name}</h3>
                      {currentPlayer?.id === player.id && (
                        <span className="text-xs bg-primary-500/20 text-primary-400 px-2 py-1 rounded-full">
                          You
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <div className={`w-2 h-2 rounded-full ${
                        player.isOnline ? 'bg-green-400' : 'bg-gray-400'
                      }`}></div>
                      <span>{player.isOnline ? 'Online' : 'Offline'}</span>
                      <span>•</span>
                      <span>Joined {formatTimeAgo(player.joinedAt)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Empty slots */}
            {Array.from({ length: room.maxPlayers - players.length }, (_, index) => (
              <div
                key={`empty-${index}`}
                className="p-4 rounded-xl border-2 border-dashed border-gray-600 bg-gray-500/10 flex items-center justify-center"
              >
                <div className="text-center text-gray-500">
                  <div className="text-3xl mb-2">👤</div>
                  <p className="text-sm">Waiting for player...</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Game Controls */}
        {isHost && (
          <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/10">
            <h2 className="text-xl font-bold text-white mb-4">Host Controls</h2>
            
            <div className="space-y-4">
              {players.length < 4 && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
                  <p className="text-yellow-300 text-sm">
                    ⚠️ Need at least 4 players to start the game. Currently have {players.length}.
                  </p>
                </div>
              )}

              <button
                onClick={handleStartGame}
                disabled={!canStartGame || connectionStatus !== 'connected'}
                className={`w-full py-4 px-6 rounded-xl font-bold text-lg transition-all duration-200 ${
                  canStartGame && connectionStatus === 'connected'
                    ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white transform hover:scale-105'
                    : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                }`}
              >
                {connectionStatus !== 'connected' ? (
                  '🔌 Connecting...'
                ) : players.length < 4 ? (
                  `🎮 Need ${4 - players.length} more players`
                ) : (
                  '🚀 Start Game'
                )}
              </button>
            </div>
          </div>
        )}

        {!isHost && (
          <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/10 text-center">
            <h2 className="text-xl font-bold text-white mb-4">Waiting for Host</h2>
            <p className="text-gray-300">
              {players.find(p => p.isHost)?.name || 'The host'} will start the game when ready.
            </p>
            {players.length < 4 && (
              <p className="text-yellow-400 mt-2">
                ⚠️ Need {4 - players.length} more players to start
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default GameRoom;