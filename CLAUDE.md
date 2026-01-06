# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Quick Reference

| Task | Command |
|------|---------|
| Backend dev server | `cd backend && python run.py` |
| Frontend dev server | `cd frontend && npm run dev` |
| Run backend tests | `cd backend && conda activate uni-chat && pytest` |
| Build frontend | `cd frontend && npm run build` |
| Lint frontend | `cd frontend && npm run lint` |

---

## Development Workflow

### Multi-Agent Development Pattern

For any feature that spans backend and frontend, use this workflow:

```
USER REQUEST
     │
     ▼
┌─────────────────────────────────────────────────┐
│              ORCHESTRATOR AGENT                  │
│  • Analyzes request                             │
│  • Creates phase plan                           │
│  • Identifies backend vs frontend work          │
└─────────────────────────────────────────────────┘
     │
     ├──────────────────┬──────────────────┐
     ▼                  ▼                  │
┌──────────────┐  ┌──────────────┐         │
│ BACKEND-AGENT│  │FRONTEND-AGENT│ (parallel if independent)
│ Flask/Python │  │ React/Vite   │         │
│ MongoDB      │  │ Tailwind CSS │         │
└──────────────┘  └──────────────┘         │
     │                  │                  │
     ▼                  ▼                  │
  COMMIT             COMMIT                │
  & PUSH             & PUSH                │
```

**Steps:**
1. **Orchestrator analyzes** → Breaks task into backend/frontend phases
2. **Backend phase** → `backend-agent` implements Flask/MongoDB changes
3. **Frontend phase** → `frontend-agent` implements React/Tailwind changes
4. **Parallel execution** → When phases are independent, run both agents simultaneously

### Auto-Commit After Each Phase

**IMPORTANT**: After completing each development phase, immediately commit and push:

```bash
git add -A && git commit -m "<type>: <description>" && git push
```

**Commit Type Prefixes:**
| Prefix | Use For |
|--------|---------|
| `backend:` | Flask routes, models, services, sockets |
| `frontend:` | React components, pages, services, styling |
| `feat:` | Full-stack features (both backend + frontend) |
| `fix:` | Bug fixes |
| `refactor:` | Code improvements without behavior change |
| `docs:` | Documentation only |
| `test:` | Test additions or modifications |

---

## Agent Usage Guide

### When to Use Each Agent

| Scenario | Agent | Reason |
|----------|-------|--------|
| Multi-file feature spanning stack | `orchestrator` | Plans phases, delegates work |
| Backend-only (API, models, sockets) | `backend-agent` | Direct implementation |
| Frontend-only (UI, services, styling) | `frontend-agent` | Direct implementation |
| Complex refactoring | `orchestrator` | Needs careful planning |
| Bug fix (known location) | Direct agent | Faster, no planning needed |

### Parallel Execution Guidelines

When backend and frontend work are **independent**:
- Launch both agents simultaneously in parallel
- Each works in isolation with its own context
- Commit separately when each completes

When work is **dependent** (frontend needs backend API first):
- Run backend-agent first → commit
- Then run frontend-agent → commit

### Agent Locations

| Agent | Location | Model | Purpose |
|-------|----------|-------|---------|
| Orchestrator | `.claude/agents/orchestrator.md` | Opus | Plans and coordinates |
| Backend | `.claude/agents/backend-agent.md` | Sonnet | Flask/Python specialist |
| Frontend | `.claude/agents/frontend-agent.md` | Sonnet | React/Vite specialist |

---

## Project Overview

Uni-Chat is a full-stack AI chat application with Flask backend and React frontend, using OpenRouter for multi-model AI access (GPT-4, Claude, Gemini, etc.). It features real-time streaming chat, image generation, and a multi-config arena for comparing AI responses side-by-side.

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
```
backend/app/
├── __init__.py              # App factory with blueprint registration
├── config.py                # Configuration settings
├── extensions.py            # Flask extensions (mongo, jwt, socketio)
├── models/
│   ├── user.py              # User authentication & profiles
│   ├── conversation.py      # Chat conversations
│   ├── message.py           # Chat messages
│   ├── llm_config.py        # AI configuration presets
│   ├── folder.py            # Conversation organization
│   ├── usage_log.py         # Token & cost tracking
│   ├── audit_log.py         # Admin audit trail
│   ├── generated_image.py   # AI-generated images
│   ├── arena_session.py     # Multi-config arena sessions
│   └── arena_message.py     # Arena chat messages
├── routes/
│   ├── auth.py              # /api/auth/* - Login, register, refresh
│   ├── chat.py              # /api/chat/* - Chat operations
│   ├── conversations.py     # /api/conversations/* - CRUD
│   ├── configs.py           # /api/configs/* - LLM presets
│   ├── gallery.py           # /api/gallery/* - Public configs
│   ├── folders.py           # /api/folders/* - Organization
│   ├── uploads.py           # /api/uploads/* - File uploads
│   ├── users.py             # /api/users/* - User profile
│   ├── admin.py             # /api/admin/* - Admin dashboard
│   ├── models.py            # /api/models/* - Available AI models
│   ├── health.py            # /api/health/* - Health checks
│   ├── image_generation.py  # /api/image-gen/* - Image generation
│   └── arena.py             # /api/arena/* - Arena sessions
├── services/
│   └── openrouter_service.py # OpenRouter API integration
├── sockets/
│   ├── __init__.py          # Socket event registration
│   ├── connection_events.py # Connect/disconnect handling
│   ├── chat_events.py       # Real-time chat streaming
│   └── arena_events.py      # Parallel arena streaming
└── utils/
    ├── decorators.py        # @admin_required
    ├── helpers.py           # serialize_doc, generate_title
    ├── errors.py            # Error handlers
    └── security_headers.py  # Security middleware
```

