// client/src/pages/HomePage.tsx
// Enhanced home page with public room lobby and Socket.io connection

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import socketService from '../services/socket';

interface PublicRoom {
  id: string;
  code: string;
  name?: string;
  maxPlayers: number;
  playerCount: number;
  themeMode: boolean;
  createdAt: string;
  isActive: boolean;
}

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [serverStatus, setServerStatus] = useState<'unknown' | 'healthy' | 'error'>('unknown');
  const [publicRooms, setPublicRooms] = useState<PublicRoom[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<PublicRoom | null>(null);
  const [joiningRoom, setJoiningRoom] = useState(false);

  useEffect(() => {
    // Test backend health
    const testBackendHealth = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/health');
        if (response.ok) {
          setServerStatus('healthy');
        } else {
          setServerStatus('error');
        }
      } catch (error) {
        console.error('Backend health check failed:', error);
        setServerStatus('error');
      }
    };

    // Connect to Socket.io server
    const connectToServer = async () => {
      try {
        setConnectionStatus('connecting');
        await socketService.connect('http://localhost:3001');
        
        // Set up connection status listeners
        socketService.on('connected', () => {
          console.log('✅ Connected to game server');
          setConnectionStatus('connected');
        });

        socketService.on('disconnected', () => {
          console.log('❌ Disconnected from game server');
          setConnectionStatus('disconnected');
        });

        socketService.on('error', (error) => {
          console.error('🚨 Socket error:', error);
          setConnectionStatus('disconnected');
        });

        // Check if already connected
        if (socketService.isConnected()) {
          setConnectionStatus('connected');
        }

      } catch (error) {
        console.error('Failed to connect to server:', error);
        setConnectionStatus('disconnected');
      }
    };

    // Load public rooms
    const loadPublicRooms = async () => {
      setLoadingRooms(true);
      try {
        const response = await fetch('http://localhost:3001/api/rooms/public');
        if (response.ok) {
          const result = await response.json();
          setPublicRooms(result.rooms || []);
        } else {
          console.error('Failed to load public rooms');
        }
      } catch (error) {
        console.error('Error loading public rooms:', error);
      } finally {
        setLoadingRooms(false);
      }
    };

    // Run initial setup
    testBackendHealth();
    connectToServer();
    loadPublicRooms();

    // Set up interval to refresh public rooms every 10 seconds
    const roomRefreshInterval = setInterval(() => {
      loadPublicRooms();
    }, 10000);

    // Cleanup on unmount
    return () => {
      clearInterval(roomRefreshInterval);
      socketService.disconnect();
    };
  }, []);

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'text-green-400';
      case 'connecting': return 'text-yellow-400';
      case 'disconnected': return 'text-red-400';
    }
  };

  const getConnectionStatusText = () => {
    switch (connectionStatus) {
      case 'connected': return '🟢 Connected';
      case 'connecting': return '🟡 Connecting...';
      case 'disconnected': return '🔴 Disconnected';
    }
  };

  const testSocketConnection = () => {
    if (socketService.isConnected()) {
      console.log('✅ Socket connection test successful');
      alert('Socket.io connection is working! Check console for details.');
    } else {
      console.log('❌ Socket not connected');
      alert('Socket.io not connected. Check console for errors.');
    }
  };

  const handleJoinPublicRoom = (room: PublicRoom) => {
    setSelectedRoom(room);
    setShowJoinModal(true);
  };

  const handleQuickJoin = async () => {
    if (!selectedRoom || !playerName.trim()) {
      return;
    }

    if (connectionStatus !== 'connected') {
      alert('Please wait for server connection');
      return;
    }

    setJoiningRoom(true);

    try {
      // Check if room is still available
      const response = await fetch(`http://localhost:3001/api/rooms/${selectedRoom.code}`);
      const result = await response.json();

      if (!response.ok) {
        alert('Room no longer exists');
        setShowJoinModal(false);
        setJoiningRoom(false);
        return;
      }

      const room = result.room;
      
      if (room.playerCount >= room.maxPlayers) {
        alert('Room is now full');
        setShowJoinModal(false);
        setJoiningRoom(false);
        return;
      }

      // Join room via Socket.io
      const handleRoomJoined = (data: any) => {
        console.log('✅ Room joined successfully:', data);
        if (data.success) {
          navigate(`/room/${selectedRoom.code}`);
        } else {
          alert(data.message || 'Failed to join room');
        }
        setJoiningRoom(false);
        setShowJoinModal(false);
        socketService.off('room_joined', handleRoomJoined);
      };

      socketService.on('room_joined', handleRoomJoined);
      socketService.joinRoom(selectedRoom.code, playerName);

      // Timeout after 10 seconds
      setTimeout(() => {
        if (joiningRoom) {
          alert('Join request timed out');
          setJoiningRoom(false);
          setShowJoinModal(false);
          socketService.off('room_joined', handleRoomJoined);
        }
      }, 10000);

    } catch (error) {
      console.error('❌ Error joining room:', error);
      alert('Network error. Please try again.');
      setJoiningRoom(false);
      setShowJoinModal(false);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const created = new Date(dateString);
    const diffInMinutes = Math.floor((now.getTime() - created.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes === 1) return '1 minute ago';
    if (diffInMinutes < 60) return `${diffInMinutes} minutes ago`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours === 1) return '1 hour ago';
    if (diffInHours < 24) return `${diffInHours} hours ago`;
    
    return 'More than a day ago';
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-game-bg via-slate-900 to-game-surface">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-80 h-80 bg-primary-500/20 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -right-40 w-80 h-80 bg-game-accent/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/4 right-1/4 w-60 h-60 bg-purple-500/10 rounded-full blur-3xl"></div>
      </div>

      <div className="relative max-w-4xl w-full animate-fade-in">
        {/* Game Title */}
        <div className="text-center mb-12">
          <h1 className="text-6xl font-bold text-white mb-4 animate-bounce-gentle">
            🕵️ Imposter
          </h1>
          <p className="text-2xl text-gray-300 font-game mb-2">
            The Ultimate Word Guessing Game
          </p>
          <p className="text-lg text-gray-400">
            Find the imposter or guess the word to win!
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column - Main Actions */}
          <div className="space-y-6">
            {/* Connection Status */}
            <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 shadow-2xl border border-white/10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-400">Server Status:</span>
                <span className={`text-sm font-semibold ${serverStatus === 'healthy' ? 'text-green-400' : serverStatus === 'error' ? 'text-red-400' : 'text-yellow-400'}`}>
                  {serverStatus === 'healthy' ? '🟢 Online' : serverStatus === 'error' ? '🔴 Offline' : '🟡 Checking...'}
                </span>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-400">Connection:</span>
                <span className={`text-sm font-semibold ${getConnectionStatusColor()}`}>
                  {getConnectionStatusText()}
                </span>
              </div>
              <button 
                onClick={testSocketConnection}
                className="w-full mt-2 bg-gray-700 hover:bg-gray-600 text-white text-xs py-2 px-3 rounded transition-colors"
              >
                Test Connection
              </button>
            </div>

            {/* Game Options Card */}
            <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/10">
              <div className="space-y-4">
                {/* Create Room Button */}
                <Link 
                  to="/create" 
                  className={`w-full font-bold py-4 px-6 rounded-2xl transition-all duration-200 hover:scale-105 hover:shadow-lg flex items-center justify-center space-x-3 group ${
                    connectionStatus === 'connected' 
                      ? 'bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white shadow-primary-500/30'
                      : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  }`}
                  onClick={(e) => {
                    if (connectionStatus !== 'connected') {
                      e.preventDefault();
                      alert('Please wait for server connection');
                    }
                  }}
                >
                  <span className="text-2xl">🎮</span>
                  <span className="text-lg">Create New Room</span>
                  <span className="group-hover:translate-x-1 transition-transform">→</span>
                </Link>

                {/* Join Room Button */}
                <Link 
                  to="/join" 
                  className={`w-full font-bold py-4 px-6 rounded-2xl transition-all duration-200 hover:scale-105 hover:shadow-lg flex items-center justify-center space-x-3 group ${
                    connectionStatus === 'connected' 
                      ? 'bg-gradient-to-r from-game-accent to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-red-500/30'
                      : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  }`}
                  onClick={(e) => {
                    if (connectionStatus !== 'connected') {
                      e.preventDefault();
                      alert('Please wait for server connection');
                    }
                  }}
                >
                  <span className="text-2xl">🔐</span>
                  <span className="text-lg">Join with Code</span>
                  <span className="group-hover:translate-x-1 transition-transform">→</span>
                </Link>
              </div>

              {/* Game Stats */}
              <div className="mt-8 pt-6 border-t border-white/20">
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div className="bg-white/10 p-4 rounded-xl">
                    <div className="text-2xl font-bold text-primary-400">4-10</div>
                    <div className="text-xs text-gray-400">Players</div>
                  </div>
                  <div className="bg-white/10 p-4 rounded-xl">
                    <div className="text-2xl font-bold text-game-accent">5-10</div>
                    <div className="text-xs text-gray-400">Minutes</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Public Room Lobby */}
          <div className="space-y-4">
            <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-6 shadow-2xl border border-white/10">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white flex items-center space-x-2">
                  <span>🌐</span>
                  <span>Public Rooms</span>
                </h2>
                <div className="text-sm text-gray-400">
                  {loadingRooms ? 'Refreshing...' : `${publicRooms.length} rooms`}
                </div>
              </div>

              <div className="space-y-3 max-h-96 overflow-y-auto hide-scrollbar">
                {loadingRooms ? (
                  <div className="text-center py-8">
                    <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-400">Loading rooms...</p>
                  </div>
                ) : publicRooms.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-4xl mb-4">🏠</div>
                    <p className="text-gray-400 mb-2">No public rooms available</p>
                    <p className="text-sm text-gray-500">Be the first to create one!</p>
                  </div>
                ) : (
                  publicRooms.map((room) => (
                    <div 
                      key={room.id}
                      className="bg-white/10 rounded-2xl p-4 hover:bg-white/15 transition-all duration-200 cursor-pointer border border-white/10 hover:border-white/20"
                      onClick={() => handleJoinPublicRoom(room)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-1">
                            <h3 className="font-semibold text-white truncate">
                              {room.name || `Room ${room.code}`}
                            </h3>
                            {room.themeMode && (
                              <span className="bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded text-xs">
                                Theme
                              </span>
                            )}
                          </div>
                          <div className="flex items-center space-x-4 text-sm text-gray-400">
                            <span className="flex items-center space-x-1">
                              <span>👥</span>
                              <span>{room.playerCount}/{room.maxPlayers}</span>
                            </span>
                            <span className="flex items-center space-x-1">
                              <span>⏰</span>
                              <span>{formatTimeAgo(room.createdAt)}</span>
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className={`w-3 h-3 rounded-full ${room.playerCount >= room.maxPlayers ? 'bg-red-400' : 'bg-green-400'}`}></div>
                          <span className="text-2xl">→</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {publicRooms.length > 0 && (
                <div className="mt-4 pt-4 border-t border-white/20">
                  <p className="text-xs text-gray-400 text-center">
                    Click any room to join instantly • Updates every 10 seconds
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* How to Play */}
        <div className="mt-8 text-center">
          <button 
            className="text-gray-400 hover:text-white text-sm underline transition-colors"
            onClick={() => {
              // TODO: Open how to play modal
              alert('How to play guide coming soon!');
            }}
          >
            How to Play? 🤔
          </button>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-gray-500">
          <p>Version 1.0 • Built with ❤️</p>
          <p className="mt-1">
            Backend: {serverStatus === 'healthy' ? '✅' : '❌'} | 
            Socket: {connectionStatus === 'connected' ? '✅' : '❌'}
          </p>
        </div>
      </div>

      {/* Join Room Modal */}
      {showJoinModal && selectedRoom && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-8 max-w-md w-full border border-white/20">
            <h3 className="text-2xl font-bold text-white mb-4 text-center">
              Join "{selectedRoom.name || `Room ${selectedRoom.code}`}"
            </h3>
            
            <div className="mb-6 p-4 bg-white/5 rounded-2xl">
              <div className="grid grid-cols-2 gap-4 text-center text-sm">
                <div>
                  <div className="text-white font-semibold">Players</div>
                  <div className="text-gray-400">{selectedRoom.playerCount}/{selectedRoom.maxPlayers}</div>
                </div>
                <div>
                  <div className="text-white font-semibold">Mode</div>
                  <div className="text-gray-400">{selectedRoom.themeMode ? 'Theme' : 'Custom'}</div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your name"
                className="w-full bg-white/10 border border-white/20 text-white px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 placeholder-gray-400"
                maxLength={30}
                disabled={joiningRoom}
              />
              
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowJoinModal(false)}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-3 px-4 rounded-xl font-semibold transition-colors"
                  disabled={joiningRoom}
                >
                  Cancel
                </button>
                <button
                  onClick={handleQuickJoin}
                  disabled={!playerName.trim() || joiningRoom || connectionStatus !== 'connected'}
                  className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-all duration-200 ${
                    !playerName.trim() || joiningRoom || connectionStatus !== 'connected'
                      ? 'bg-gray-600 cursor-not-allowed opacity-50'
                      : 'bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white'
                  }`}
                >
                  {joiningRoom ? 'Joining...' : 'Join Room'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomePage;