// client/src/pages/CreateRoom.tsx
// FIXED VERSION - All TypeScript errors resolved

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import socketService from '../services/socket';
import authService, { User } from '../services/authService';

interface CreateRoomForm {
  roomName: string;
  maxPlayers: number;
  isPublic: boolean;
  themeMode: boolean;
}

const CreateRoom: React.FC = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  const [formData, setFormData] = useState<CreateRoomForm>({
    roomName: '',
    maxPlayers: 6,
    isPublic: true,
    themeMode: false,
  });

  useEffect(() => {
    console.log('🏗️ CreateRoom component mounted');
    
    // Get current authenticated user
    setCurrentUser(authService.getCurrentUser());
    
    // Check initial connection status
    const initialStatus = socketService.isConnected();
    setIsConnected(initialStatus);
    
    // If not connected, try to connect
    if (!initialStatus) {
      setConnectionAttempts(prev => prev + 1);
      
      // ✅ FIXED: socketService.connect returns void, not Promise
      try {
        socketService.connect('http://localhost:3001');
        console.log('✅ Connection successful in CreateRoom');
        setIsConnected(true);
        setError(null);
      } catch (error: any) {  // ✅ FIXED: Proper error typing
        console.error('❌ Connection failed:', error);
        setIsConnected(false);
        setError('Unable to connect to game server');
      }
    }
    
    // Set up event listeners
    const handleConnection = () => {
      setIsConnected(true);
      setError(null);
    };
    
    const handleDisconnection = () => {
      setIsConnected(false);
    };
    
    const handleError = (error: any) => {
      setError(error.message || 'Connection error');
      setIsConnected(false);
    };
    
    socketService.on('connected', handleConnection);
    socketService.on('disconnected', handleDisconnection);
    socketService.on('error', handleError);
    
    return () => {
      socketService.off('connected', handleConnection);
      socketService.off('disconnected', handleDisconnection);
      socketService.off('error', handleError);
    };
  }, []);

  // Periodically check connection status
  useEffect(() => {
    const interval = setInterval(() => {
      const currentStatus = socketService.isConnected();
      if (currentStatus !== isConnected) {
        setIsConnected(currentStatus);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isConnected]);

  const handleInputChange = (field: keyof CreateRoomForm, value: string | number | boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    setError(null);
  };

  const validateForm = (): string | null => {
    if (!formData.roomName.trim()) {
      return 'Room name is required';
    }
    if (formData.maxPlayers < 4 || formData.maxPlayers > 10) {
      return 'Player count must be between 4 and 10';
    }
    return null;
  };

  const retryConnection = () => {
    setConnectionAttempts(prev => prev + 1);
    setError(null);
    
    try {
      socketService.connect('http://localhost:3001');
      setIsConnected(true);
    } catch (error: any) {  // ✅ FIXED: Proper error typing
      console.error('❌ Retry failed:', error);
      setError('Connection retry failed');
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!isConnected) {
      setError('Not connected to server. Please wait and try again.');
      return;
    }

    if (!currentUser) {
      setError('You must be logged in to create a room.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await authService.authenticatedFetch('http://localhost:3001/api/rooms', {
        method: 'POST',
        body: JSON.stringify({
          name: formData.roomName,
          maxPlayers: formData.maxPlayers,
          isPublic: formData.isPublic,
          themeMode: formData.themeMode,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        console.log('✅ Room created successfully:', result.room);
        navigate(`/room/${result.room.code}`);
      } else {
        setError(result.error || 'Failed to create room');
      }
    } catch (error: any) {  // ✅ FIXED: Proper error typing
      console.error('❌ Error creating room:', error);
      setError('Network error. Please check your connection.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-game-bg via-slate-900 to-game-surface">
      {/* Header */}
      <header className="bg-white/10 backdrop-blur-xl border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <button
              onClick={() => navigate('/')}
              className="flex items-center space-x-3 text-white hover:text-primary-400 transition-colors duration-200"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="font-semibold">Back to Home</span>
            </button>

            {/* Connection Status */}
            <div className={`flex items-center space-x-2 px-4 py-2 rounded-xl ${
              isConnected 
                ? 'bg-green-500/20 border border-green-500/30' 
                : 'bg-red-500/20 border border-red-500/30'
            }`}>
              <div className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-green-400' : 'bg-red-400'
              }`}></div>
              <span className={`text-sm font-medium ${
                isConnected ? 'text-green-400' : 'text-red-400'
              }`}>
                {isConnected ? 'Connected to server' : 'Disconnected'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-4">Create New Room</h1>
          <p className="text-gray-300 text-lg">Set up your multiplayer game session</p>
          
          {currentUser && (
            <div className="mt-4 flex items-center justify-center space-x-2 text-gray-400">
              <span>Creating as:</span>
              <span className="text-primary-400 font-semibold">👑 {currentUser.username}</span>
              <span className="text-gray-500">(Host)</span>
            </div>
          )}
        </div>

        {/* Connection Error */}
        {!isConnected && (
          <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <span className="text-red-400 font-medium">Not connected to server</span>
              </div>
              <button
                onClick={retryConnection}
                className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-lg text-sm transition-colors duration-200"
              >
                Retry {connectionAttempts > 1 && `(${connectionAttempts})`}
              </button>
            </div>
          </div>
        )}

        {/* Form */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-2xl">
          <form onSubmit={handleCreateRoom} className="space-y-6">
            {/* Error Display */}
            {error && (
              <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-4">
                <div className="flex items-center space-x-2">
                  <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <span className="text-red-400 font-medium">{error}</span>
                </div>
              </div>
            )}

            {/* Room Type Selection */}
            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-white">Room Type</h3>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => handleInputChange('isPublic', true)}
                  className={`p-6 rounded-2xl border-2 transition-all duration-300 ${
                    formData.isPublic
                      ? 'border-green-500 bg-green-500/20 text-white'
                      : 'border-white/20 bg-white/5 text-gray-300 hover:border-white/40'
                  }`}
                  disabled={isLoading}
                >
                  <div className="text-4xl mb-3">🌐</div>
                  <h4 className="font-bold text-lg mb-2">Public Room</h4>
                  <p className="text-sm">Visible to everyone<br />No code needed</p>
                </button>
                
                <button
                  type="button"
                  onClick={() => handleInputChange('isPublic', false)}
                  className={`p-6 rounded-2xl border-2 transition-all duration-300 ${
                    !formData.isPublic
                      ? 'border-orange-500 bg-orange-500/20 text-white'
                      : 'border-white/20 bg-white/5 text-gray-300 hover:border-white/40'
                  }`}
                  disabled={isLoading}
                >
                  <div className="text-4xl mb-3">🔐</div>
                  <h4 className="font-bold text-lg mb-2">Private Room</h4>
                  <p className="text-sm">Invite only<br />Share code to join</p>
                </button>
              </div>
              
              <div className="text-center text-sm text-gray-400 bg-white/5 rounded-xl p-3">
                <p>
                  {formData.isPublic ? (
                    <>
                      <span className="text-green-400 font-semibold">Public rooms</span> appear in the lobby for anyone to join instantly
                    </>
                  ) : (
                    <>
                      <span className="text-yellow-400 font-semibold">Private rooms</span> require sharing your room code with friends
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* Room Name */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-200">
                Room Name
              </label>
              <input
                type="text"
                value={formData.roomName}
                onChange={(e) => handleInputChange('roomName', e.target.value)}
                placeholder="Enter a catchy room name..."
                className="w-full bg-white/10 backdrop-blur-xl border border-white/20 text-white px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 placeholder-gray-400"
                maxLength={50}
                disabled={isLoading}
              />
            </div>

            {/* Max Players Slider */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <label className="block text-sm font-semibold text-gray-200">
                  Max Players
                </label>
                <span className="text-primary-400 font-bold text-xl">{formData.maxPlayers}</span>
              </div>
              
              <div className="relative">
                <input
                  type="range"
                  min="4"
                  max="10"
                  step="1"
                  value={formData.maxPlayers}
                  onChange={(e) => handleInputChange('maxPlayers', parseInt(e.target.value))}
                  className="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                  disabled={isLoading}
                />
                <div className="flex justify-between text-xs text-gray-500 mt-2">
                  <span>4 min</span>
                  <span>10 max</span>
                </div>
              </div>
            </div>

            {/* Advanced Settings Toggle */}
            <div className="border-t border-white/10 pt-6">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center justify-between w-full text-left text-gray-200 hover:text-white transition-colors duration-200"
                disabled={isLoading}
              >
                <span className="text-sm font-semibold">Game Settings</span>
                <svg className={`w-5 h-5 transition-transform duration-300 ${showAdvanced ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showAdvanced && (
                <div className="mt-4 space-y-4 animate-fade-in">
                  {/* Theme Mode Toggle */}
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
                    <div className="flex-1">
                      <h4 className="text-white font-semibold">Theme Mode</h4>
                      <p className="text-gray-400 text-sm mt-1">
                        {formData.themeMode ? 'Use predefined word categories' : 'Players submit their own words'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleInputChange('themeMode', !formData.themeMode)}
                      className={`relative w-14 h-7 rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                        formData.themeMode ? 'bg-primary-600' : 'bg-gray-600'
                      }`}
                      disabled={isLoading}
                    >
                      <div className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow-lg transform transition-transform duration-300 ${
                        formData.themeMode ? 'translate-x-7' : 'translate-x-0'
                      }`}></div>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Create Button */}
            <div className="pt-6">
              <button
                type="submit"
                disabled={!isConnected || isLoading || !currentUser}
                className={`w-full py-4 px-6 rounded-2xl font-bold text-white text-lg transition-all duration-300 transform ${
                  !isConnected || isLoading || !currentUser
                    ? 'bg-gray-600 cursor-not-allowed opacity-50'
                    : 'bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 hover:scale-105 hover:shadow-2xl shadow-primary-500/30'
                } ${isLoading ? 'animate-pulse' : ''}`}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center space-x-3">
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Creating Your Room...</span>
                  </span>
                ) : !currentUser ? (
                  <span className="flex items-center justify-center space-x-3">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span>Login Required</span>
                  </span>
                ) : (
                  <span className="flex items-center justify-center space-x-3">
                    <span className="text-2xl">{formData.isPublic ? '🌐' : '🔐'}</span>
                    <span>Create {formData.isPublic ? 'Public' : 'Private'} Room</span>
                  </span>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-500">
          {formData.isPublic ? (
            <>
              <p>🌐 Your room will appear in the public lobby</p>
              <p className="mt-1">Anyone can join without a code!</p>
            </>
          ) : (
            <>
              <p>🔐 A unique room code will be generated</p>
              <p className="mt-1">Share it with friends to let them join!</p>
            </>
          )}
          
          {currentUser && (
            <p className="mt-3 text-primary-400">
              👑 You ({currentUser.username}) will be the room host
            </p>
          )}
        </div>
      </div>

      {/* ✅ FIXED: Removed <style jsx> and used regular CSS classes instead */}
      <style>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          height: 24px;
          width: 24px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
        }

        .slider::-moz-range-thumb {
          height: 24px;
          width: 24px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          border: none;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
        }

        .animate-fade-in {
          animation: fadeIn 0.3s ease-in-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default CreateRoom;