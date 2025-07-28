# Imposter Game - Complete Project Handoff Document

## Project Overview
**Game Type**: Professional multiplayer word game  
**Tech Stack**: TypeScript, React, Node.js, PostgreSQL, Socket.io, Prisma  
**Architecture**: Client-Server with real-time communication  
**Current Status**: Phase 2.2 Complete - Basic Express server running  

---

## Game Mechanics Summary
- **Multiplayer**: 4+ players minimum, room-based gameplay
- **Room Types**: Public (anyone can join) or Private (code-based)
- **Word Rotation**: Each player takes turns giving words
- **Imposter System**: One random player (including word giver) becomes imposter
- **Goal**: Regular players find imposter, Imposter guesses the word
- **Theme Toggle**: Optional categorized words vs player-submitted words

---

## Complete Folder Structure

```
imposter-game/
├── README.md (not created yet)
├── package.json (root config)
├── tsconfig.json (root TypeScript config)
├── .gitignore (configured)
├── .git/ (initialized repository)
│
├── server/ (Backend - Node.js + TypeScript)
│   ├── package.json (server dependencies)
│   ├── tsconfig.json (server TypeScript config)
│   ├── .env (environment variables - DATABASE_URL, PORT, etc.)
│   ├── prisma/
│   │   ├── schema.prisma (database schema)
│   │   └── migrations/ (database migrations)
│   └── src/
│       ├── config/
│       │   ├── environment.ts ✅ (env validation with zod)
│       │   └── database.ts ✅ (Prisma client setup)
│       ├── middleware/
│       │   ├── errorHandler.ts ✅ (comprehensive error handling)
│       │   └── validation.ts (not created yet)
│       ├── services/ (business logic layer)
│       │   ├── RoomService.ts (not created yet - NEXT)
│       │   ├── PlayerService.ts (not created yet - NEXT)
│       │   └── GameService.ts (not created yet - NEXT)
│       ├── routes/
│       │   ├── health.ts ✅ (health check endpoints)
│       │   ├── rooms.ts (not created yet)
│       │   ├── players.ts (not created yet)
│       │   └── games.ts (not created yet)
│       ├── utils/
│       │   └── logger.ts ✅ (professional logging)
│       ├── types/ (server-specific types)
│       └── server.ts ✅ (main Express server)
│
├── client/ (Frontend - React + TypeScript)
│   ├── package.json (client dependencies)
│   ├── tsconfig.json (client TypeScript config)
│   ├── vite.config.ts (Vite configuration)
│   ├── public/
│   │   └── index.html (not created yet)
│   └── src/
│       ├── components/ (React components - not created yet)
│       ├── pages/ (page components - not created yet)
│       ├── hooks/ (React hooks - not created yet)
│       ├── services/ (API calls - not created yet)
│       ├── store/ (state management - not created yet)
│       ├── types/ (client-specific types - not created yet)
│       ├── utils/ (client utilities - not created yet)
│       └── styles/ (CSS/styling - not created yet)
│
├── shared/ (Code shared between client and server)
│   ├── index.ts ✅ (main export)
│   ├── types/
│   │   ├── index.ts ✅ (type exports)
│   │   ├── Room.ts ✅ (room interfaces)
│   │   ├── Player.ts ✅ (player interfaces)
│   │   ├── Game.ts ✅ (game interfaces & enums)
│   │   └── Socket.ts ✅ (Socket.io event types)
│   └── constants/
│       └── index.ts ✅ (game config, error codes, etc.)
│
└── docs/ (documentation folder)
    └── (empty for now)
```

---

## What's Been Implemented (✅ = Complete)

### Phase 1: Environment Setup ✅
- Node.js, VS Code, Git, PostgreSQL installed
- Professional project structure created
- TypeScript configurations set up
- Dependencies installed and configured
- Prisma database schema created and migrated
- Git repository initialized with proper commits

### Phase 2.1: Shared TypeScript Types ✅
**Files Created:**
- `shared/types/Room.ts` - Room interfaces and API types
- `shared/types/Player.ts` - Player interfaces and game player types  
- `shared/types/Game.ts` - Game states, interfaces, voting types
- `shared/types/Socket.ts` - Socket.io event definitions
- `shared/constants/index.ts` - Game config, error codes, HTTP status
- `shared/types/index.ts` & `shared/index.ts` - Export files

### Phase 2.2: Basic Express Server ✅
**Files Created:**
- `server/src/config/environment.ts` - Environment validation with zod
- `server/src/config/database.ts` - Prisma client management
- `server/src/utils/logger.ts` - Professional logging with colors
- `server/src/middleware/errorHandler.ts` - Comprehensive error handling
- `server/src/routes/health.ts` - Health check endpoints
- `server/src/server.ts` - Main Express server with Socket.io

**Server Features Working:**
- TypeScript compilation ✅
- Database connection (PostgreSQL on port 5433) ✅
- Health endpoints (/api/health, /api/health/detailed) ✅
- Professional logging with timestamps ✅
- Error handling middleware ✅
- CORS, helmet, rate limiting ✅
- Socket.io foundation ✅

