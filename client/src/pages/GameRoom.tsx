// client/src/pages/GameRoom.tsx
// FIXED VERSION - All TypeScript errors resolved

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

// ✅ FIXED: Updated Player interface to match backend structure
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

const GameRoom: React.FC = () => {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);

  useEffect(() => {
    // Check connection status
    setIsConnected(socketService.isConnected());
    
    // Load room data
    loadRoomData();
    
    // Set up socket listeners
    setupSocketListeners();
    
    return () => {
      // Clean up socket listeners
      socketService.off('room_updated');
      socketService.off('player_joined');
      socketService.off('player_left');
      socketService.off('connected');
      socketService.off('disconnected');
    };
  }, [roomCode]);

  const loadRoomData = async () => {
    if (!roomCode) {
      setError('No room code provided');
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(`http://localhost:3001/api/rooms/${roomCode}`);
      const result = await response.json();

      if (response.ok && result.success) {
        setRoom(result.room);
        // ✅ FIXED: Backend returns players with correct structure already
        setPlayers(result.players || []);
        // Find current player (assuming we can identify them somehow)
        const host = result.players?.find((p: Player) => p.isHost);
        setCurrentPlayer(host || result.players?.[0] || null);
      } else {
        setError(result.message || 'Room not found');
      }
    } catch (error: any) {  // ✅ FIXED: Proper error typing
      console.error('Failed to load room data:', error);
      setError('Failed to connect to server');
    } finally {
      setIsLoading(false);
    }
  };

  const setupSocketListeners = () => {
    // Room updated
    socketService.on('room_updated', (data: { room: Room; players: Player[] }) => {
      setRoom(data.room);
      // ✅ FIXED: Players already have correct structure
      setPlayers(data.players);
    });

    // Player joined
    socketService.on('player_joined', (data: { player: Player; room: Room }) => {
      setRoom(data.room);
      // ✅ FIXED: Use proper typing and spread operator
      setPlayers(prev => [...prev, data.player]);
    });

    // Player left
    socketService.on('player_left', (data: { playerId: string; playerName: string; reason: string }) => {
      setPlayers(prev => prev.filter(p => p.id !== data.playerId));
    });

    // Connection status
    socketService.on('connected', () => {
      setIsConnected(true);
    });

    socketService.on('disconnected', () => {
      setIsConnected(false);
    });
  };

  const handleStartGame = () => {
    if (!roomCode || !currentPlayer?.isHost) {
      setError('Only the host can start the game');
      return;
    }

    socketService.emit('start_game', {
      roomId: room?.id,
    });
  };

  const handleLeaveRoom = () => {
    if (roomCode) {
      socketService.emit('leave_room', {
        roomId: room?.id,
      });
    }
    navigate('/');
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return 'Just joined';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-game-bg via-slate-900 to-game-surface flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white text-lg">Loading room...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-game-bg via-slate-900 to-game-surface flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">❌</div>
          <h2 className="text-2xl font-bold text-white mb-4">Room Error</h2>
          <p className="text-gray-400 mb-6">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-game-bg via-slate-900 to-game-surface flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🔍</div>
          <h2 className="text-2xl font-bold text-white mb-4">Room Not Found</h2>
          <p className="text-gray-400 mb-6">This room doesn't exist or has been closed</p>
          <button
            onClick={() => navigate('/')}
            className="bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200"
          >
            Back to Home
          </button>
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
            <div className="flex items-center space-x-4">
              <button
                onClick={handleLeaveRoom}
                className="flex items-center space-x-2 text-gray-400 hover:text-white transition-colors duration-200"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span>Leave Room</span>
              </button>
              
              <div className="h-6 w-px bg-gray-600"></div>
              
              <div>
                <h1 className="text-white font-bold text-lg">{room.name || `Room ${room.code}`}</h1>
                <p className="text-gray-400 text-sm">Code: {room.code}</p>
              </div>
            </div>

            {/* Connection Status */}
            <div className={`flex items-center space-x-2 px-3 py-1 rounded-lg ${
              isConnected 
                ? 'bg-green-500/20 border border-green-500/30' 
                : 'bg-red-500/20 border border-red-500/30'
            }`}>
              <div className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-green-400' : 'bg-red-400'
              }`}></div>
              <span className={`text-xs font-medium ${
                isConnected ? 'text-green-400' : 'text-red-400'
              }`}>
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Room Info */}
          <div className="lg:col-span-2">
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-6 shadow-2xl">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-2">
                    {room.name || `Room ${room.code}`}
                  </h2>
                  <div className="flex items-center space-x-4 text-sm text-gray-400">
                    <span>Code: {room.code}</span>
                    <span>•</span>
                    <span>{room.isPublic ? '🌐 Public' : '🔐 Private'}</span>
                    <span>•</span>
                    <span>{players.length}/{room.maxPlayers} players</span>
                  </div>
                </div>
                
                {room.themeMode && (
                  <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-lg px-3 py-1">
                    <span className="text-yellow-400 text-sm font-medium">🎯 Theme Mode</span>
                  </div>
                )}
              </div>

              {/* Game Status */}
              <div className="bg-white/5 rounded-2xl p-4 mb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-white font-semibold">Game Status</h3>
                    <p className="text-gray-400 text-sm">Waiting for players to join</p>
                  </div>
                  
                  {currentPlayer?.isHost && players.length >= 4 && (
                    <button
                      onClick={handleStartGame}
                      className="bg-primary-600 hover:bg-primary-700 text-white font-semibold py-2 px-4 rounded-xl transition-all duration-200"
                    >
                      Start Game
                    </button>
                  )}
                </div>
                
                {players.length < 4 && (
                  <div className="mt-3 text-yellow-400 text-sm">
                    Need at least 4 players to start (currently {players.length})
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Players List */}
          <div className="lg:col-span-1">
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-6 shadow-2xl">
              <h3 className="text-xl font-bold text-white mb-4">
                Players ({players.length}/{room.maxPlayers})
              </h3>
              
              <div className="space-y-3">
                {players.map((player) => (
                  <div
                    key={player.id}
                    className="flex items-center space-x-3 bg-white/5 rounded-xl p-3"
                  >
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-500 rounded-lg flex items-center justify-center">
                      <span className="text-white font-semibold text-sm">
                        {player.user.avatar || player.user.username.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <p className="text-white font-semibold truncate">
                          {player.user.username}
                        </p>
                        {player.isHost && (
                          <span className="bg-yellow-500/20 text-yellow-400 text-xs px-2 py-1 rounded-full font-medium">
                            👑 Host
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-2 mt-1">
                        <div className={`w-2 h-2 rounded-full ${
                          player.isOnline ? 'bg-green-400' : 'bg-gray-400'
                        }`}></div>
                        <span className={`text-xs ${
                          player.isOnline ? 'text-green-400' : 'text-gray-400'
                        }`}>
                          {player.isOnline ? 'Online' : 'Offline'}
                        </span>
                        <span className="text-gray-500 text-xs">
                          {formatTimeAgo(player.joinedAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                
                {/* Empty Slots */}
                {Array.from({ length: room.maxPlayers - players.length }).map((_, index) => (
                  <div
                    key={`empty-${index}`}
                    className="flex items-center space-x-3 bg-white/5 rounded-xl p-3 border-2 border-dashed border-white/20"
                  >
                    <div className="w-10 h-10 bg-gray-600/50 rounded-lg flex items-center justify-center">
                      <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-gray-500 font-medium">Waiting for player...</p>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Room Settings */}
              <div className="mt-6 pt-4 border-t border-white/10">
                <h4 className="text-white font-semibold mb-3">Room Settings</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Max Players:</span>
                    <span className="text-white">{room.maxPlayers}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Room Type:</span>
                    <span className="text-white">{room.isPublic ? 'Public' : 'Private'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Theme Mode:</span>
                    <span className="text-white">{room.themeMode ? 'Enabled' : 'Disabled'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Host Controls */}
        {currentPlayer?.isHost && (
          <div className="mt-8 bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-4">👑 Host Controls</h3>
            <div className="flex flex-wrap gap-4">
              <button
                onClick={handleStartGame}
                disabled={players.length < 4}
                className={`py-2 px-4 rounded-xl font-semibold transition-all duration-200 ${
                  players.length >= 4
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                }`}
              >
                Start Game {players.length < 4 && `(Need ${4 - players.length} more)`}
              </button>
              
              <button
                onClick={() => {/* TODO: Implement room settings */}}
                className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-xl font-semibold transition-all duration-200"
              >
                Room Settings
              </button>
              
              <button
                onClick={() => {
                  navigator.clipboard.writeText(room.code);
                  // TODO: Show toast notification
                }}
                className="bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded-xl font-semibold transition-all duration-200"
              >
                Copy Room Code
              </button>
            </div>
          </div>
        )}

        {/* Non-host Info */}
        {!currentPlayer?.isHost && (
          <div className="mt-8 bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-6 shadow-2xl text-center">
            <h3 className="text-xl font-bold text-white mb-2">Waiting for Host</h3>
            <p className="text-gray-400">
              The host will start the game when ready. 
              {players.length < 4 && ` Need ${4 - players.length} more players to start.`}
            </p>
          </div>
        )}
      </main>
    </div>
  );
};

export default GameRoom;