### Frontend Structure (React + Vite)
```
frontend/src/
├── App.jsx                  # Routes with React.lazy()
├── main.jsx                 # Entry point
├── context/
│   ├── AuthContext.jsx      # JWT authentication state
│   └── SocketContext.jsx    # WebSocket connection state
├── services/
│   ├── api.js               # Axios instance with interceptors
│   ├── chatService.js       # Chat & config API calls
│   ├── adminService.js      # Admin API calls
│   ├── imageService.js      # Image generation API
│   └── arenaService.js      # Arena session API
├── pages/
│   ├── auth/                # Login, Register
│   ├── chat/                # Main chat interface
│   ├── dashboard/           # Dashboard, History, Configs, Gallery, Settings, ImageStudio
│   ├── arena/               # Multi-config comparison
│   └── admin/               # Admin dashboard, Users, Templates, Audit
├── components/
│   ├── layout/              # MainLayout, Sidebar, Header
│   ├── chat/                # ChatWindow, MessageList, MessageInput
│   ├── config/              # ConfigEditor, ConfigCard
│   ├── arena/               # ArenaPanel, ArenaConfigSelector
│   └── common/              # Shared UI components
└── utils/
    └── cn.js                # Tailwind class merger
```

## Key Features

### 1. Real-time Chat
- User sends message via Socket.IO (`send_message` event)
- Backend streams OpenRouter response as `message_chunk` events
- `message_complete` event signals end with full message + metadata
- Auto-generated conversation titles via fast LLM

### 2. Image Generation (`/image-studio`)
- Generate images using Seedream 4.5 and Flux.2 Flex models
- Supports text-to-image (no reference images) and image-to-image editing (with reference images)
- Up to 14 reference images (Seedream) or 5 images (Flux)
- Negative prompts support
- History gallery with favorites

**Models:**
- `bytedance-seed/seedream-4.5` - $0.04/image, up to 14 reference images, 2048x2048 max
- `black-forest-labs/flux.2-flex` - Up to 5 reference images, 4MP resolution

**API Flow:**
```python
# Text-to-image (no reference images):
payload = {
    'model': 'bytedance-seed/seedream-4.5',
    'messages': [{'role': 'user', 'content': prompt}],
    'modalities': ['image', 'text']
}

# Image-to-image (with reference images):
payload = {
    'model': 'black-forest-labs/flux.2-flex',
    'messages': [{
        'role': 'user',
        'content': [
            {'type': 'text', 'text': prompt},
            {'type': 'image_url', 'image_url': {'url': 'data:image/png;base64,...'}},
            {'type': 'image_url', 'image_url': {'url': 'data:image/png;base64,...'}}
        ]
    }],
    'modalities': ['image', 'text']
}
# Response: choices[0].message.images[0].image_url.url = "data:image/png;base64,..."
```

### 3. Arena Mode (`/arena`)
- Compare 2-4 AI configs side-by-side
- Send same message to all configs simultaneously
- Parallel streaming responses using eventlet greenlets
- Full conversation history per config

**Socket Events:**
- `arena_send_message` - Send message to all configs
- `arena_message_start` - Generation started for a config
- `arena_message_chunk` - Streaming content chunk
- `arena_message_complete` - Generation finished
- `arena_stop_generation` - Cancel all generations

### 4. LLM Configurations
- Custom AI presets with model, system prompt, parameters
- Parameters: temperature, max_tokens, top_p, frequency_penalty, presence_penalty
- Avatar emoji selection
- "Enhance" button improves system prompts via LLM
- Share configs via Gallery

## State Management

- **Server state**: React Query (TanStack Query) with 5-min stale time
- **Auth state**: React Context with JWT in localStorage
- **WebSocket**: React Context with Socket.IO client

## Authentication

