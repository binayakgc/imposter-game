// client/src/pages/HomePage.tsx
// Complete HomePage with authentication, user profile, and logout

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
      // Try to load via API with authentication
      const response = await authService.authenticatedFetch('http://localhost:3001/api/rooms/public');
      const result = await response.json();

      if (result.success && result.data) {
        setPublicRooms(result.data);
        console.log('📊 Loaded public rooms:', result.data.length);
      } else {
        setError(result.error || 'Failed to load rooms');
      }
    } catch (error) {
      console.error('❌ Error loading public rooms:', error);
      setError('Failed to connect to server');
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

  const handleLogout = async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    try {
      // Disconnect socket first
      socketService.disconnect();
      
      // Logout from auth service
      await authService.logout();
      
      // Navigation will be handled automatically by the auth state change
      console.log('✅ Logged out successfully');
    } catch (error) {
      console.error('Logout error:', error);
      // Force logout even if API call fails
      authService.logout();
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
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-80 h-80 bg-primary-500/20 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -right-40 w-80 h-80 bg-game-accent/20 rounded-full blur-3xl"></div>
      </div>

      {/* Header with User Menu */}
      <header className="relative z-10 p-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl flex items-center justify-center text-2xl">
              🎮
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Imposter Word Game</h1>
              <p className="text-gray-400 text-sm">Multiplayer Deception Game</p>
            </div>
          </div>

          {/* User Menu */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center space-x-3 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-xl px-4 py-2 border border-white/20 transition-all duration-200"
            >
              <div className="text-2xl">{currentUser?.avatar || '🎮'}</div>
              <div className="text-left">
                <p className="text-white font-medium">{currentUser?.username}</p>
                <p className="text-green-400 text-xs">● Online</p>
              </div>
              <span className="text-gray-400">▼</span>
            </button>

            {/* Dropdown Menu */}
            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-white/10 backdrop-blur-xl rounded-xl border border-white/20 shadow-2xl">
                <div className="p-4 border-b border-white/10">
                  <p className="text-white font-medium">{currentUser?.username}</p>
                  <p className="text-gray-400 text-sm">{currentUser?.email || 'No email'}</p>
                  <p className="text-green-400 text-xs mt-1">● Online</p>
                </div>
                <div className="p-2">
                  <button
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                    className="w-full text-left px-3 py-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoggingOut ? 'Logging out...' : '🚪 Logout'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="relative z-10 max-w-6xl mx-auto p-4">
        {/* Welcome Section */}
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-white mb-4">
            Welcome back, {currentUser?.username}! 👋
          </h2>
          <p className="text-gray-300 text-lg mb-8">
            Ready to play some mind games? Create or join a room to get started.
          </p>

          {/* Quick Actions */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link
              to="/create"
              className="bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white font-bold py-4 px-8 rounded-2xl transition-all duration-200 hover:scale-105 hover:shadow-xl shadow-primary-500/30"
            >
              🎯 Create New Room
            </Link>
            <Link
              to="/join"
              className="bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white font-semibold py-4 px-8 rounded-2xl transition-all duration-200 hover:scale-105"
            >
              🔍 Join by Code
            </Link>
          </div>
        </div>

        {/* Public Rooms Section */}
        <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/10">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-2xl font-bold text-white">🌐 Public Rooms</h3>
            <button
              onClick={refreshRooms}
              disabled={loadingRooms}
              className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingRooms ? '🔄' : '🔄'} Refresh
            </button>
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 mb-6">
              <p className="text-red-200 flex items-center space-x-2">
                <span>⚠️</span>
                <span>{error}</span>
              </p>
            </div>
          )}

          {loadingRooms ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-400">Loading rooms...</p>
            </div>
          ) : publicRooms.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🏠</div>
              <h4 className="text-xl font-semibold text-white mb-2">No Public Rooms</h4>
              <p className="text-gray-400 mb-6">Be the first to create a public room!</p>
              <Link
                to="/create"
                className="bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
              >
                Create Public Room
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {publicRooms.map((room) => (
                <div
                  key={room.id}
                  className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20 hover:border-primary-500/50 transition-all duration-200 hover:scale-105"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h4 className="text-lg font-semibold text-white truncate">
                        {room.name || `Room ${room.code}`}
                      </h4>
                      <p className="text-gray-400 text-sm font-mono">{room.code}</p>
                    </div>
                    <div className="text-2xl">🌐</div>
                  </div>

                  <div className="space-y-3 mb-6">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Players:</span>
                      <span className="text-white font-medium">
                        {room.playerCount}/{room.maxPlayers}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Mode:</span>
                      <span className="text-purple-400 font-medium">
                        {room.themeMode ? 'Theme' : 'Custom'}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Created:</span>
                      <span className="text-gray-300">{formatTimeAgo(room.createdAt)}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleJoinRoom(room.code)}
                    disabled={room.playerCount >= room.maxPlayers}
                    className={`w-full py-3 px-4 rounded-xl font-semibold transition-all duration-200 ${
                      room.playerCount >= room.maxPlayers
                        ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                        : 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white hover:scale-105'
                    }`}
                  >
                    {room.playerCount >= room.maxPlayers ? 'Room Full' : 'Join Room'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Game Rules Section */}
        <div className="mt-12 bg-white/5 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/10">
          <h3 className="text-2xl font-bold text-white mb-6 text-center">🎯 How to Play</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-4">
                👥
              </div>
              <h4 className="text-lg font-semibold text-white mb-2">1. Gather Players</h4>
              <p className="text-gray-400 text-sm">Need 4-10 players to start a game</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-4">
                🕵️
              </div>
              <h4 className="text-lg font-semibold text-white mb-2">2. Find the Imposter</h4>
              <p className="text-gray-400 text-sm">One player gets a different word</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-4">
                🏆
              </div>
              <h4 className="text-lg font-semibold text-white mb-2">3. Vote & Win</h4>
              <p className="text-gray-400 text-sm">Vote out the imposter to win</p>
            </div>
          </div>
        </div>
      </div>

      {/* Click outside to close user menu */}
      {showUserMenu && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setShowUserMenu(false)}
        />
      )}
    </div>
  );
};

export default HomePage;