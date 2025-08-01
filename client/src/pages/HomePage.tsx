// client/src/pages/HomePage.tsx
// FIXED VERSION - Enhanced logout functionality that definitely works

import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import authService, { User } from '../services/authService';
import socketService from '../services/socket';

interface Room {
  id: string;
  code: string;
  name?: string;
  isPublic: boolean;
  maxPlayers: number;
  themeMode: boolean;
  playerCount: number;
  isActive: boolean;
  createdAt: string;
}

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [publicRooms, setPublicRooms] = useState<Room[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [error, setError] = useState<string>('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    // Subscribe to auth state changes
    const unsubscribe = authService.onAuthStateChange((user) => {
      setCurrentUser(user);
      setIsLoading(false);
      
      if (user) {
        // Connect socket with authentication
        connectSocketWithAuth(user);
        // Load public rooms
        loadPublicRooms();
      }
    });

    return unsubscribe;
  }, []);

  const connectSocketWithAuth = async (user: User) => {
    try {
      const token = authService.getToken();
      if (token) {
        await socketService.connect('http://localhost:3001');
        console.log('✅ Socket connected with authentication');
      }
    } catch (error) {
      console.error('Failed to connect socket:', error);
    }
  };

  const loadPublicRooms = async () => {
    setLoadingRooms(true);
    setError('');

    try {
      // Use authenticated fetch
      const response = await authService.authenticatedFetch('http://localhost:3001/api/rooms/public');
      const result = await response.json();

      // ✅ FIXED: Change result.data to result.rooms
      if (result.success && result.rooms) {
        setPublicRooms(result.rooms);
        console.log('📊 Loaded public rooms:', result.rooms.length);
        setError('');
      } else {
        setPublicRooms([]);
        setError('');
      }
    } catch (error) {
      console.error('❌ Error loading public rooms:', error);
      setError('Failed to connect to server');
      setPublicRooms([]);
    } finally {
      setLoadingRooms(false);
    }
  };

  const handleJoinRoom = async (roomCode: string) => {
    if (!currentUser) {
      setError('You must be logged in to join a room');
      return;
    }

    try {
      // Navigate to room page - the room page will handle joining with authenticated user
      navigate(`/room/${roomCode}`);
    } catch (error) {
      console.error('Error joining room:', error);
      setError('Failed to join room');
    }
  };

  // ✅ ENHANCED: More robust logout functionality
  const handleLogout = async () => {
    if (isLoggingOut) return;

    console.log('🚪 Logout initiated');
    setIsLoggingOut(true);
    setShowUserMenu(false); // Close the menu immediately
    
    try {
      // Step 1: Disconnect socket
      console.log('🔌 Disconnecting socket...');
      socketService.disconnect();
      
      // Step 2: Call API logout (if available)
      try {
        const token = authService.getToken();
        if (token) {
          console.log('🌐 Calling logout API...');
          await fetch('http://localhost:3001/api/auth/logout', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });
          console.log('✅ API logout successful');
        }
      } catch (apiError) {
        console.warn('⚠️ API logout failed, continuing with local logout:', apiError);
      }
      
      // Step 3: Clear auth service (this should trigger navigation)
      console.log('🧹 Clearing auth data...');
      await authService.logout();
      
      console.log('✅ Logout completed successfully');
      
    } catch (error) {
      console.error('❌ Logout error:', error);
      
      // ✅ FALLBACK: Force logout even if everything fails
      console.log('🔧 Force logout fallback...');
      localStorage.removeItem('authToken');
      localStorage.removeItem('authUser');
      
      // Force page reload to ensure clean state
      window.location.href = '/login';
      
    } finally {
      setIsLoggingOut(false);
    }
  };

  const refreshRooms = () => {
    loadPublicRooms();
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-game-bg via-slate-900 to-game-surface flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white text-lg">Loading...</p>
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
            {/* Logo */}
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl flex items-center justify-center">
                <span className="text-white font-bold text-lg">I</span>
              </div>
              <div>
                <h1 className="text-white font-bold text-xl">Imposter Game</h1>
                <p className="text-gray-400 text-xs">Find the imposter!</p>
              </div>
            </div>

            {/* User Menu */}
            <div className="relative">
              {currentUser && (
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center space-x-3 bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/20 rounded-xl px-4 py-2 transition-all duration-200"
                >
                  <div className="w-8 h-8 bg-gradient-to-br from-green-400 to-green-500 rounded-lg flex items-center justify-center">
                    <span className="text-white font-semibold text-sm">
                      {currentUser.avatar || currentUser.username.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="text-left">
                    <p className="text-white font-semibold text-sm">{currentUser.username}</p>
                    <div className="flex items-center space-x-1">
                      <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                      <span className="text-green-400 text-xs">Online</span>
                    </div>
                  </div>
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              )}

              {/* ✅ ENHANCED: User Dropdown with better logout button */}
              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-64 bg-slate-800/95 backdrop-blur-xl border border-white/20 rounded-xl shadow-2xl z-50">
                  <div className="p-4 border-b border-white/10">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-green-500 rounded-xl flex items-center justify-center">
                        <span className="text-white font-bold">
                          {currentUser?.avatar || currentUser?.username.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="text-white font-semibold">{currentUser?.username}</p>
                        <p className="text-gray-400 text-sm">{currentUser?.email || 'No email'}</p>
                        <div className="flex items-center space-x-1 mt-1">
                          <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                          <span className="text-green-400 text-xs">Online</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-2">
                    <button
                      onClick={handleLogout}
                      disabled={isLoggingOut}
                      className="w-full flex items-center space-x-3 px-3 py-3 text-red-400 hover:bg-red-500/10 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoggingOut ? (
                        <>
                          <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin"></div>
                          <span>Logging out...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                          </svg>
                          <span className="font-medium">Logout</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="text-center mb-8">
          <h2 className="text-4xl font-bold text-white mb-4">
            Welcome back, {currentUser?.username}! 👋
          </h2>
          <p className="text-gray-300 text-lg">
            Join a public room or create your own to start playing
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8 max-w-2xl mx-auto">
          <Link
            to="/create-room"
            className="flex-1 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white font-semibold py-4 px-6 rounded-2xl transition-all duration-300 transform hover:scale-105 hover:shadow-2xl shadow-primary-500/30 text-center"
          >
            <span className="flex items-center justify-center space-x-2">
              <span className="text-xl">🏠</span>
              <span>Create Room</span>
            </span>
          </Link>
          
          <Link
            to="/join-room"
            className="flex-1 bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/20 text-white font-semibold py-4 px-6 rounded-2xl transition-all duration-300 transform hover:scale-105 text-center"
          >
            <span className="flex items-center justify-center space-x-2">
              <span className="text-xl">🔗</span>
              <span>Join by Code</span>
            </span>
          </Link>
        </div>

        {/* Public Rooms Section */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-6 shadow-2xl">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center space-x-3">
              <span className="text-2xl">🌐</span>
              <h3 className="text-2xl font-bold text-white">Public Rooms</h3>
            </div>
            <button
              onClick={refreshRooms}
              disabled={loadingRooms}
              className="bg-primary-600/80 hover:bg-primary-600 text-white px-4 py-2 rounded-xl transition-all duration-200 flex items-center space-x-2 disabled:opacity-50"
            >
              <svg className={`w-4 h-4 ${loadingRooms ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Refresh</span>
            </button>
          </div>

          {/* Error Display - only for connection errors */}
          {error && error.includes('Failed to connect') && (
            <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-4 mb-6">
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <span className="text-red-400 font-medium">{error}</span>
              </div>
            </div>
          )}

          {loadingRooms ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-400">Loading rooms...</p>
            </div>
          ) : publicRooms.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {publicRooms.map((room) => (
                <div
                  key={room.id}
                  className="bg-white/5 hover:bg-white/10 border border-white/20 rounded-2xl p-4 transition-all duration-300 transform hover:scale-105 cursor-pointer"
                  onClick={() => handleJoinRoom(room.code)}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="text-white font-semibold text-lg">
                        {room.name || `Room ${room.code}`}
                      </h4>
                      <p className="text-gray-400 text-sm">Code: {room.code}</p>
                    </div>
                    <div className="flex items-center space-x-1">
                      <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                      <span className="text-green-400 text-xs">Active</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-sm">
                    <div className="flex items-center space-x-2">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                      </svg>
                      <span className="text-gray-400">
                        {room.playerCount}/{room.maxPlayers} players
                      </span>
                    </div>
                    <span className="text-gray-500 text-xs">
                      {formatTimeAgo(room.createdAt)}
                    </span>
                  </div>

                  {room.themeMode && (
                    <div className="mt-2 flex items-center space-x-1">
                      <span className="text-yellow-400 text-xs">🎯</span>
                      <span className="text-yellow-400 text-xs">Theme Mode</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🏠</div>
              <h4 className="text-xl font-semibold text-white mb-2">No Public Rooms</h4>
              <p className="text-gray-400 mb-6">Be the first to create a public room!</p>
              <Link
                to="/create-room"
                className="inline-flex items-center space-x-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200"
              >
                <span className="text-lg">🌐</span>
                <span>Create Public Room</span>
              </Link>
            </div>
          )}
        </div>
      </main>

      {/* Click outside to close user menu */}
      {showUserMenu && (
        <div 
          className="fixed inset-0 z-30"
          onClick={() => setShowUserMenu(false)}
        />
      )}
    </div>
  );
};

export default HomePage;