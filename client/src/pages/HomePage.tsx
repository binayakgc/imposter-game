// client/src/pages/HomePage.tsx
// Complete home page with public room lobby and Socket.io connection

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
  players?: Array<{
    id: string;
    name: string;
    isHost: boolean;
  }>;
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
    console.log('🏠 HomePage component mounted');
    
    // Test backend health
    testBackendHealth();
    
    // Connect to Socket.io server
    connectToServer();

    // Set up interval to refresh public rooms every 30 seconds
    const roomRefreshInterval = setInterval(() => {
      if (socketService.isConnected()) {
        console.log('🔄 Auto-refreshing public rooms...');
        loadPublicRooms();
      }
    }, 30000);

    // Cleanup on unmount
    return () => {
      console.log('🧹 HomePage component unmounting, cleaning up...');
      clearInterval(roomRefreshInterval);
      
      // Clean up socket listeners
      socketService.off('connected');
      socketService.off('disconnected');
      socketService.off('error');
      
      // Clean up the public rooms updated listener
      if ((socketService as any).socket) {
        (socketService as any).socket.off('public_rooms_updated');
      }
    };
  }, []);

  const testBackendHealth = async () => {
    console.log('🏥 Testing backend health...');
    try {
      const response = await fetch('http://localhost:3001/api/health');
      if (response.ok) {
        setServerStatus('healthy');
        console.log('✅ Backend health check passed');
      } else {
        setServerStatus('error');
        console.log('❌ Backend health check failed');
      }
    } catch (error) {
      console.error('❌ Backend health check failed:', error);
      setServerStatus('error');
    }
  };

  const connectToServer = async () => {
    console.log('🔌 Connecting to Socket.io server...');
    try {
      setConnectionStatus('connecting');
      await socketService.connect('http://localhost:3001');
      
      // Set up connection status listeners
      socketService.on('connected', () => {
        console.log('✅ Connected to game server');
        setConnectionStatus('connected');
        loadPublicRooms(); // Load rooms when connected
      });

      socketService.on('disconnected', () => {
        console.log('❌ Disconnected from game server');
        setConnectionStatus('disconnected');
      });

      socketService.on('error', (error) => {
        console.error('🚨 Socket error:', error);
        setConnectionStatus('disconnected');
      });

      // 🔧 CRITICAL: Listen for public room updates using direct socket access
      if ((socketService as any).socket) {
        (socketService as any).socket.on('public_rooms_updated', () => {
          console.log('📢 Received public_rooms_updated event, refreshing...');
          if (socketService.isConnected()) {
            loadPublicRooms();
          }
        });
      }

      // Check if already connected
      if (socketService.isConnected()) {
        setConnectionStatus('connected');
        loadPublicRooms();
      }

    } catch (error) {
      console.error('❌ Failed to connect to server:', error);
      setConnectionStatus('disconnected');
    }
  };

  const loadPublicRooms = async () => {
    console.log('📋 Loading public rooms...');
    
    if (socketService.isConnected()) {
      // Try Socket.io first
      await loadPublicRoomsViaSocket();
    } else {
      // Fallback to REST API
      await loadPublicRoomsViaREST();
    }
  };

  const loadPublicRoomsViaSocket = async () => {
    console.log('📡 Loading public rooms via Socket.io...');
    setLoadingRooms(true);
    
    try {
      const result = await new Promise<any>((resolve, reject) => {
        const handlePublicRooms = (data: any) => {
          console.log('📊 Received public rooms data:', data);
          // Clean up listeners
          if ((socketService as any).socket) {
            (socketService as any).socket.off('public_rooms', handlePublicRooms);
            (socketService as any).socket.off('error', handleError);
          }
          
          if (data.success) {
            resolve(data);
          } else {
            reject(new Error(data.message || 'Failed to load rooms'));
          }
        };

        const handleError = (error: any) => {
          console.error('❌ Socket error while loading rooms:', error);
          // Clean up listeners
          if ((socketService as any).socket) {
            (socketService as any).socket.off('public_rooms', handlePublicRooms);
            (socketService as any).socket.off('error', handleError);
          }
          reject(new Error(error.message || 'Connection error'));
        };

        // Set up listeners using the socket directly
        if ((socketService as any).socket) {
          (socketService as any).socket.on('public_rooms', handlePublicRooms);
          (socketService as any).socket.on('error', handleError);
        }
        
        // Emit request using existing method
        socketService.getPublicRooms();

        // Timeout after 5 seconds
        setTimeout(() => {
          if ((socketService as any).socket) {
            (socketService as any).socket.off('public_rooms', handlePublicRooms);
            (socketService as any).socket.off('error', handleError);
          }
          reject(new Error('Request timed out'));
        }, 5000);
      });

      setPublicRooms(result.rooms || []);
      console.log(`✅ Loaded ${result.rooms?.length || 0} public rooms via Socket.io`);
      
    } catch (error) {
      console.error('❌ Error loading via socket:', error);
      // Fallback to REST API
      await loadPublicRoomsViaREST();
    } finally {
      setLoadingRooms(false);
    }
  };

  const loadPublicRoomsViaREST = async () => {
    console.log('🌐 Loading public rooms via REST API...');
    setLoadingRooms(true);
    
    try {
      const response = await fetch('http://localhost:3001/api/rooms/public');
      if (response.ok) {
        const result = await response.json();
        setPublicRooms(result.rooms || []);
        console.log(`✅ Loaded ${result.rooms?.length || 0} public rooms via REST`);
      } else {
        console.error('❌ Failed to load public rooms via REST');
        setPublicRooms([]);
      }
    } catch (error) {
      console.error('❌ Error loading via REST:', error);
      setPublicRooms([]);
    } finally {
      setLoadingRooms(false);
    }
  };

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
    console.log('🧪 Testing socket connection...');
    if (socketService.isConnected()) {
      console.log('✅ Socket connection test successful');
      alert('Socket.io connection is working! Check console for details.');
    } else {
      console.log('❌ Socket not connected');
      alert('Socket.io not connected. Check console for errors.');
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const created = new Date(dateString);
    const diffMs = now.getTime() - created.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  const handleJoinPublicRoom = (room: PublicRoom) => {
    console.log('🎯 Attempting to join public room:', room.code);
    
    if (room.playerCount >= room.maxPlayers) {
      alert('This room is full!');
      return;
    }
    setSelectedRoom(room);
    setShowJoinModal(true);
  };

  const handleQuickJoin = async () => {
    if (!playerName.trim()) {
      alert('Please enter your name');
      return;
    }

    if (!selectedRoom) return;

    console.log(`🚀 Quick joining room ${selectedRoom.code} as ${playerName}`);
    setJoiningRoom(true);
    
    try {
      // Join room using existing socket event structure
      const result = await new Promise<any>((resolve, reject) => {
        const handleRoomJoined = (data: any) => {
          console.log('✅ Room joined successfully:', data);
          socketService.off('room_joined', handleRoomJoined);
          socketService.off('error', handleError);
          if (data.success) {
            resolve(data);
          } else {
            reject(new Error(data.message || 'Failed to join room'));
          }
        };

        const handleError = (error: any) => {
          console.error('❌ Error joining room:', error);
          socketService.off('room_joined', handleRoomJoined);
          socketService.off('error', handleError);
          reject(new Error(error.message || 'Connection error'));
        };

        socketService.on('room_joined', handleRoomJoined);
        socketService.on('error', handleError);

        // Emit join room event using existing structure
        socketService.emit('join_room', {
          roomCode: selectedRoom.code,
          playerName: playerName.trim()
        });

        setTimeout(() => {
          socketService.off('room_joined', handleRoomJoined);
          socketService.off('error', handleError);
          reject(new Error('Request timed out'));
        }, 10000);
      });

      // Success - navigate to room using existing route structure
      console.log(`🎉 Successfully joined room, navigating to /room/${selectedRoom.code}`);
      navigate(`/room/${selectedRoom.code}`);
      
    } catch (error: any) {
      console.error('❌ Failed to join room:', error);
      alert(`Failed to join room: ${error.message}`);
    } finally {
      setJoiningRoom(false);
      setShowJoinModal(false);
      setPlayerName('');
      setSelectedRoom(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-game-dark via-game-primary to-game-secondary relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-game-accent/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-3/4 left-1/2 w-64 h-64 bg-secondary-500/10 rounded-full blur-3xl animate-pulse delay-2000"></div>
      </div>

      <div className="relative z-10 container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-6xl font-bold bg-gradient-to-r from-primary-400 via-game-accent to-secondary-400 bg-clip-text text-transparent mb-4">
            🕵️ Imposter
          </h1>
          <p className="text-xl text-gray-300 mb-6">
            Multiplayer Word Game - Find the Imposter Among You!
          </p>
          
          {/* Enhanced Connection Status */}
          <div className="inline-flex items-center gap-4 px-6 py-3 bg-white/5 backdrop-blur-xl rounded-full border border-white/10">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${connectionStatus === 'connected' ? 'bg-green-400 animate-pulse' : connectionStatus === 'connecting' ? 'bg-yellow-400 animate-pulse' : 'bg-red-400'}`}></div>
              <span className={`text-sm ${getConnectionStatusColor()}`}>
                {getConnectionStatusText()}
              </span>
            </div>
            
            <div className="h-4 w-px bg-white/20"></div>
            
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">Server:</span>
              <span className={`text-sm ${serverStatus === 'healthy' ? 'text-green-400' : 'text-red-400'}`}>
                {serverStatus === 'healthy' ? '✅ Online' : '❌ Offline'}
              </span>
            </div>

            {/* Connection test button */}
            <button
              onClick={testSocketConnection}
              className="text-xs px-3 py-1 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
            >
              Test
            </button>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
          
          {/* Left Column - Game Actions */}
          <div className="lg:col-span-1">
            <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/10">
              <h2 className="text-2xl font-bold text-white mb-8 text-center">Game Actions</h2>
              
              {/* Create Room */}
              <div className="space-y-6">
                <Link
                  to="/create"
                  className={`group block w-full p-6 rounded-2xl transition-all duration-200 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                    connectionStatus === 'connected'
                      ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-green-500/30'
                      : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  }`}
                  onClick={(e) => {
                    if (connectionStatus !== 'connected') {
                      e.preventDefault();
                      alert('Please wait for server connection');
                    }
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-2xl">🎮</span>
                      <span className="text-lg font-semibold ml-3">Create New Room</span>
                    </div>
                    <span className="group-hover:translate-x-1 transition-transform">→</span>
                  </div>
                </Link>

                {/* Join by Code */}
                <Link
                  to="/join"
                  className={`group block w-full p-6 rounded-2xl transition-all duration-200 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                    connectionStatus === 'connected'
                      ? 'bg-gradient-to-r from-primary-600 to-blue-600 hover:from-primary-700 hover:to-blue-700 text-white shadow-primary-500/30'
                      : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  }`}
                  onClick={(e) => {
                    if (connectionStatus !== 'connected') {
                      e.preventDefault();
                      alert('Please wait for server connection');
                    }
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-2xl">🔐</span>
                      <span className="text-lg font-semibold ml-3">Join with Code</span>
                    </div>
                    <span className="group-hover:translate-x-1 transition-transform">→</span>
                  </div>
                </Link>

                {/* Quick Join */}
                <button
                  onClick={() => {
                    const availableRoom = publicRooms.find(room => room.playerCount < room.maxPlayers);
                    if (availableRoom) {
                      handleJoinPublicRoom(availableRoom);
                    } else {
                      alert('No available public rooms found. Create a new room or join by code!');
                    }
                  }}
                  disabled={connectionStatus !== 'connected' || publicRooms.length === 0}
                  className={`group w-full p-6 rounded-2xl transition-all duration-200 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-game-accent ${
                    connectionStatus === 'connected' && publicRooms.length > 0
                      ? 'bg-gradient-to-r from-game-accent to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-red-500/30'
                      : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-2xl">⚡</span>
                      <span className="text-lg font-semibold ml-3">Quick Join</span>
                    </div>
                    <span className="group-hover:translate-x-1 transition-transform">→</span>
                  </div>
                </button>
              </div>

              {/* Game Stats */}
              <div className="mt-8 pt-6 border-t border-white/20">
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div className="bg-white/10 p-4 rounded-xl">
                    <div className="text-2xl font-bold text-primary-400">{publicRooms.length}</div>
                    <div className="text-xs text-gray-400">Public Rooms</div>
                  </div>
                  <div className="bg-white/10 p-4 rounded-xl">
                    <div className="text-2xl font-bold text-game-accent">
                      {publicRooms.reduce((acc, room) => acc + (room.maxPlayers - room.playerCount), 0)}
                    </div>
                    <div className="text-xs text-gray-400">Open Slots</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Public Room Lobby */}
          <div className="lg:col-span-2">
            <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-6 shadow-2xl border border-white/10">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white flex items-center space-x-2">
                  <span>🌐</span>
                  <span>Public Rooms</span>
                </h2>
                <div className="flex items-center gap-4">
                  <div className="text-sm text-gray-400">
                    {loadingRooms ? 'Refreshing...' : `${publicRooms.length} rooms`}
                  </div>
                  <button
                    onClick={loadPublicRooms}
                    disabled={loadingRooms}
                    className="px-4 py-2 bg-white/10 hover:bg-white/20 disabled:bg-white/5 text-white text-sm rounded-lg transition-all duration-200 focus:outline-none"
                  >
                    {loadingRooms ? (
                      <span className="flex items-center gap-2">
                        <div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin"></div>
                        Refreshing...
                      </span>
                    ) : (
                      '🔄 Refresh'
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-3 max-h-96 overflow-y-auto hide-scrollbar">
                {loadingRooms && publicRooms.length === 0 ? (
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
                            {room.players && room.players.length > 0 && (
                              <span className="flex items-center space-x-1">
                                <span>👑</span>
                                <span>{room.players.find(p => p.isHost)?.name || 'Host'}</span>
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className={`w-3 h-3 rounded-full ${room.playerCount >= room.maxPlayers ? 'bg-red-400' : 'bg-green-400'} animate-pulse`}></div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleJoinPublicRoom(room);
                            }}
                            disabled={room.playerCount >= room.maxPlayers}
                            className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-200 ${
                              room.playerCount >= room.maxPlayers
                                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                                : 'bg-gradient-to-r from-primary-600 to-blue-600 hover:from-primary-700 hover:to-blue-700 text-white transform hover:scale-105'
                            }`}
                          >
                            {room.playerCount >= room.maxPlayers ? 'Full' : 'Join'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Lobby Footer */}
              <div className="mt-6 p-4 bg-white/5 rounded-lg border border-white/10">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">
                    💡 Public rooms are open to everyone - no code needed!
                  </span>
                  <span className="text-gray-500">
                    Auto-refresh: 30s | Real-time updates enabled
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Join Room Modal */}
      {showJoinModal && selectedRoom && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-game-surface/95 backdrop-blur-xl rounded-3xl p-8 max-w-md w-full border border-white/20 shadow-2xl">
            <div className="text-center mb-6">
              <h3 className="text-2xl font-bold text-white mb-2">Join Room</h3>
              <div className="text-lg text-gray-300 mb-1">
                {selectedRoom.name || `Room ${selectedRoom.code}`}
              </div>
              <div className="text-sm text-gray-400">
                {selectedRoom.playerCount}/{selectedRoom.maxPlayers} players • {selectedRoom.themeMode ? 'Theme' : 'Custom'}
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
                  onClick={() => {
                    setShowJoinModal(false);
                    setPlayerName('');
                    setSelectedRoom(null);
                  }}
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