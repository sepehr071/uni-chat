# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Uni-Chat is a full-stack AI chat application with Flask backend and React frontend, using OpenRouter for multi-model AI access (GPT-4, Claude, Gemini, etc.).

## Commands

### Backend
```bash
cd backend
pip install -r requirements.txt
python run.py                      # Runs on http://localhost:5000
python scripts/setup_indexes.py    # MongoDB index optimization
```

### Frontend
```bash
cd frontend
npm install
npm run dev      # Dev server on http://localhost:3000
npm run build    # Production build
npm run lint     # ESLint check
```

### Required Environment Variables (backend/.env)
```
SECRET_KEY=<random-string>
JWT_SECRET_KEY=<different-random-string>
OPENROUTER_API_KEY=<your-api-key>
MONGO_URI=mongodb://localhost:27017/unichat

# Default Admin (created on startup)
ADMIN_EMAIL=admin@admin.com
ADMIN_PASSWORD=admin123
ADMIN_NAME=Administrator
```

## Architecture

### Backend Structure (Flask)
- **app/__init__.py**: App factory with blueprint registration
- **app/models/**: MongoDB document models (User, Conversation, Message, LLMConfig, Folder, UsageLog, AuditLog)
- **app/routes/**: REST API blueprints (auth, chat, conversations, configs, gallery, folders, uploads, users, admin, models, health)
- **app/services/openrouter_service.py**: OpenRouter API integration with streaming
- **app/sockets/chat_events.py**: WebSocket handlers for real-time chat streaming
- **app/utils/**: Decorators (@admin_required), audit logging, security headers

### Frontend Structure (React + Vite)
- **src/App.jsx**: Routes with React.lazy() for code splitting
- **src/context/**: AuthContext (JWT state), SocketContext (WebSocket state)
- **src/services/**: API abstractions with Axios interceptors for auto token refresh
- **src/pages/**: Dashboard pages, chat, auth, admin
- **src/components/**: Reusable UI components

### Real-time Chat Flow
1. User sends message via Socket.IO (`send_message` event)
2. Backend streams OpenRouter response as `message_chunk` events
3. `message_complete` event signals end with full message + metadata
4. New conversations get auto-generated titles via `x-ai/grok-4.1-fast` (async)

### AI-Powered Features
- **Auto Conversation Titles**: Generated asynchronously using fast LLM after first message
- **Prompt Enhancement**: "Enhance" button in ConfigEditor improves system prompts via LLM
- **Streaming**: SSE-based streaming with proper comment line handling

### State Management
- **Server state**: React Query (TanStack Query)
- **Auth state**: React Context with JWT in localStorage
- **WebSocket**: React Context with Socket.IO client

### API Proxy (Development)
Vite proxies `/api/*` and `/socket.io` to backend on port 5000.

## Key Patterns

### Authentication
- JWT access token (1 hour) + refresh token (30 days)
- Axios interceptor auto-refreshes on 401
- `@jwt_required()` decorator on protected routes

### Admin Routes
- `@admin_required` decorator checks `user.role == 'admin'`
- Default admin created on startup via `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars
- Or set manually: `db.users.updateOne({email: "..."}, {$set: {role: "admin"}})`

### File Uploads
- Max 16MB, allowed: png, jpg, jpeg, gif, pdf, doc, docx, txt
- Stored in `backend/uploads/`

## Claude Code Agents

Located in `.claude/agents/`:
- **orchestrator.md** (Opus): Plans complex multi-step features
- **backend-agent.md** (Sonnet): Flask/Python/MongoDB work
- **frontend-agent.md** (Sonnet): React/Vite/Tailwind work

## Tech Stack

**Frontend**: React 18, Vite, Tailwind CSS, React Query, Socket.IO Client, @dnd-kit, Recharts, Lucide icons

**Backend**: Flask, Flask-SocketIO, Flask-JWT-Extended, PyMongo, Eventlet, Flask-CORS, Flask-Limiter

**Database**: MongoDB

**AI**: OpenRouter API
