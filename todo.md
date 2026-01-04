# Uni-Chat - Development Roadmap

## Project Status: Phase 3 Completed, Phase 4 In Progress

Last Updated: January 2026

---

## Completed Features

### Core Infrastructure
- [x] Flask backend with application factory pattern
- [x] MongoDB integration with PyMongo
- [x] Data models: User, Conversation, Message, LLMConfig, Folder
- [x] JWT authentication with access/refresh tokens
- [x] API routes: auth, chat, conversations, configs, gallery, folders, uploads, users, admin, models
- [x] WebSocket implementation with Flask-SocketIO for real-time streaming
- [x] OpenRouter service integration for multi-model AI access
- [x] Rate limiting with Flask-Limiter
- [x] File upload handling (images, documents)

### Frontend Application
- [x] React 18 + Vite + Tailwind CSS setup
- [x] Notion-inspired dark theme UI
- [x] Authentication pages (Login, Register) with validation
- [x] Main layout with responsive sidebar and header
- [x] Chat interface with real-time streaming support
- [x] Dashboard with usage stats and recent conversations
- [x] History page with search, archive, and delete
- [x] Configs page with CRUD operations
- [x] Gallery page with tabs (Community, Templates, Saved)
- [x] Settings page (Profile, Security, Preferences)
- [x] Admin dashboard, User management, Templates pages
- [x] React Query for server state management
- [x] Socket.IO client for real-time updates

### Phase 2: Bug Fixes & Polish (COMPLETED)
- [x] Fixed useMutation variable shadowing in GalleryPage (renamed to useConfigMutation)
- [x] Removed unused imports (Filter, Clock, Star) from GalleryPage and HistoryPage
- [x] Added toast notification for clipboard copy failures in ChatWindow
- [x] Added try-catch error handling with toast feedback for archive/delete in HistoryPage
- [x] Added loading skeleton with spinner to ChatPage when loading conversation
- [x] Added connection status feedback in SocketContext (toast on disconnect/reconnect)
- [x] Loading skeletons present in DashboardPage, HistoryPage, ConfigsPage, GalleryPage, SettingsPage
- [x] Form validation with feedback in LoginPage, RegisterPage, SettingsPage

### Phase 3: Features Enhancement (COMPLETED)
- [x] **Drag-and-Drop Folders**
  - Added @dnd-kit/core and @dnd-kit/sortable for drag-and-drop
  - Conversations can be dragged between folders in Sidebar
  - Visual feedback with highlight on drop targets
  - Files: Sidebar.jsx, package.json

- [x] **Conversation Search (Full-text in messages)**
  - Backend: Added /api/conversations/search/messages endpoint
  - Backend: Added search_in_conversations method to MessageModel
  - Frontend: Toggle between title search and message content search
  - Search results grouped by conversation with highlighted matches
  - Files: HistoryPage.jsx, conversations.py, message.py, chatService.js

- [x] **Message Editing**
  - Backend: Added PUT /api/chat/messages/<id> endpoint for editing
  - Backend: Edit history tracking with is_edited and edit_history fields
  - Backend: delete_after_message method for regeneration after edit
  - Frontend: Inline editor with Ctrl+Enter to save, Esc to cancel
  - Edit indicator icon on edited messages
  - Files: ChatWindow.jsx, ChatPage.jsx, chat.py, message.py

- [x] **Export Conversations**
  - Backend: Added /api/conversations/<id>/export endpoint
  - Export formats: Markdown (.md) and JSON (.json)
  - Optional metadata inclusion (timestamps, model info, tokens)
  - Frontend: Export dropdown in chat header with format selection
  - Files: ChatPage.jsx, conversations.py, chatService.js

- [x] **Image Generation Detection**
  - Backend: Added image detection in openrouter_service.py
  - Detects markdown images, direct URLs, and base64 data URIs
  - Added vision/image-generation model capability flags
  - Frontend: Enhanced MarkdownRenderer with image zoom, download, open in new tab
  - Loading states and error handling for images
  - Files: MarkdownRenderer.jsx, openrouter_service.py

- [x] **Keyboard Shortcuts**
  - Created useKeyboardShortcuts hook
  - Ctrl/Cmd + K: Open command palette (global search)
  - Ctrl/Cmd + N: New conversation
  - Ctrl/Cmd + ,: Open settings
  - Escape: Close modals/sidebar
  - ?: Show keyboard shortcuts help
  - Command palette with search across conversations, configs, and navigation
  - Files: useKeyboardShortcuts.js, CommandPalette.jsx, ShortcutsModal.jsx, MainLayout.jsx, Header.jsx

---

## In Progress

### Phase 4: Admin Features (IN PROGRESS)

**Analytics Dashboard (Backend Complete)**
- [x] Backend: Added /api/admin/analytics/timeseries endpoint
- [x] Time-series data: messages, users, conversations per day
- [x] Popular models statistics
- [ ] Frontend: Add Recharts for visualization
- [ ] Frontend: Date range selector
- Files: AdminDashboard.jsx, admin.py

**Cost Tracking**
- [ ] Create usage_logs model for cost tracking
- [ ] Log API costs per message in chat_events.py
- [ ] Add cost aggregation endpoints
- [ ] Show cost breakdown in admin dashboard
- [ ] Show user's cost in settings