---

## Current Database Schema (PostgreSQL + Prisma)

```prisma
model Room {
  id          String   @id @default(cuid())
  code        String   @unique @db.VarChar(6)
  name        String?  @db.VarChar(50)
  isPublic    Boolean  @default(false)
  maxPlayers  Int      @default(10)
  themeMode   Boolean  @default(false)
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  players     Player[]
  games       Game[]
  @@map("rooms")
}

model Player {
  id          String   @id @default(cuid())
  name        String   @db.VarChar(30)
  roomId      String
  socketId    String?  @unique
  isHost      Boolean  @default(false)
  isOnline    Boolean  @default(true)
  joinedAt    DateTime @default(now())
  lastSeen    DateTime @default(now())

  room        Room     @relation(fields: [roomId], references: [id], onDelete: Cascade)
  @@map("players")
}

model Game {
  id              String      @id @default(cuid())
  roomId          String
  currentWord     String?     @db.VarChar(100)
  wordGiverId     String?
  imposterId      String?
  state           GameState   @default(WAITING)
  roundNumber     Int         @default(1)
  wordGiverQueue  String[]
  votes           Json?
  winner          String?
  createdAt       DateTime    @default(now())
  completedAt     DateTime?
  timeLimit       Int?

  room            Room        @relation(fields: [roomId], references: [id], onDelete: Cascade)
  @@map("games")
}

enum GameState {
  WAITING, WORD_SUBMISSION, DISCUSSION, VOTING, RESULTS, COMPLETED
}
```

---

## Environment Configuration

**File**: `server/.env`
```env
DATABASE_URL="postgresql://postgres:201222@localhost:5433/imposter_game"
PORT=3001
NODE_ENV=development
ALLOWED_ORIGINS="http://localhost:3000"
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

---

## Key Dependencies Installed

### Server Dependencies
```json
{
  "@prisma/client": "^5.0.0",
  "express": "^4.18.2",
  "socket.io": "^4.7.2",
  "cors": "^2.8.5",
  "dotenv": "^16.3.1",
  "helmet": "^7.0.0",
  "jsonwebtoken": "^9.0.1",
  "zod": "latest",
  "express-rate-limit": "latest"
}
```

### Client Dependencies  
```json
{
  "react": "^18.2.0",
  "react-dom": "^18.2.0",
  "react-router-dom": "^6.14.2",
  "socket.io-client": "^4.7.2"
}
```

---

## How to Continue Development

### Quick Start Commands
```bash
# Navigate to project
cd K:\imposter-game

# Start development server
cd server
npm run dev

# In another terminal, start client (when ready)
cd client  
npm run dev
```

### Next Immediate Tasks (Phase 2.3)
1. **Create Room Service** (`server/src/services/RoomService.ts`)
   - createRoom(), joinRoom(), getRooms(), generateRoomCode()
2. **Create Player Service** (`server/src/services/PlayerService.ts`)  
   - addPlayer(), removePlayer(), updatePlayer(), rotateWordGiver()
3. **Create Game Service** (`server/src/services/GameService.ts`)
   - startGame(), assignImposter(), submitWord(), handleVoting()
4. **Add API Routes** (`server/src/routes/rooms.ts`, etc.)
5. **Socket.io Implementation** (real-time events)

### Testing the Current State
```bash
# Health check
curl http://localhost:3001/api/health

# Detailed health  
curl http://localhost:3001/api/health/detailed

# Root endpoint
curl http://localhost:3001/
```

---

## Git Repository State

**Current Commits:**
```
48b112b - feat: add shared TypeScript types and constants
3e9fab4 - feat: complete Phase 1 setup  
963d271 - feat: initial project setup with professional structure
```

**To Resume Development:**
1. Clone/pull the repository
2. Install dependencies: `npm install` (root), `cd server && npm install`, `cd client && npm install`
3. Set up environment: Copy `.env.example` to `.env` and configure database
4. Run database migration: `cd server && npm run db:migrate`
5. Start development: `cd server && npm run dev`

---

## Important Notes for New Chat/Developer

1. **Database**: Uses PostgreSQL on port 5433 (not default 5432)
2. **TypeScript**: Strict configuration with shared types between client/server
3. **Architecture**: Clean separation with services, middleware, and routes
4. **Logging**: Professional logging system with colors and structured data
5. **Error Handling**: Comprehensive error middleware with proper HTTP codes
6. **Security**: CORS, Helmet, Rate limiting configured
7. **Code Quality**: Professional commit messages, proper Git workflow

---

## Project Location
- **Windows Path**: `K:\imposter-game`
- **Git**: Initialized and tracked
- **Database**: `imposter_game` on localhost:5433

---

*This document should be sufficient for any developer (or new Claude chat) to understand the current state and continue development from Phase 2.3 onwards.*