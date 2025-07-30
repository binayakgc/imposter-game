// client/src/pages/CreateRoom.tsx
// Room creation page with proper public/private logic

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import socketService from '../services/socket';

interface CreateRoomForm {
  roomName: string;
  playerName: string;
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
  
  const [formData, setFormData] = useState<CreateRoomForm>({
    roomName: '',
    playerName: '',
    maxPlayers: 6,
    isPublic: true,
    themeMode: false,
  });

  useEffect(() => {
    console.log('🏗️ CreateRoom component mounted');
    
    // Check initial connection status
    const initialStatus = socketService.isConnected();
    setIsConnected(initialStatus);
    
    // If not connected, try to connect
    if (!initialStatus) {
      setConnectionAttempts(prev => prev + 1);
      
      socketService.connect('http://localhost:3001')
        .then(() => {
          console.log('✅ Connection successful in CreateRoom');
          setIsConnected(true);
          setError(null);
        })
        .catch((error) => {
          console.error('❌ Connection failed:', error);
          setIsConnected(false);
          setError('Unable to connect to game server');
        });
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
    if (!formData.playerName.trim()) {
      return 'Your name is required';
    }
    if (formData.maxPlayers < 4 || formData.maxPlayers > 10) {
      return 'Player count must be between 4 and 10';
    }
    return null;
  };

  const retryConnection = async () => {
    setConnectionAttempts(prev => prev + 1);
    setError(null);
    
    try {
      await socketService.connect('http://localhost:3001');
      setIsConnected(true);
    } catch (error) {
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

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('http://localhost:3001/api/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.roomName,
          maxPlayers: formData.maxPlayers,
          isPublic: formData.isPublic,
          themeMode: formData.themeMode,
          hostName: formData.playerName,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        console.log('✅ Room created successfully:', result.room);
        navigate(`/room/${result.room.code}`);
      } else {
        setError(result.message || 'Failed to create room');
      }
    } catch (error) {
      console.error('❌ Error creating room:', error);
      setError('Network error. Please check your connection.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoBack = () => {
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-game-bg via-slate-900 to-game-surface flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-80 h-80 bg-primary-500/20 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -right-40 w-80 h-80 bg-game-accent/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-60 h-60 bg-purple-500/10 rounded-full blur-3xl"></div>
      </div>

      <div className="relative max-w-lg w-full animate-fade-in">
        {/* Header */}
        <div className="text-center mb-8">
          <button
            onClick={handleGoBack}
            className="absolute -top-4 left-0 flex items-center space-x-2 text-gray-400 hover:text-white transition-all duration-200 hover:scale-105"
          >
            <span className="text-xl">←</span>
            <span className="font-medium">Back</span>
          </button>
          
          <div className="mb-6">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-primary-500 to-primary-600 rounded-2xl mb-4 shadow-2xl">
              <span className="text-3xl">🎮</span>
            </div>
            <h1 className="text-4xl font-bold text-white mb-2 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              Create New Room
            </h1>
            <p className="text-gray-400 text-lg">
              Set up your multiplayer game session
            </p>
          </div>
        </div>

        {/* Connection Status Card */}
        <div className={`mb-6 p-4 rounded-2xl backdrop-blur-xl border transition-all duration-300 ${
          isConnected 
            ? 'bg-green-500/10 border-green-500/30 shadow-green-500/20' 
            : 'bg-red-500/10 border-red-500/30 shadow-red-500/20'
        } shadow-2xl`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'} animate-pulse`}></div>
              <span className={`font-semibold ${isConnected ? 'text-green-300' : 'text-red-300'}`}>
                {isConnected ? 'Connected to server' : 'Not connected to server'}
              </span>
            </div>
            
            {!isConnected && (
              <button
                onClick={retryConnection}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-lg text-sm font-medium transition-colors"
              >
                Retry
              </button>
            )}
          </div>
          
          {!isConnected && connectionAttempts > 0 && (
            <p className="text-xs text-gray-400 mt-2">
              Connection attempts: {connectionAttempts}
            </p>
          )}
        </div>

        {/* Main Form Card */}
        <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/10">
          <form onSubmit={handleCreateRoom} className="space-y-6">
            {/* Error Message */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-300 p-4 rounded-2xl text-sm backdrop-blur-xl animate-slide-up">
                <div className="flex items-center space-x-2">
                  <span className="text-lg">⚠️</span>
                  <span>{error}</span>
                </div>
              </div>
            )}

            {/* Room Visibility Selection - Prominent */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white text-center">Room Type</h3>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleInputChange('isPublic', true)}
                  className={`p-4 rounded-2xl border-2 transition-all duration-200 ${
                    formData.isPublic
                      ? 'border-green-500 bg-green-500/20 text-white'
                      : 'border-white/20 bg-white/5 text-gray-400 hover:border-white/40'
                  }`}
                  disabled={isLoading}
                >
                  <div className="text-center">
                    <div className="text-2xl mb-2">🌐</div>
                    <div className="font-semibold mb-1">Public Room</div>
                    <div className="text-xs opacity-80">
                      Visible to everyone
                      <br />
                      No code needed
                    </div>
                  </div>
                </button>
                
                <button
                  type="button"
                  onClick={() => handleInputChange('isPublic', false)}
                  className={`p-4 rounded-2xl border-2 transition-all duration-200 ${
                    !formData.isPublic
                      ? 'border-yellow-500 bg-yellow-500/20 text-white'
                      : 'border-white/20 bg-white/5 text-gray-400 hover:border-white/40'
                  }`}
                  disabled={isLoading}
                >
                  <div className="text-center">
                    <div className="text-2xl mb-2">🔐</div>
                    <div className="font-semibold mb-1">Private Room</div>
                    <div className="text-xs opacity-80">
                      Invite only
                      <br />
                      Share code to join
                    </div>
                  </div>
                </button>
              </div>
              
              {/* Explanation */}
              <div className="bg-white/5 rounded-xl p-3">
                <p className="text-sm text-gray-300 text-center">
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

            {/* Player Name */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-200">
                Your Name
              </label>
              <input
                type="text"
                value={formData.playerName}
                onChange={(e) => handleInputChange('playerName', e.target.value)}
                placeholder="What should others call you?"
                className="w-full bg-white/10 backdrop-blur-xl border border-white/20 text-white px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 placeholder-gray-400"
                maxLength={30}
                disabled={isLoading}
              />
            </div>

            {/* Max Players */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-semibold text-gray-200">
                  Max Players
                </label>
                <span className="bg-primary-500/20 text-primary-300 px-3 py-1 rounded-full text-sm font-bold">
                  {formData.maxPlayers}
                </span>
              </div>
              <div className="relative">
                <input
                  type="range"
                  min={4}
                  max={10}
                  value={formData.maxPlayers}
                  onChange={(e) => handleInputChange('maxPlayers', parseInt(e.target.value))}
                  className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
                  disabled={isLoading}
                  style={{
                    background: `linear-gradient(to right, #0ea5e9 0%, #0ea5e9 ${((formData.maxPlayers - 4) / 6) * 100}%, rgba(255,255,255,0.2) ${((formData.maxPlayers - 4) / 6) * 100}%, rgba(255,255,255,0.2) 100%)`
                  }}
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>4 min</span>
                  <span>10 max</span>
                </div>
              </div>
            </div>

            {/* Advanced Settings Toggle */}
            <div className="pt-4">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center justify-between w-full text-left text-gray-300 hover:text-white transition-colors"
              >
                <span className="font-semibold">Game Settings</span>
                <span className={`transform transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`}>
                  ▼
                </span>
              </button>
            </div>

            {/* Advanced Settings */}
            {showAdvanced && (
              <div className="space-y-6 animate-slide-up">
                {/* Theme Mode Setting */}
                <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
                  <div className="flex-1">
                    <h3 className="font-semibold text-white mb-1">Theme Mode</h3>
                    <p className="text-sm text-gray-400">
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

            {/* Create Button */}
            <div className="pt-6">
              <button
                type="submit"
                disabled={!isConnected || isLoading}
                className={`w-full py-4 px-6 rounded-2xl font-bold text-white text-lg transition-all duration-300 transform ${
                  !isConnected || isLoading
                    ? 'bg-gray-600 cursor-not-allowed opacity-50'
                    : 'bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 hover:scale-105 hover:shadow-2xl shadow-primary-500/30'
                } ${isLoading ? 'animate-pulse' : ''}`}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center space-x-3">
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Creating Your Room...</span>
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
        </div>
      </div>
    </div>
  );
};

export default CreateRoom;