**Audit Logging**
- [ ] Create AuditLog model
- [ ] Create audit_log decorator
- [ ] Log: user bans, password changes, role changes, deletions
- [ ] Create AuditLogPage in admin

**Per-User Rate Limiting**
- [ ] Add rate_limit field to User model
- [ ] Create per-user rate limit decorator
- [ ] Add rate limit controls in UserManagement

---

## Remaining Tasks

### Phase 1: Setup & Testing (FOR NEW DEVELOPERS)

Prerequisites:
- Python 3.8+ with pip
- Node.js 18+ with npm
- MongoDB (local or Atlas)
- OpenRouter API key

Backend Setup:
- [ ] Create Python virtual environment or Conda environment
- [ ] Install dependencies: pip install -r requirements.txt
- [ ] Copy .env.example to .env and configure:
  - SECRET_KEY - Random secure string
  - JWT_SECRET_KEY - Different random secure string
  - MONGO_URI - MongoDB connection string
  - OPENROUTER_API_KEY - Your OpenRouter API key
- [ ] Run backend: python run.py (starts on port 5000)

Frontend Setup:
- [ ] Install dependencies: npm install
- [ ] Run frontend: npm run dev (starts on port 3000)

Verification:
- [ ] Register a new account
- [ ] Create an AI configuration
- [ ] Test chat with streaming
- [ ] Verify WebSocket reconnection

---

### Phase 5: Mobile & Responsiveness

- Test and fix responsive breakpoints
- Optimize sidebar for mobile (overlay mode)
- Touch-friendly tap targets
- Swipe to open/close sidebar
- Swipe to archive conversations
- Pull to refresh
- Auto-resize input on mobile
- Handle keyboard appearance
- Optimize for thumb typing

---

### Phase 6: Production Readiness

- Separate configs for dev/staging/prod
- Environment variable validation
- Configure CORS for production domains
- Security headers (CSP, HSTS)
- Structured logging format
- Error tracking integration (Sentry-ready)
- Health check endpoint /api/health
- MongoDB index optimization
- OpenAPI/Swagger documentation

Note: Docker setup skipped per user request

---

### Phase 7: Performance

- Implement infinite scroll for messages
- Load messages on demand
- Configure React Query cache times
- Implement cache invalidation strategy
- Add optimistic updates
- Lazy load routes
- Dynamic imports for heavy components
- Analyze and optimize bundle size

---

## New Dependencies Added (Phase 3)

**Frontend (package.json):**
- @dnd-kit/core - Drag and drop
- @dnd-kit/sortable - Sortable drag and drop
- @dnd-kit/utilities - DnD utilities
- recharts - Analytics charts (for Phase 4)
- @use-gesture/react - Touch/swipe gestures
- react-intersection-observer - Infinite scroll

---

## New Files Created (Phase 3)

**Frontend:**
- src/hooks/useKeyboardShortcuts.js - Keyboard shortcuts hook
- src/components/layout/CommandPalette.jsx - Global search/command palette
- src/components/layout/ShortcutsModal.jsx - Keyboard shortcuts help modal

---

## Quick Commands

Backend:
  cd backend
  pip install -r requirements.txt
  cp .env.example .env
  python run.py

Frontend:
  cd frontend
  npm install
  npm run dev
  npm run build    # Production build
  npm run lint     # Check for issues

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| SECRET_KEY | Yes | - | Flask session secret |
| JWT_SECRET_KEY | Yes | - | JWT signing key |
| MONGO_URI | Yes | mongodb://localhost:27017/unichat | Database connection |
| OPENROUTER_API_KEY | Yes | - | AI API key |
| FLASK_DEBUG | No | False | Enable debug mode |
| FLASK_ENV | No | production | Environment name |

---

## Notes for Next Developer

1. File Sync Issue: The VS Code environment may cause file sync issues with the Edit tool. Use Python scripts or PowerShell for reliable file modifications.

2. Eventlet Version: The requirements.txt specifies eventlet==0.34.3 (updated from 0.34.0 which does not exist).

3. No TypeScript: The frontend uses JSX, not TypeScript. ESLint is configured but requires npm install first.

4. Dark Theme Only: Light theme option exists in settings but is not fully implemented.

5. Admin Account: First user is regular user. Admin role must be set manually in MongoDB.

6. WebSocket Proxy: Vite dev server proxies /socket.io to backend. Check vite.config.js if WebSocket issues occur.

7. Keyboard Shortcuts: Press ? to see all available shortcuts. Ctrl/Cmd+K opens the command palette.

8. Message Editing: Edit user messages by clicking the pencil icon. Ctrl+Enter saves, Escape cancels.

9. Export: Use the download button in chat header to export conversations as Markdown or JSON.

---

## Tech Stack Summary

- Frontend: React 18, Vite, Tailwind CSS, React Query, Socket.IO Client, @dnd-kit, Recharts
- Backend: Flask, Flask-SocketIO, Flask-JWT-Extended, PyMongo
- Database: MongoDB
- AI API: OpenRouter (supports GPT-4, Claude, and more)
