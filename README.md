# Imposter Game 🎮

A professional multiplayer word game built with TypeScript, React, Node.js, and PostgreSQL.

## Game Overview

**Imposter** is a social deduction word game where players take turns giving words to the group. One random player becomes the "imposter" and receives a different word (or no word). The goal is for regular players to identify the imposter, while the imposter tries to guess the correct word.

### Key Features
- 🏠 **Room-based gameplay** - Public and private rooms with custom codes
- 👥 **4-10 players** - Scalable multiplayer experience  
- 🔄 **Player rotation** - Everyone gets a turn to give words
- 🎯 **Random imposter** - Even the word giver can be the imposter
- 🎨 **Theme modes** - Player-submitted words or categorized themes
- ⚡ **Real-time** - Powered by Socket.io for instant updates

## Tech Stack

### Backend
- **Node.js** + **TypeScript** - Server runtime and type safety
- **Express.js** - Web framework with professional middleware
- **Socket.io** - Real-time bidirectional communication
- **PostgreSQL** - Production-ready database
- **Prisma** - Type-safe database ORM
- **Zod** - Runtime type validation

### Frontend  
- **React** + **TypeScript** - Modern UI framework
- **Vite** - Fast development and build tool
- **Socket.io Client** - Real-time client connections
- **Tailwind CSS** - Utility-first styling (planned)

### Development
- **Professional Git workflow** - Feature branches and clean commits
- **Comprehensive error handling** - Structured error responses
- **Health monitoring** - Built-in health check endpoints
- **Professional logging** - Structured logs with colors and timestamps

## Quick Start

### Prerequisites
- Node.js (LTS version)
- PostgreSQL
- Git

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd imposter-game

# Install dependencies
npm install
cd server && npm install
cd ../client && npm install

# Set up environment
cp server/.env.example server/.env
# Edit server/.env with your database credentials

# Run database migrations
cd server
npm run db:migrate

# Start development servers
npm run dev  # Starts both server and client
```

### Development Commands

```bash
# Start both server and client
npm run dev

# Start only server (port 3001)
npm run server:dev

# Start only client (port 3000)  
npm run client:dev

# Run tests
npm test

# Build for production
npm run build
```

## API Endpoints

### Health Checks
- `GET /api/health` - Basic health status
- `GET /api/health/detailed` - Detailed system information
- `GET /api/health/ready` - Readiness probe (K8s compatible)
- `GET /api/health/live` - Liveness probe (K8s compatible)

### Game API (Coming Soon)
- `POST /api/rooms` - Create a new room
- `GET /api/rooms/public` - List public rooms
- `POST /api/rooms/:code/join` - Join a room
- `POST /api/games/start` - Start a game
- `POST /api/games/:id/word` - Submit a word
- `POST /api/games/:id/vote` - Submit a vote

## Game Rules

1. **Room Creation** - Host creates a public or private room
2. **Player Joining** - 4-10 players join using room code or public list
3. **Word Submission** - Selected player submits a secret word
4. **Role Assignment** - System randomly assigns one imposter
5. **Discussion Phase** - Players describe the word without saying it
6. **Voting Phase** - Players vote for who they think is the imposter
7. **Results** - Imposter wins by guessing the word, others win by finding imposter

## Development Status

- ✅ **Phase 1**: Development environment setup
- ✅ **Phase 2.1**: Shared TypeScript types and constants  
- ✅ **Phase 2.2**: Professional Express server with Socket.io
- 🔄 **Phase 2.3**: Database service layer (in progress)
- 📋 **Phase 2.4**: Socket.io real-time implementation
- 📋 **Phase 2.5**: REST API endpoints
- 📋 **Phase 3**: React frontend development
- 📋 **Phase 4**: Game logic integration
- 📋 **Phase 5**: UI/UX polish and testing
- 📋 **Phase 6**: Production deployment

## Project Structure

```
imposter-game/
├── server/          # Node.js + TypeScript backend
├── client/          # React + TypeScript frontend  
├── shared/          # Shared types and constants
├── docs/            # Detailed documentation
└── README.md        # This file
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Documentation

- 📋 [Project Status & Handoff Guide](docs/PROJECT_STATUS.md)
- 🔧 [Development Guide](docs/DEVELOPMENT.md) (coming soon)
- 📡 [API Documentation](docs/API.md) (coming soon)

## License

This project is private and proprietary.

---

**Built with ❤️ using modern web technologies**