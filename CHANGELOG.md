# Changelog

## [1.2.0] - 2026-01-28

### New Features
- **Code Canvas**: Live HTML/CSS/JS code playground integrated into chat
  - Run button on code blocks to open interactive preview
  - Resizable editor/preview panels with collapsible editor
  - Real-time preview with 500ms debounce
  - Console output panel capturing logs/warnings/errors
  - Public sharing feature with shareable links (`/canvas/:shareId`)
  - Fork functionality for logged-in users
  - Reset button to restore original code
- **My Canvases Page**: Manage shared canvases under Library in sidebar
- **Public Canvas View**: View shared canvases without authentication

### Improvements
- Simplified assistant config: removed max_tokens and top_p sliders
- Default temperature changed from 0.7 to 0.5
- Backend now uses model's max tokens by default

### Bug Fixes
- Code Canvas JS tab crash caused by `langs.javascript` API change in codemirror v4.25+
- Code Canvas preview not rendering complex HTML documents (like games)
  - Added DOMContentLoaded wrapper for proper DOM timing
  - Added escape handling for `</script>` and `</style>` in user code
  - Added `allow-same-origin` to iframe sandbox for full DOM manipulation

### Dependencies
- Added `@uiw/react-codemirror` ^4.25.4
- Added `@uiw/codemirror-extensions-langs` ^4.25.4
- Added `@uiw/codemirror-theme-vscode` ^4.25.4
- Added `react-resizable-panels` ^4.5.2

---

## [1.1.0] - 2026-01-27

### ✨ New Features
- **Branch Renaming**: Rename conversation branches via the branch selector dropdown
- **Auto Title Generation**: Conversations auto-titled using Gemini 2.5 Flash Lite
  - Titles match the language of the user's first message
  - Titles kept short (3-5 words)

### 🔧 Improvements
- **ChatPage Refactoring**: Extracted hooks from ChatPage.jsx (596 → 244 lines)
  - `useChatMessages` - Message state and edit/regenerate handlers
  - `useChatStream` - Streaming and send/stop handlers
  - `useChatBranches` - Branch management (create, switch, delete, rename)
  - `useChatExport` - Export functionality
- Title generation model: `x-ai/grok-4.1-fast` → `google/gemini-2.5-flash-lite`

### 🐛 Bug Fixes
- Branch feature field name mismatch (`branch._id` → `branch.id`)
- Title not updating in chat header after generation
- Branch rename API error (`get_db` undefined)

---

# Release v1.0.0 (2026-01-27)

### ✨ New Features
- AI-powered workflow generation with intelligent prompt-based creation
- Multimodal chat interface supporting text and image inputs
- Workflow templates system with pre-filled prompts for common use cases
- Workflow enhancements including duplicate, context menu, and single node execution capabilities
- Custom workflow node components for React Flow canvas
- Workflow page with interactive React Flow visualization
- Workflow execution engine for backend processing
- Workflow models and CRUD routes with database persistence
- Comprehensive backend testing suite
- Prompt template system for standardized prompt management
- Admin analytics dashboard (Phase 4)
- Sidebar sections organization for improved UI structure

### 🐛 Bug Fixes
- Fixed streaming functionality for improved real-time data delivery
- Fixed image input handling in multimodal chat
- Fixed Arena context error handling
- Fixed workflow template positions
- Added logout functionality
- Fixed streaming issues in backend communication
- Improved error handling and validation

### 🔧 Improvements
- Code optimization and security enhancements
- Refactored project structure for improved user-friendliness
- Enhanced markdown rendering capabilities
- Performance improvements across workflow execution
- Improved documentation and development workflow

### 📚 Documentation
- Compact and update CLAUDE.md with project guidelines
- Add Image Workflow documentation
- Add multi-agent development workflow documentation
- Add remaining tasks and project roadmap documentation