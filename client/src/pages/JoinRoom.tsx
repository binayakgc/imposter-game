// client/src/pages/JoinRoom.tsx
// Enhanced join room by code interface building on existing structure

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import socketService from '../services/socket';

const JoinRoom: React.FC = () => {
  const { code: urlCode } = useParams<{ code: string }>();
  const navigate = useNavigate();
  
  const [roomCode, setRoomCode] = useState(urlCode?.toUpperCase() || '');
  const [playerName, setPlayerName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionAttempts, setConnectionAttempts] = useState(0);

  useEffect(() => {
    // Monitor connection status
    const updateConnectionStatus = () => {
      setIsConnected(socketService.isConnected());
    };

    // Set up connection listeners
    socketService.on('connected', updateConnectionStatus);
    socketService.on('disconnected', updateConnectionStatus);
    
    // Initialize connection
    updateConnectionStatus();
    if (!socketService.isConnected()) {
      connectToServer();
    }

    // Clean up listeners
    return () => {
      socketService.off('connected', updateConnectionStatus);
      socketService.off('disconnected', updateConnectionStatus);
    };
  }, []);

  const connectToServer = async () => {
    try {
      setConnectionAttempts(prev => prev + 1);
      await socketService.connect('http://localhost:3001');
      setIsConnected(socketService.isConnected());
    } catch (error) {
      console.error('Failed to connect to server:', error);
      setIsConnected(false);
    }
  };

  const retryConnection = () => {
    connectToServer();
  };

  const formatRoomCode = (value: string): string => {
    return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!roomCode.trim()) {
      setError('Please enter a room code');
      return;
    }
    
    if (roomCode.length !== 6) {
      setError('Room code must be exactly 6 characters');
      return;
    }
    
    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }

    if (!isConnected) {
      setError('Not connected to server. Please wait...');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Join room using the existing socket event structure
      const result = await new Promise<any>((resolve, reject) => {
        // Set up success listener
        const handleRoomJoined = (data: any) => {
          socketService.off('room_joined', handleRoomJoined);
          socketService.off('error', handleError);
          if (data.success) {
            resolve(data);
          } else {
            reject(new Error(data.message || 'Failed to join room'));
          }
        };

        // Set up error listener
        const handleError = (error: any) => {
          socketService.off('room_joined', handleRoomJoined);
          socketService.off('error', handleError);
          reject(new Error(error.message || 'Connection error'));
        };

        socketService.on('room_joined', handleRoomJoined);
        socketService.on('error', handleError);

        // Emit join room event using existing structure
        socketService.emit('join_room', {
          roomCode: roomCode.trim(),
          playerName: playerName.trim()
        });

        // Timeout after 10 seconds
        setTimeout(() => {
          socketService.off('room_joined', handleRoomJoined);
          socketService.off('error', handleError);
          reject(new Error('Request timed out'));
        }, 10000);
      });

      // Success - navigate to game room using existing route structure
      navigate(`/room/${roomCode}`);
      
    } catch (error: any) {
      console.error('Error joining room:', error);
      setError(error.message || 'Failed to join room');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-game-dark via-game-primary to-game-secondary relative overflow-hidden">
      {/* Background Effects - matching existing design */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-game-accent/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-3/4 left-1/2 w-32 h-32 bg-secondary-500/20 rounded-full blur-3xl animate-pulse delay-2000"></div>
      </div>

      <div className="relative z-10 container mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-primary-400 via-game-accent to-secondary-400 bg-clip-text text-transparent mb-4">
            🕵️ Join Room
          </h1>
          <p className="text-xl text-gray-300 mb-2">
            {urlCode ? 'You\'ve been invited to join a room!' : 'Enter the room code to join your friends'}
          </p>
          {urlCode && (
            <p className="text-sm text-game-accent">
              Room code: {urlCode}
            </p>
          )}
        </div>

        <div className="max-w-md mx-auto">
          {/* Connection Status */}
          <div className={`mb-6 p-4 backdrop-blur-xl rounded-2xl border transition-all duration-300 ${
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
            <form onSubmit={handleJoinRoom} className="space-y-6">
              {/* Error Message */}
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-300 p-4 rounded-2xl text-sm backdrop-blur-xl animate-slide-up">
                  <div className="flex items-center space-x-2">
                    <span className="text-lg">⚠️</span>
                    <span>{error}</span>
                  </div>
                </div>
              )}

              {/* Room Code */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-200">
                  Room Code
                </label>
                <input
                  type="text"
                  value={roomCode}
                  onChange={(e) => {
                    const formatted = formatRoomCode(e.target.value);
                    setRoomCode(formatted);
                    setError(null);
                  }}
                  placeholder="Enter 6-character room code"
                  className="w-full bg-white/10 backdrop-blur-xl border border-white/20 text-white px-4 py-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-game-accent focus:border-transparent transition-all duration-200 placeholder-gray-400 text-center text-2xl font-mono tracking-widest"
                  maxLength={6}
                  disabled={isLoading}
                  style={{ letterSpacing: '0.3em' }}
                />
                <p className="text-xs text-gray-400 text-center">
                  Ask your friend for their 6-character room code
                </p>
              </div>

              {/* Player Name */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-200">
                  Your Name
                </label>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => {
                    setPlayerName(e.target.value);
                    setError(null);
                  }}
                  placeholder="What should others call you?"
                  className="w-full bg-white/10 backdrop-blur-xl border border-white/20 text-white px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-game-accent focus:border-transparent transition-all duration-200 placeholder-gray-400"
                  maxLength={30}
                  disabled={isLoading}
                />
              </div>

              {/* Join Button */}
              <div className="pt-6">
                <button
                  type="submit"
                  disabled={!isConnected || isLoading || !roomCode || !playerName}
                  className={`w-full py-4 px-6 rounded-2xl font-bold text-white text-lg transition-all duration-300 transform ${
                    !isConnected || isLoading || !roomCode || !playerName
                      ? 'bg-gray-600 cursor-not-allowed opacity-50'
                      : 'bg-gradient-to-r from-game-accent to-red-600 hover:from-red-600 hover:to-red-700 hover:scale-105 hover:shadow-2xl shadow-red-500/30'
                  } ${isLoading ? 'animate-pulse' : ''}`}
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center space-x-3">
                      <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Joining Room...</span>
                    </span>
                  ) : (
                    <span className="flex items-center justify-center space-x-3">
                      <span className="text-2xl">🚀</span>
                      <span>Join Room</span>
                    </span>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Navigation */}
          <div className="mt-8 text-center space-y-4">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors duration-200 text-sm"
            >
              ← Back to Home
            </Link>
            
            <div className="text-xs text-gray-500">
              Don't have a room code? <Link to="/create" className="text-primary-400 hover:text-primary-300">Create a new room</Link>
            </div>
          </div>

          {/* Tips */}
          <div className="mt-8 bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10">
            <h3 className="text-lg font-semibold text-white mb-3 flex items-center space-x-2">
              <span>💡</span>
              <span>Tips</span>
            </h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li>• Room codes are exactly 6 characters long</li>
              <li>• Ask your friend to share their room code with you</li>
              <li>• Make sure the room isn't full before joining</li>
              <li>• Private rooms require the exact code to join</li>
            </ul>
          </div>

          {/* Footer */}
          <div className="mt-8 text-center text-sm text-gray-500">
            <p>🔐 Need a room code? Ask your friend who created the room!</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JoinRoom;