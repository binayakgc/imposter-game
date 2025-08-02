// client/src/pages/HomePage.tsx
// COMPLETE LOGOUT FIX - Ensures logout always works with multiple fallback methods

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
      console.log('🔄 Auth state changed:', user);
      setCurrentUser(user);
      setIsLoading(false);
      
      if (user) {
        // Connect socket with authentication
        connectSocketWithAuth(user);
        // Load public rooms
        loadPublicRooms();
      } else {
        // User logged out, redirect to login
        console.log('👤 No user, redirecting to login...');
        navigate('/login', { replace: true });
      }
    });

    return unsubscribe;
  }, [navigate]);

  // ✅ FIXED: Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const userMenuElement = document.getElementById('user-menu');
      if (userMenuElement && !userMenuElement.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };

    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showUserMenu]);

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
      const response = await authService.authenticatedFetch('http://localhost:3001/api/rooms/public');
      const result = await response.json();

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

  /**
   * ✅ ENHANCED: Ultra-robust logout with multiple fallback methods
   */
  const handleLogout = async (event?: React.MouseEvent) => {
    // Prevent any default behavior
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    // Prevent double-clicks
    if (isLoggingOut) {
      console.log('🚫 Logout already in progress...');
      return;
    }

    console.log('🚪 LOGOUT INITIATED');
    setIsLoggingOut(true);
    setShowUserMenu(false); // Close menu immediately
    
    try {
      // Step 1: Disconnect socket first
      console.log('🔌 Disconnecting socket...');
      try {
        socketService.disconnect();
        console.log('✅ Socket disconnected');
      } catch (socketError) {
        console.warn('⚠️ Socket disconnect error:', socketError);
      }
      
      // Step 2: Call authService logout (this handles API call and localStorage cleanup)
      console.log('🌐 Calling authService.logout()...');
      await authService.logout();
      console.log('✅ authService.logout() completed');
      
      // Step 3: Additional cleanup (belt and suspenders approach)
      console.log('🧹 Additional cleanup...');
      
      // Clear any remaining local storage items
      try {
        localStorage.removeItem('authToken');
        localStorage.removeItem('authUser');
        sessionStorage.clear();
      } catch (storageError) {
        console.warn('⚠️ Storage cleanup error:', storageError);
      }
      
      // Step 4: Force state reset
      setCurrentUser(null);
      setPublicRooms([]);
      setError('');
      
      // Step 5: Force navigation (multiple methods for reliability)
      console.log('🔄 Forcing navigation to login...');
      
      // Method 1: React Router navigate
      navigate('/login', { replace: true });
      
      // Method 2: Backup navigation after short delay
      setTimeout(() => {
        if (window.location.pathname !== '/login') {
          console.log('🔄 Backup navigation triggered');
          window.location.href = '/login';
        }
      }, 500);
      
    } catch (error) {
      console.error('❌ Logout error:', error);
      
      // ULTIMATE FALLBACK: Nuclear option
      console.log('💥 NUCLEAR LOGOUT FALLBACK');
      
      try {
        // Clear all storage
        localStorage.clear();
        sessionStorage.clear();
        
        // Force page reload to login
        window.location.href = '/login';
      } catch (fallbackError) {
        console.error('💀 Even fallback failed:', fallbackError);
        // Last resort: reload entire page
        window.location.reload();
      }
      
    } finally {
      // Always reset loading state
      setTimeout(() => {
        setIsLoggingOut(false);
      }, 1000);
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
                <h1 className="text-xl font-bold text-white">Imposter Game</h1>
                <p className="text-xs text-gray-400">Find the imposter!</p>
              </div>
            </div>

            {/* User Menu */}
            {currentUser && (
              <div className="relative" id="user-menu">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  disabled={isLoggingOut}
                  className="flex items-center space-x-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl px-3 py-2 transition-all duration-200 disabled:opacity-50"
                >
                  <div className="w-8 h-8 bg-gradient-to-br from-green-400 to-green-500 rounded-lg flex items-center justify-center">
                    <span className="text-white font-bold text-sm">
                      {currentUser.avatar || currentUser.username.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="text-white font-medium">{currentUser.username}</span>
                  <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* ✅ ENHANCED: User Dropdown with better logout button */}
                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-64 bg-slate-800/95 backdrop-blur-xl border border-white/20 rounded-xl shadow-2xl z-50">
                    <div className="p-4 border-b border-white/10">
                      <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-green-500 rounded-xl flex items-center justify-center">
                          <span className="text-white font-bold">
                            {currentUser.avatar || currentUser.username.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-white font-semibold">{currentUser.username}</p>
                          <p className="text-gray-400 text-sm">{currentUser.email || 'No email'}</p>
                          <div className="flex items-center space-x-1 mt-1">
                            <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                            <span className="text-green-400 text-xs">Online</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="p-2">
                      {/* ✅ ENHANCED: Super robust logout button */}
                      <button
                        onClick={handleLogout}
                        onMouseDown={handleLogout} // Backup event
                        disabled={isLoggingOut}
                        className="w-full flex items-center space-x-3 px-3 py-3 text-red-400 hover:bg-red-500/10 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed group"
                        type="button"
                      >
                        {isLoggingOut ? (
                          <>
                            <div className="w-5 h-5 border-2 border-red-400 border-t-transparent rounded-full animate-spin"></div>
                            <span>Logging out...</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-5 h-5 group-hover:scale-110 transition-transform duration-200" 
                                 fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                            <span className="font-medium">Logout</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Welcome Section */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-primary-400 via-game-accent to-secondary-400 bg-clip-text text-transparent mb-4">
            Welcome back, {currentUser?.username}! 👋
          </h1>
          <p className="text-xl text-gray-300">
            Join a public room or create your own to start playing
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 max-w-md mx-auto mb-12">
          <Link
            to="/create-room"
            className="flex-1 bg-gradient-to-r from-game-accent to-red-600 hover:from-red-600 hover:to-red-700 text-white px-8 py-4 rounded-2xl font-bold text-lg transition-all duration-300 transform hover:scale-105 hover:shadow-2xl shadow-red-500/30 text-center"
          >
            <span className="flex items-center justify-center space-x-3">
              <span className="text-2xl">🏠</span>
              <span>Create Room</span>
            </span>
          </Link>
          
          <Link
            to="/join-room"
            className="flex-1 bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-600 hover:to-slate-700 text-white px-8 py-4 rounded-2xl font-bold text-lg transition-all duration-300 transform hover:scale-105 border border-white/20 text-center"
          >
            <span className="flex items-center justify-center space-x-3">
              <span className="text-2xl">🔗</span>
              <span>Join by Code</span>
            </span>
          </Link>
        </div>

        {/* Public Rooms Section */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/20 rounded-3xl overflow-hidden">
          <div className="flex justify-between items-center p-6 border-b border-white/10">
            <div className="flex items-center space-x-3">
              <span className="text-3xl">🌍</span>
              <h2 className="text-2xl font-bold text-white">Public Rooms</h2>
            </div>
            
            <button
              onClick={refreshRooms}
              disabled={loadingRooms}
              className="bg-primary-600 hover:bg-primary-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-xl transition-colors duration-200 flex items-center space-x-2"
            >
              <svg 
                className={`w-4 h-4 ${loadingRooms ? 'animate-spin' : ''}`} 
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Refresh</span>
            </button>
          </div>

          <div className="p-6">
            {/* Error Display */}
            {error && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                <p className="text-red-400">{error}</p>
              </div>
            )}

            {/* Loading State */}
            {loadingRooms ? (
              <div className="text-center py-12">
                <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-gray-400">Loading rooms...</p>
              </div>
            ) : (
              <>
                {/* Rooms List */}
                {publicRooms.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {publicRooms.map((room) => (
                      <div
                        key={room.id}
                        className="bg-white/5 border border-white/20 rounded-2xl p-6 hover:border-white/40 transition-all duration-200 hover:scale-105"
                      >
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h3 className="text-xl font-bold text-white mb-1">
                              {room.name || `Room ${room.code}`}
                            </h3>
                            <p className="text-gray-400 text-sm">Code: {room.code}</p>
                          </div>
                          
                          <div className="flex items-center space-x-1">
                            <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                            <span className="text-green-400 text-xs">Active</span>
                          </div>
                        </div>

                        <div className="space-y-2 mb-4">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-400">Players</span>
                            <span className="text-white">{room.playerCount}/{room.maxPlayers}</span>
                          </div>
                          
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-400">Theme Mode</span>
                            <span className="text-white">{room.themeMode ? 'On' : 'Off'}</span>
                          </div>
                          
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-400">Created</span>
                            <span className="text-white">{formatTimeAgo(room.createdAt)}</span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleJoinRoom(room.code)}
                          disabled={room.playerCount >= room.maxPlayers}
                          className={`w-full py-3 px-4 rounded-xl font-semibold transition-all duration-200 ${
                            room.playerCount >= room.maxPlayers
                              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                              : 'bg-primary-600 hover:bg-primary-700 text-white transform hover:scale-105'
                          }`}
                        >
                          {room.playerCount >= room.maxPlayers ? 'Room Full' : 'Join Room'}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="text-6xl mb-4">🏠</div>
                    <h3 className="text-xl font-bold text-white mb-2">No public rooms available</h3>
                    <p className="text-gray-400 mb-6">Be the first to create a public room!</p>
                    
                    <Link
                      to="/create-room"
                      className="inline-block bg-primary-600 hover:bg-primary-700 text-white px-6 py-3 rounded-xl font-semibold transition-colors duration-200"
                    >
                      Create Room
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default HomePage;