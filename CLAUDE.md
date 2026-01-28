# CLAUDE.md

## Quick Reference

| Task | Command |
|------|---------|
| Backend server | `cd backend && python run.py` (port 5000) |
| Frontend server | `cd frontend && npm run dev` (port 3000) |
| Run tests | `cd backend && conda activate uni-chat && pytest` |
| Build frontend | `cd frontend && npm run build` |
| Seed templates | `cd backend && python scripts/seed.py` |

---

## Project Overview

Uni-Chat is a full-stack AI chat app (Flask + React) using OpenRouter for multi-model access. Features: real-time streaming chat, image generation, workflow editor, and arena mode for side-by-side AI comparison.

---

## Architecture

### Backend (`backend/app/`)
```
├── models/          # MongoDB models (user, conversation, message, llm_config, etc.)
├── routes/          # API blueprints (/auth, /chat, /configs, /arena, /workflow, /canvas, etc.)
├── services/        # openrouter_service.py - API integration
├── sockets/         # Real-time events (chat_events, arena_events)
└── utils/           # decorators, helpers, error handlers
```

### Frontend (`frontend/src/`)
```
├── context/         # AuthContext (JWT), SocketContext (WebSocket)
├── services/        # API calls (chatService, arenaService, imageService, workflowService, canvasService)
├── pages/
│   ├── chat/
│   │   ├── ChatPage.jsx      # Main chat + CodeCanvas panel integration
│   │   └── hooks/            # useChatMessages, useChatStream, useChatBranches, useChatExport
│   ├── workflow/
│   │   ├── WorkflowPage.jsx  # Main workflow component
│   │   ├── components/       # Toolbar, Sidebar, Modal, HistoryPanel
│   │   └── hooks/            # useWorkflowState
│   ├── canvas/
│   │   ├── PublicCanvasPage.jsx  # Public view for shared canvases
│   │   └── MyCanvasesPage.jsx    # User's shared canvases management
│   └── ...                   # auth/, dashboard/, arena/, admin/
└── components/
    ├── chat/
    │   ├── ChatWindow.jsx    # Message rendering
    │   ├── MarkdownRenderer.jsx  # Markdown + code blocks with Run button
    │   └── CodeCanvas/       # Live code playground (CodeMirror + iframe)
    └── ...                   # layout/, config/, arena/, workflow/, common/
```

---

## Key Features

### Chat & Arena
- Socket.IO streaming with `send_message` → `message_chunk` → `message_complete`
- Arena mode: compare 2-4 AI configs in parallel using eventlet greenlets
- Vision support: attach images to chat with multimodal models
- **Conversation branching**: Create, switch, rename, delete branches from any message
- **Auto title generation**: Uses `google/gemini-2.5-flash-lite` to generate short titles (3-5 words) in the user's language

### Image Generation (`/image-studio`)
- Models: `bytedance-seed/seedream-4.5` (14 refs), `black-forest-labs/flux.2-flex` (5 refs)
- Text-to-image and image-to-image with reference images

### Workflow Editor (`/workflow`)
- React Flow canvas with `imageUpload` and `imageGen` node types
- Topological execution, save/load workflows, execution history
- Duplicate workflows, export/import as JSON
- 14 pre-built templates (run `python scripts/seed.py --workflows` to populate)
- Modular structure:
  - `pages/workflow/components/` - WorkflowToolbar, WorkflowSidebar, LoadWorkflowModal, RunHistoryPanel
  - `pages/workflow/hooks/useWorkflowState.js` - Workflow state management

### Code Canvas (in Chat)
- **Run button** on HTML/CSS/JS code blocks in chat messages
- Click "▶ Run" to open resizable side panel with live preview
- **Components** (`components/chat/CodeCanvas/`):
  - `index.jsx` - Main component with tabs, resizable panels (v4 API), share dialog
  - `CodeEditor.jsx` - CodeMirror editor with VS Code dark theme
  - `CodePreview.jsx` - Sandboxed iframe (`sandbox="allow-scripts"`)
  - `ConsolePanel.jsx` - Captures `console.log/warn/error/info`
  - `CodeCanvasPanel.jsx` - Resizable side panel (300-800px)
  - `ShareDialog.jsx` - Modal for sharing canvases publicly
- **Features**:
  - **Resizable editor/preview** - Drag handle between panels (react-resizable-panels v4)
  - **Collapsible editor** - Chevron button to collapse editor for full preview
  - **Public sharing** - Share canvases with public links (`/canvas/:shareId`)
  - **Fork canvases** - Logged-in users can fork public canvases
  - Auto-run preview (500ms debounce after typing)
  - Console output with error line numbers
  - Reset button to restore original code