- JWT access token (1 hour) + refresh token (30 days)
- Axios interceptor auto-refreshes on 401
- `@jwt_required()` decorator on protected routes
- `@admin_required` decorator for admin-only routes

## Database Collections (MongoDB)

| Collection | Purpose |
|------------|---------|
| `users` | User accounts, profiles, usage stats |
| `conversations` | Chat conversations metadata |
| `messages` | Individual chat messages |
| `llm_configs` | AI configuration presets |
| `folders` | Conversation organization |
| `usage_logs` | Token usage & cost tracking |
| `audit_logs` | Admin action audit trail |
| `generated_images` | AI-generated image history |
| `arena_sessions` | Multi-config arena sessions |
| `arena_messages` | Arena chat messages |

## API Proxy (Development)

Vite proxies `/api/*` and `/socket.io` to backend on port 5000.

## File Uploads

- Max 16MB
- Allowed: png, jpg, jpeg, gif, pdf, doc, docx, txt
- Stored in `backend/uploads/`

## Claude Code Agents

Located in `.claude/agents/`:
- **orchestrator.md** (Opus): Plans complex multi-step features
- **backend-agent.md** (Sonnet): Flask/Python/MongoDB work
- **frontend-agent.md** (Sonnet): React/Vite/Tailwind work

## Tech Stack

**Frontend**: React 18, Vite, Tailwind CSS, React Query, Socket.IO Client, @dnd-kit, Recharts, Lucide icons, react-hot-toast

**Backend**: Flask, Flask-SocketIO, Flask-JWT-Extended, PyMongo, Eventlet, Flask-CORS, Flask-Limiter

**Database**: MongoDB

**AI**: OpenRouter API (multi-model access)

## Common Patterns

### Adding a New Route (Backend)
1. Create `app/routes/new_route.py` with Blueprint
2. Import and register in `app/__init__.py`
3. Add `@jwt_required()` for protected endpoints

### Adding a New Socket Event (Backend)
1. Add handler in appropriate `app/sockets/*_events.py`
2. Use `eventlet.spawn()` for parallel operations
3. Emit events with `socketio.emit(..., to=sid)`

### Adding a New Page (Frontend)
1. Create page in `src/pages/`
2. Add lazy import and Route in `App.jsx`
3. Add nav item in `Sidebar.jsx`
4. Create service functions in `src/services/`

### Adding a New Model (Backend)
1. Create `app/models/new_model.py` with static methods
2. Import in `app/models/__init__.py`
3. Use `serialize_doc()` helper for API responses

## Important Tips / Known Issues

### Flask Route Trailing Slash + JWT Issue
**CRITICAL**: When creating Flask Blueprint routes with `@jwt_required()`, avoid using `/` (root path) as it causes 401 UNAUTHORIZED errors due to trailing slash redirects losing the JWT token.

**Problem:**
```python
# BAD - causes 401 errors
@blueprint.route('/', methods=['GET'])
@jwt_required()
def get_items():
    ...
```

**Solution:** Use a named path instead:
```python
# GOOD - works correctly
@blueprint.route('/list', methods=['GET'])
@jwt_required()
def get_items():
    ...
```

This issue occurs because:
1. Frontend calls `/api/endpoint` (no trailing slash)
2. Flask redirects to `/api/endpoint/` (adds trailing slash)
3. During redirect, the Authorization header is lost
4. JWT validation fails with 401

## Testing

### Backend Tests

The backend uses pytest for comprehensive testing with the `uni-chat` conda environment.

**Test Structure:**
```
backend/tests/
├── conftest.py          # Shared fixtures (app, client, db, auth)
├── test_auth.py         # Authentication tests
└── pytest.ini           # Pytest configuration
```

**Running Tests:**
```bash
cd backend

# Activate conda environment
conda activate uni-chat

# Run all tests
pytest

# Run with verbose output
pytest -v

# Run specific test file
pytest tests/test_auth.py

# Run with coverage
pytest --cov=app --cov-report=html

# Run specific test
pytest tests/test_auth.py::TestAuthentication::test_login_success
```

**Writing Tests:**
- Use `@gmail.com` domains for test emails (strict email validation)
- Fixtures available: `app`, `client`, `db`, `test_user`, `admin_user`, `auth_headers`
- Database automatically cleaned between tests
- Test database: `mongodb://localhost:27017/unichat_test`

**Current Coverage:**
- Authentication: 6 tests (registration, login, validation)
- Target: 90%+ coverage for critical paths

### Seeding Test Data

**Prompt Templates:**
```bash
cd backend
conda activate uni-chat
python seed_templates_simple.py
```

This populates 32 professional prompt templates across 8 categories (product photography, advertisement, social media, lifestyle, hero banners, tech/SaaS, food/restaurant, fashion/apparel).
