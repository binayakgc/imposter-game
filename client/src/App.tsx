// client/src/App.tsx
// Main application component (FIXED VERSION)

import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './styles/globals.css';

// Import pages
import HomePage from './pages/HomePage';
import CreateRoom from './pages/CreateRoom';
import JoinRoom from './pages/JoinRoom';
import GameRoom from './pages/GameRoom';
import NotFound from './pages/NotFound';

const App: React.FC = () => {
  return (
    <Router>
      <div className="min-h-screen bg-game-bg">
        {/* Main app container */}
        <main className="min-h-screen">
          <Routes>
            {/* Home page */}
            <Route path="/" element={<HomePage />} />
            
            {/* Room management */}
            <Route path="/create" element={<CreateRoom />} />
            <Route path="/join" element={<JoinRoom />} />
            <Route path="/join/:code" element={<JoinRoom />} />
            
            {/* Game room */}
            <Route path="/room/:roomCode" element={<GameRoom />} />
            
            {/* 404 page */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
        
        {/* Global loading indicator - can be used later */}
        <div id="global-loading" className="hidden">
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-game-surface p-6 rounded-lg flex items-center space-x-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500"></div>
              <span className="text-white">Loading...</span>
            </div>
          </div>
        </div>
      </div>  
    </Router>
  );
};

export default App;