// client/src/pages/JoinRoom.tsx
// Join room by entering room code

import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import socketService from '../services/socket';

const JoinRoom: React.FC = () => {
  const navigate = useNavigate();
  const { code: urlCode } = useParams<{ code?: string }>();
  
  const [roomCode, setRoomCode] = useState(urlCode || '');
  const [playerName, setPlayerName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    console.log('🚪 JoinRoom component mounted');
    
    // Check initial connection status
    const initialStatus = socketService.isConnected();
    setIsConnected(initialStatus);
    
    // If not connected, try to connect
    if (!initialStatus) {
      socketService.connect('http://localhost:3001')
        .then(() => {
          console.log('✅ Connection successful in JoinRoom');
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

  const validateForm = (): string | null => {
    if (!roomCode.trim()) {
      return 'Room code is required';
    }
    if (roomCode.length !== 6) {
      return 'Room code must be 6 characters';
    }
    if (!playerName.trim()) {
      return 'Your name is required';
    }
    return null;
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
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
      // First check if room exists via REST API
      const response = await fetch(`http://localhost:3001/api/rooms/${roomCode.toUpperCase()}`);
      const result = await response.json();

      if (!response.ok) {
        setError(result.message || 'Room not found');
        setIsLoading(false);
        return;
      }

      const room = result.room;
      
      // Check if room is full
      if (room.playerCount >= room.maxPlayers) {
        setError('Room is full');
        setIsLoading(false);
        return;
      }

      // Check if room is active
      if (!room.isActive) {
        setError('Room is no longer active');
        setIsLoading(false);
        return;
      }

      // Join room via Socket.io
      console.log('🚪 Joining room via Socket.io:', { roomCode: roomCode.toUpperCase(), playerName });
      
      // Set up join response listener
      const handleRoomJoined = (data: any) => {
        console.log('✅ Room joined successfully:', data);
        if (data.success) {
          navigate(`/room/${roomCode.toUpperCase()}`);
        } else {
          setError(data.message || 'Failed to join room');
        }
        setIsLoading(false);
        socketService.off('room_joined', handleRoomJoined);
      };

      const handleJoinError = (error: any) => {
        console.error('❌ Join room error:', error);
        setError(error.message || 'Failed to join room');
        setIsLoading(false);
        socketService.off('room_joined', handleRoomJoined);
        socketService.off('error', handleJoinError);
      };

      socketService.on('room_joined', handleRoomJoined);
      socketService.on('error', handleJoinError);
      
      // Send join room request
      socketService.joinRoom(roomCode.toUpperCase(), playerName);

      // Timeout after 10 seconds
      setTimeout(() => {
        if (isLoading) {
          setError('Join request timed out');
          setIsLoading(false);
          socketService.off('room_joined', handleRoomJoined);
          socketService.off('error', handleJoinError);
        }
      }, 10000);

    } catch (error) {
      console.error('❌ Error joining room:', error);
      setError('Network error. Please check your connection.');
      setIsLoading(false);
    }
  };

  const handleGoBack = () => {
    navigate('/');
  };

  const formatRoomCode = (value: string) => {
    // Remove any non-alphanumeric characters and convert to uppercase
    const formatted = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    return formatted.substring(0, 6); // Limit to 6 characters
  };

  const retryConnection = async () => {
    setError(null);
    try {
      await socketService.connect('http://localhost:3001');
      setIsConnected(true);
    } catch (error) {
      console.error('❌ Retry failed:', error);
      setError('Connection retry failed');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-game-bg via-slate-900 to-game-surface flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-80 h-80 bg-game-accent/20 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -right-40 w-80 h-80 bg-primary-500/20 rounded-full blur-3xl"></div>
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
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-game-accent to-red-600 rounded-2xl mb-4 shadow-2xl">
              <span className="text-3xl">🚪</span>
            </div>
            <h1 className="text-4xl font-bold text-white mb-2 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              Join Room
            </h1>
            <p className="text-gray-400 text-lg">
              Enter the room code to join your friends
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
  );
};

export default JoinRoom;