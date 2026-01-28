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

Uni-Chat is a full-stack AI chat app (Flask + React) using OpenRouter for multi-model access. Features: real-time streaming chat, image generation, workflow editor, arena mode, debate mode, and knowledge vault.

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
├── constants/       # Shared constants (models.js - default quick models)
├── context/         # AuthContext (JWT), SocketContext (WebSocket)
├── services/        # API calls (chatService, arenaService, imageService, workflowService, canvasService, debateService, knowledgeService, knowledgeFolderService, aiPreferencesService)
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
  - **Branch options modal**: Two choices when branching:
    1. "Branch in this conversation" - Creates branch in current conversation (existing behavior)
    2. "Start new conversation" - Creates new conversation from branch point with copied messages
- **Auto title generation**: Uses `google/gemini-2.5-flash-lite` to generate short titles (3-5 words) in the user's language
- **Message actions UI**: Metadata left (model • tokens • time), actions right (copy, bookmark, regenerate, branch)
  - Actions hover-visible on desktop, always visible on mobile

### Image Generation (`/image-studio`)
- Models: `bytedance-seed/seedream-4.5` (14 refs), `black-forest-labs/flux.2-flex` (5 refs)
- Text-to-image and image-to-image with reference images

### Workflow Editor (`/workflow`)
- React Flow canvas with `imageUpload`, `imageGen`, `textInput`, and `aiAgent` node types
- Topological execution, save/load workflows, execution history
- Duplicate workflows, export/import as JSON
- 14 pre-built templates (run `python scripts/seed.py --workflows` to populate)
- **AI Agent Nodes** (v2.0): Chain LLMs in pipelines
  - `textInput` node: User-provided text input
  - `aiAgent` node: LLM processing with model selection, system/user prompts
  - Models: Gemini 3 Flash, Gemini 2.5 Flash Lite, Grok 4.1 Fast, GPT-5.2
  - Collapsible output preview with copy and full-view modal
- Modular structure:
  - `pages/workflow/components/` - WorkflowToolbar, WorkflowSidebar, LoadWorkflowModal, RunHistoryPanel
  - `pages/workflow/hooks/useWorkflowState.js` - Workflow state management
  - `components/workflow/TextInputNode.jsx`, `AIAgentNode.jsx` - New node types

### Debate Mode (`/debate`) - v2.3
- Multiple LLMs (2-5) discuss a topic in rounds
- Each debater sees all previous messages (shared context)
- Configurable rounds (0-5, where 0 = infinite)
- **Debate Settings** (v2.3):
  - **Thinking Type**: Logical (facts/data/math) | Balanced | Feeling (emotions/values/ethics)
  - **Response Length**: Short (2-3 paragraphs) | Balanced | Long (detailed analysis)
  - Settings inject custom instructions into debater prompts
- **Infinite rounds mode**: Debaters signal completion with `[DEBATE_CONCLUDED]` marker
  - Enhanced prompts encourage thorough exploration before concluding
  - Debate ends when ALL debaters conclude in the same round
  - Safety limit: Max 20 rounds even in infinite mode
  - Marker automatically stripped from displayed content
  - "Concluded" badge shown on debaters who signaled done
- **Auto-scroll toggle** (v2.3): Floating button to enable/disable auto-scroll to new rounds
- **Markdown rendering** (v2.3): Full markdown support in debater responses and judge verdict
- Judge LLM synthesizes final verdict after all rounds
- Real-time SSE streaming for responses
- Debate history with session replay
- **Backend**: `debate_session.py`, `debate_message.py` models, `debate_service.py`, SSE streaming
- **Frontend**: `DebatePage.jsx`, `DebateSetup.jsx`, `DebateArena.jsx`, `DebaterResponse.jsx`, `JudgeVerdict.jsx`

### Quick Models (Chat & Debate) - v2.3
- **5 default models** available without creating custom assistants:
  - Gemini 3 Flash (`google/gemini-3-flash-preview`)
  - Grok 4.1 Fast (`x-ai/grok-4.1-fast`)
  - Gemini 2.5 Lite (`google/gemini-2.5-flash-lite`)
  - GPT-5.2 (`openai/gpt-5.2`)
  - Claude Sonnet 4.5 (`anthropic/claude-sonnet-4.5`)
- **Chat**: "Quick Models" section at top of config selector dropdown
- **Debate**: Quick model buttons for adding debaters and selecting judge
- **Implementation**:
  - Config IDs prefixed with `quick:` (e.g., `quick:openai/gpt-5.2`)
  - `frontend/src/constants/models.js` - Model definitions and helpers
  - Backend `resolve_config()` helpers in chat and debate routes