- **Pages**:
  - `/canvas/:shareId` - Public canvas view (no auth required)
  - `/my-canvases` - Manage shared canvases (in sidebar under Library)
- **Backend**: `/api/canvas` routes + `shared_canvases` MongoDB collection
- **Security**: Uses `srcdoc` + `sandbox="allow-scripts"` (no `allow-same-origin`)
- **Dependencies**: `@uiw/react-codemirror`, `@uiw/codemirror-extensions-langs`, `@uiw/codemirror-theme-vscode`, `react-resizable-panels`

---

## Database (MongoDB)

Collections: `users`, `conversations`, `messages`, `llm_configs`, `folders`, `usage_logs`, `audit_logs`, `generated_images`, `arena_sessions`, `arena_messages`, `workflows`, `workflow_runs`, `shared_canvases`

---

## Environment Variables (`backend/.env`)
```
SECRET_KEY=<random>
JWT_SECRET_KEY=<random>
OPENROUTER_API_KEY=<key>
MONGO_URI=mongodb://localhost:27017/unichat
ADMIN_EMAIL=admin@admin.com
ADMIN_PASSWORD=admin123
```

---

## Common Patterns

### Adding Backend Route
1. Create `app/routes/new_route.py` with Blueprint
2. Register in `app/__init__.py`
3. Use `@jwt_required()` for protected endpoints

### Adding Socket Event
1. Add handler in `app/sockets/*_events.py`
2. Use `eventlet.spawn()` for parallel ops
3. **CRITICAL**: Do DB operations in main handler, not in greenlets (avoids app context errors)

### Adding Frontend Page
1. Create page in `src/pages/`
2. Add lazy import + Route in `App.jsx`
3. Add nav item in `Sidebar.jsx`

---

## Multi-Agent Development

### Workflow
```
USER REQUEST → ORCHESTRATOR (opus) → Plans & Delegates
                    ↓
    ┌───────────────┼───────────────┐
    ↓               ↓               ↓
BACKEND-AGENT   FRONTEND-AGENT   (parallel if independent)
  (sonnet)        (sonnet)
    ↓               ↓
  COMMIT          COMMIT
```

### Agent Selection
| Scenario | Agent | Why |
|----------|-------|-----|
| Multi-file feature across stack | `orchestrator` | Plans phases, delegates |
| Backend-only (API, models, sockets) | `backend-agent` | Direct, faster |
| Frontend-only (UI, services, styling) | `frontend-agent` | Direct, faster |
| Complex refactoring | `orchestrator` | Needs planning |
| Bug fix (known location) | Direct agent | No planning needed |

### Parallel vs Sequential
- **Parallel**: When backend & frontend work are independent (no API dependency)
- **Sequential**: When frontend needs backend API first → run backend → commit → then frontend

### Agent Files
| Agent | Location | Model |
|-------|----------|-------|
| Orchestrator | `.claude/agents/orchestrator.md` | Opus |
| Backend | `.claude/agents/backend-agent.md` | Sonnet |
| Frontend | `.claude/agents/frontend-agent.md` | Sonnet |

### Auto-Commit After Phase
```bash
git add -A && git commit -m "<type>: <description>" && git push
```
**Prefixes**: `backend:` | `frontend:` | `feat:` (full-stack) | `fix:` | `refactor:`

---

## Known Issues

### Flask Route Trailing Slash + JWT
**Problem**: Routes with `/` root path cause 401 errors due to trailing slash redirects losing JWT token.

```python
# BAD - causes 401
@blueprint.route('/', methods=['GET'])
@jwt_required()

# GOOD - works correctly
@blueprint.route('/list', methods=['GET'])
@jwt_required()
```

### Eventlet Greenlets + Flask App Context
**Problem**: DB operations in greenlets fail with "Working outside of application context".

**Solution**: Fetch data in main socket handler before spawning greenlets, pass pre-fetched data to greenlet, or wrap DB ops with `app.app_context()`.

### react-resizable-panels v4 Import Names
**Problem**: v4 changed export names, causing import errors if using old syntax.

```javascript
// v3 (OLD) - will fail with v4
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels'

// v4 (CORRECT)
import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels'
```

**Also changed**: `direction` prop → `orientation`, `ref` → `panelRef`

---

## Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS, React Query, Socket.IO, React Flow, CodeMirror 6, Lucide icons, react-resizable-panels v4
- **Backend**: Flask, Flask-SocketIO, Flask-JWT-Extended, PyMongo, Eventlet
- **Database**: MongoDB
- **AI**: OpenRouter API

---

## Testing

```bash
cd backend && conda activate uni-chat
pytest                          # Run all tests
pytest -v                       # Verbose
pytest --cov=app               # With coverage
```

Test database: `mongodb://localhost:27017/unichat_test`
