// client/src/pages/GameRoom.tsx
// Enhanced game room lobby with proper public/private logic

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
        setPlayers(result.players || []);
        // Find current player (assuming we can identify them somehow)
        // For now, we'll assume the first player or host
        const host = result.players?.find((p: Player) => p.isHost);
        setCurrentPlayer(host || result.players?.[0] || null);
        setError(null);
      } else {
        setError(result.message || 'Room not found');
      }
    } catch (error) {
      console.error('❌ Error loading room:', error);
      setError('Failed to load room data');
    } finally {
      setIsLoading(false);
    }
  };

  const setupSocketListeners = () => {
    // Connection status
    socketService.on('connected', () => setIsConnected(true));
    socketService.on('disconnected', () => setIsConnected(false));
    
    // Room events
    socketService.on('room_updated', (data) => {
      console.log('Room updated:', data);
      setRoom(data.room);
      setPlayers(data.players || []);
    });

    socketService.on('player_joined', (data) => {
      console.log('Player joined:', data);
      setPlayers(prev => [...prev, data.player]);
      if (room) {
        setRoom({ ...room, playerCount: room.playerCount + 1 });
      }
    });

    socketService.on('player_left', (data) => {
      console.log('Player left:', data);
      setPlayers(prev => prev.filter(p => p.id !== data.playerId));
      if (room) {
        setRoom({ ...room, playerCount: Math.max(0, room.playerCount - 1) });
      }
    });
  };

  const handleLeaveRoom = () => {
    if (room) {
      socketService.leaveRoom(room.id);
    }
    navigate('/');
  };

  const handleStartGame = () => {
    if (room && players.length >= 4) {
      socketService.startGame(room.id);
    }
  };

  const copyRoomCode = () => {
    if (roomCode) {
      navigator.clipboard.writeText(roomCode);
      // Create a temporary success message
      const button = document.getElementById('copy-button');
      if (button) {
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        setTimeout(() => {
          button.textContent = originalText;
        }, 2000);
      }
    }
  };

  const copyRoomLink = () => {
    const link = `${window.location.origin}/join/${roomCode}`;
    navigator.clipboard.writeText(link);
    // Create a temporary success message
    alert('Room link copied to clipboard!');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-game-bg via-slate-900 to-game-surface">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white">Loading room...</p>
        </div>
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-game-bg via-slate-900 to-game-surface">
        <div className="text-center">
          <div className="text-6xl mb-4">😞</div>
          <h1 className="text-2xl font-bold text-white mb-4">Room Not Found</h1>
          <p className="text-gray-400 mb-8">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 px-6 rounded-xl transition-colors"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  const isHost = currentPlayer?.isHost || false;
  const canStartGame = players.length >= 4 && players.length <= room.maxPlayers;

  return (
    <div className="min-h-screen p-4 bg-gradient-to-br from-game-bg via-slate-900 to-game-surface">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-80 h-80 bg-primary-500/20 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -right-40 w-80 h-80 bg-game-accent/20 rounded-full blur-3xl"></div>
      </div>

      <div className="relative max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={handleLeaveRoom}
            className="text-gray-400 hover:text-white transition-colors flex items-center space-x-2 hover:scale-105 transition-transform"
          >
            <span className="text-xl">←</span>
            <span className="font-medium">Leave Room</span>
          </button>
          
          <div className={`px-4 py-2 rounded-full text-sm font-semibold ${
            isConnected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
          }`}>
            {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
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
              <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 mt-4">
                <div className="text-center">
                  <p className="text-green-300 font-semibold mb-2">✨ Public Room</p>
                  <p className="text-sm text-gray-300">
                    This room is visible to everyone in the lobby
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Players can join directly without needing a code
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4 mt-4">
                <div className="text-center mb-4">
                  <p className="text-yellow-300 font-semibold mb-2">🔐 Private Room</p>
                  <p className="text-sm text-gray-300 mb-3">
                    Share this code with friends to let them join
                  </p>
                </div>
                
                <div className="flex items-center justify-center space-x-3">
                  <button
                    id="copy-button"
                    onClick={copyRoomCode}
                    className="bg-white/10 hover:bg-white/20 border border-white/20 text-white px-6 py-3 rounded-xl font-mono text-xl tracking-widest transition-all duration-200 hover:scale-105"
                  >
                    {roomCode}
                  </button>
                  <button
                    onClick={copyRoomLink}
                    className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-3 rounded-xl text-sm font-semibold transition-colors"
                  >
                    Copy Link
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Room Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="bg-white/10 p-4 rounded-xl">
              <div className="text-2xl font-bold text-primary-400">{players.length}</div>
              <div className="text-xs text-gray-400">Players</div>
            </div>
            <div className="bg-white/10 p-4 rounded-xl">
              <div className="text-2xl font-bold text-game-accent">{room.maxPlayers}</div>
              <div className="text-xs text-gray-400">Max</div>
            </div>
            <div className="bg-white/10 p-4 rounded-xl">
              <div className="text-2xl font-bold text-game-success">
                {room.isPublic ? 'Public' : 'Private'}
              </div>
              <div className="text-xs text-gray-400">Visibility</div>
            </div>
            <div className="bg-white/10 p-4 rounded-xl">
              <div className="text-2xl font-bold text-purple-400">
                {room.themeMode ? 'Theme' : 'Custom'}
              </div>
              <div className="text-xs text-gray-400">Mode</div>
            </div>
          </div>
        </div>

        {/* Players List */}
        <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-8 mb-8 shadow-2xl border border-white/10">
          <h2 className="text-2xl font-bold text-white mb-6 text-center">
            Players ({players.length}/{room.maxPlayers})
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {players.map((player) => (
              <div
                key={player.id}
                className={`p-4 rounded-2xl border-2 transition-all duration-200 ${
                  player.isHost 
                    ? 'bg-primary-500/20 border-primary-500/50 shadow-primary-500/20' 
                    : 'bg-white/10 border-white/20'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`w-4 h-4 rounded-full ${
                      player.isOnline ? 'bg-green-400' : 'bg-gray-400'
                    }`}></div>
                    <span className="text-white font-semibold">{player.name}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    {player.isHost && (
                      <span className="bg-primary-600 text-white px-3 py-1 rounded-full text-xs font-semibold">
                        Host
                      </span>
                    )}
                    <span className="text-2xl">
                      {player.isHost ? '👑' : '👤'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
            
            {/* Empty slots */}
            {Array.from({ length: room.maxPlayers - players.length }).map((_, index) => (
              <div
                key={`empty-${index}`}
                className="p-4 rounded-2xl border-2 border-dashed border-white/20 bg-white/5"
              >
                <div className="text-center text-gray-400">
                  <div className="text-3xl mb-2">👤</div>
                  <div className="text-sm">
                    {room.isPublic ? 'Waiting for player...' : 'Share room code to invite'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Game Controls */}
        <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-8 text-center shadow-2xl border border-white/10">
          {isHost ? (
            <div>
              <h3 className="text-xl font-bold text-white mb-4 flex items-center justify-center space-x-2">
                <span>👑</span>
                <span>Host Controls</span>
              </h3>
              <button
                onClick={handleStartGame}
                disabled={!canStartGame || !isConnected}
                className={`text-lg px-8 py-4 rounded-2xl font-bold transition-all duration-200 ${
                  !canStartGame || !isConnected
                    ? 'bg-gray-600 text-gray-400 cursor-not-allowed opacity-50'
                    : 'bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white hover:scale-105 hover:shadow-2xl shadow-primary-500/30'
                }`}
              >
                {canStartGame ? '🚀 Start Game' : `Need ${4 - players.length} more players`}
              </button>
              <p className="text-gray-400 text-sm mt-3">
                Minimum 4 players required to start the game
              </p>
            </div>
          ) : (
            <div>
              <h3 className="text-xl font-bold text-white mb-4">Waiting for Host</h3>
              <div className="flex items-center justify-center space-x-2 text-gray-400">
                <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                <span>The host will start the game when ready</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GameRoom;