### Knowledge Vault (`/knowledge`) - v2.2
- Bookmark valuable AI responses from chat/arena/debate
- **Folder organization**: Create folders with custom colors, move items between folders
- Tag system for additional organization
- Full-text search across saved items
- Favorites for quick access
- **Detail modal**: Click any knowledge item to view full content with markdown rendering
  - Copy to clipboard button
  - Edit item button
  - Full markdown support (headers, lists, code blocks, etc.)
- **Save button** in chat message actions (Bookmark icon)
- **Backend**: `knowledge_item.py`, `knowledge_folder.py` models, `/api/knowledge` and `/api/knowledge-folders` routes
- **Frontend**: `KnowledgePage.jsx`, `KnowledgeCard.jsx`, `KnowledgeDetailModal.jsx`, `KnowledgeFolderSidebar.jsx`, `CreateFolderModal.jsx`, `MoveToFolderModal.jsx`
- **Services**: `knowledgeService.js`, `knowledgeFolderService.js`

### Image History (`/image-history`) - NEW
- Dedicated page for viewing all generated images (previously only in Image Studio tab)
- Grid view with search by prompt
- Filter by favorites
- Bulk select and delete
- Pagination support
- Image zoom modal with download/favorite actions
- Accessible from sidebar under Library → Image History

### Global User Preferences (Settings → AI Preferences) - v2.0
- User info: name, language, expertise level
- AI behavior: tone (professional/friendly/casual), response style (concise/balanced/detailed)
- Custom instructions (free text, max 2000 chars)
- Toggle to enable/disable injection
- **Injected into ALL LLM calls** (chat, arena, debate, workflow)
- **Backend**: Extended `user.py` with `ai_preferences`, `OpenRouterService.build_enhanced_system_prompt()`
- **Frontend**: AI Preferences tab in SettingsPage

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

### Sidebar Organization
```
HOME: Dashboard
CHAT: Chat, Arena, Debate
CREATE: Image Studio, Workflow
LIBRARY: Assistants, Gallery, Chat History, Image History, My Canvases, Knowledge Vault
SETTINGS: Settings
```
- **Chat History** (`/chat-history`): Conversation history with search (renamed from History)
- **Image History** (`/image-history`): Generated images gallery (new dedicated page)
- Old `/history` route redirects to `/chat-history` for backward compatibility

---

## Database (MongoDB)

Collections: `users`, `conversations`, `messages`, `llm_configs`, `folders`, `usage_logs`, `audit_logs`, `generated_images`, `arena_sessions`, `arena_messages`, `workflows`, `workflow_runs`, `shared_canvases`, `knowledge_items`, `knowledge_folders`, `debate_sessions`, `debate_messages`

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

- **Frontend**: React 18, Vite, Tailwind CSS, React Query, Socket.IO, React Flow, CodeMirror 6, Lucide icons, react-resizable-panels v4, shadcn/ui, Motion (Framer Motion)
- **Backend**: Flask, Flask-SocketIO, Flask-JWT-Extended, PyMongo, Eventlet
- **Database**: MongoDB
- **AI**: OpenRouter API

---

## UI Component Library (v2.5)

### shadcn/ui Integration
The project uses **shadcn/ui** (Radix UI + Tailwind) for accessible, consistent UI components.

**Available Components** (`frontend/src/components/ui/`):
- **Core**: Button, Input, Textarea, Label, Select, Checkbox, Switch, Slider
- **Layout**: Card, Separator, Tabs, Accordion, Collapsible
- **Feedback**: Badge, Progress, Skeleton, Alert (AlertDialog)
- **Overlay**: Dialog, Dropdown Menu, Tooltip, Popover, Sheet, Hover Card, Context Menu
- **Navigation**: Command, Toggle, Radio Group, Scroll Area

**Import Pattern**:
```jsx
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
```

**Path Alias**: `@/` maps to `frontend/src/` (configured in `vite.config.js` and `jsconfig.json`)

### Motion Animations
The project uses **Motion** (Framer Motion) for micro-interactions.

**Animation Presets** (`frontend/src/utils/animations.js`):
```jsx
import { buttonVariants, iconButtonVariants, fadeInUp, fastTransition } from '@/utils/animations'

<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={fastTransition}
>
```

### Component Usage Guidelines
1. **Prefer shadcn components** over custom HTML elements for buttons, inputs, modals, cards
2. **Use Motion** for entrance animations, hover effects, and transitions
3. **Tooltips**: Wrap icon buttons in `<Tooltip>` for accessibility
4. **Dialogs**: Use shadcn `Dialog` instead of custom modals
5. **Loading states**: Use `Skeleton` component for content placeholders

---

## Testing

```bash
cd backend && conda activate uni-chat
pytest                          # Run all tests
pytest -v                       # Verbose
pytest --cov=app               # With coverage
```

Test database: `mongodb://localhost:27017/unichat_test`
