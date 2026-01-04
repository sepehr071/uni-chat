# Uni-Chat

A full-stack AI chat application with customizable AI configurations, real-time streaming, conversation management, and admin features. Built with React, Flask, and MongoDB.

---

## Project Overview

Uni-Chat is a multi-user AI chat platform that allows users to create custom AI assistants by defining system prompts and model configurations. It supports real-time streaming responses via WebSocket, conversation history management with folders, a public gallery for sharing configurations, and administrative features for user management.

### Key Features

- **Custom AI Configurations**: Users create personalized AI assistants with custom system prompts, model selection, and parameters (temperature, max tokens, etc.)
- **Real-time Streaming**: WebSocket-based message streaming for responsive AI interactions
- **Conversation Management**: Organize conversations into folders, archive, search, and export
- **Public Gallery**: Share and discover community AI configurations
- **Admin Dashboard**: User management, system templates, usage analytics
- **Multi-Model Support**: Access to GPT-4, Claude, and other models via OpenRouter API
- **File Attachments**: Upload images and documents to include in conversations
- **Dark Theme UI**: Notion-inspired dark mode interface

---

## Tech Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.2.0 | UI framework |
| Vite | 5.0.0 | Build tool and dev server |
| Tailwind CSS | 3.4.0 | Styling |
| TanStack Query | 5.0.0 | Server state management |
| Socket.IO Client | 4.7.0 | Real-time communication |
| React Router | 6.20.0 | Client-side routing |
| Zustand | 4.4.0 | Client state management |
| Axios | 1.6.0 | HTTP client |
| Lucide React | 0.300.0 | Icons |
| React Hot Toast | 2.4.0 | Notifications |

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| Flask | 3.0.0 | Web framework |
| Flask-SocketIO | 5.3.6 | WebSocket support |
| Flask-JWT-Extended | 4.6.0 | Authentication |
| Flask-PyMongo | 2.3.0 | MongoDB integration |
| Eventlet | 0.34.3 | Async server |
| Flask-CORS | 4.0.0 | Cross-origin support |
| Flask-Limiter | 3.5.0 | Rate limiting |
| Bcrypt | 4.1.0 | Password hashing |
| Httpx | 0.25.0 | Async HTTP client |

### Infrastructure
| Component | Technology |
|-----------|------------|
| Database | MongoDB |
| AI API | OpenRouter (unified API for GPT-4, Claude, etc.) |
| File Storage | Local filesystem (S3 ready) |

---

## Project Structure

```
uni-chat/
├── backend/
│   ├── app/
│   │   ├── __init__.py          # App factory
│   │   ├── config.py            # Configuration classes
│   │   ├── extensions.py        # Flask extensions
│   │   ├── models/              # MongoDB document models
│   │   │   ├── user.py          # User model
│   │   │   ├── conversation.py  # Conversation model
│   │   │   ├── message.py       # Message model
│   │   │   ├── llm_config.py    # AI configuration model
│   │   │   └── folder.py        # Folder model
│   │   ├── routes/              # API endpoints
│   │   │   ├── auth.py          # Authentication routes
│   │   │   ├── chat.py          # Chat operations
│   │   │   ├── conversations.py # Conversation CRUD
│   │   │   ├── configs.py       # AI config management
│   │   │   ├── gallery.py       # Public gallery
│   │   │   ├── folders.py       # Folder management
│   │   │   ├── uploads.py       # File uploads
│   │   │   ├── users.py         # User profile
│   │   │   ├── models.py        # Available AI models
│   │   │   └── admin.py         # Admin operations
│   │   ├── services/
│   │   │   └── openrouter_service.py  # OpenRouter API integration
│   │   ├── sockets/             # WebSocket events
│   │   │   ├── chat_events.py   # Message streaming
│   │   │   └── connection_events.py
│   │   └── utils/               # Helpers
│   │       ├── decorators.py    # Route decorators
│   │       ├── errors.py        # Error handlers
│   │       ├── helpers.py       # Utility functions
│   │       └── validators.py    # Input validation
│   ├── uploads/                 # Uploaded files
│   ├── requirements.txt
│   ├── run.py                   # Entry point
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── main.jsx             # App entry point
│   │   ├── App.jsx              # Routing configuration
│   │   ├── components/
│   │   │   ├── chat/            # Chat UI components
│   │   │   │   ├── ChatInput.jsx
│   │   │   │   ├── ChatWindow.jsx
│   │   │   │   ├── ConfigSelector.jsx
│   │   │   │   └── MarkdownRenderer.jsx
│   │   │   ├── config/
│   │   │   │   └── ConfigEditor.jsx
│   │   │   └── layout/
│   │   │       ├── MainLayout.jsx
│   │   │       ├── AuthLayout.jsx
│   │   │       ├── Sidebar.jsx
│   │   │       └── Header.jsx
│   │   ├── context/
│   │   │   ├── AuthContext.jsx  # Authentication state
│   │   │   └── SocketContext.jsx # WebSocket connection
│   │   ├── pages/
│   │   │   ├── auth/            # Login, Register
│   │   │   ├── chat/            # Main chat interface
│   │   │   ├── dashboard/       # Dashboard, History, Configs, Gallery, Settings
│   │   │   └── admin/           # Admin pages
│   │   ├── services/            # API service layer
│   │   │   ├── api.js           # Axios instance
│   │   │   ├── authService.js
│   │   │   ├── chatService.js
│   │   │   ├── userService.js
│   │   │   └── adminService.js
│   │   └── utils/
│   │       └── cn.js            # Tailwind class merger
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── postcss.config.js
│
└── todo.md                      # Development tasks
```

---

## Architecture

### Authentication Flow

1. User registers/logs in via `/api/auth/register` or `/api/auth/login`
2. Server returns JWT access token (15 min expiry) and refresh token (30 day expiry)
3. Tokens stored in localStorage
4. Axios interceptor attaches Bearer token to all requests
5. On 401 response, interceptor attempts token refresh automatically
6. Failed refresh redirects to login

### Real-time Chat Flow

1. User selects an AI configuration and types a message
2. Frontend emits `send_message` event via Socket.IO
3. Backend receives message, creates conversation (if new), saves user message
4. Backend streams response from OpenRouter API
5. Response chunks emitted as `message_chunk` events
6. Frontend updates UI in real-time with streaming content
7. On completion, `message_complete` event sent with full message and metadata

### Data Models

**User**
- Email, hashed password, display name, bio
- Role (user/admin), status (active/suspended)
- Usage stats (tokens, messages)
- Settings (theme, notifications)

**Conversation**
- Title, user reference, config reference
- Folder assignment, tags
- Message count, token counts
- Archive status, timestamps

**Message**
- Conversation reference, role (user/assistant/system)
- Content, attachments
- Metadata (model, tokens, cost)

**LLMConfig**
- Name, description, avatar (emoji or image)
- Model ID, system prompt
- Parameters (temperature, max_tokens, top_p, etc.)
- Visibility (private/public), owner
- Usage stats (uses, saves)

**Folder**
- Name, user reference
- Color, icon
- Conversation count

---

## API Endpoints

### Authentication (`/api/auth`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/register` | Create new account |
| POST | `/login` | Authenticate user |
| POST | `/logout` | Invalidate session |
| POST | `/refresh` | Refresh access token |
| GET | `/me` | Get current user |
| POST | `/change-password` | Update password |

### Conversations (`/api/conversations`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List conversations |
| GET | `/:id` | Get conversation with messages |
| POST | `/` | Create conversation |
| PUT | `/:id` | Update conversation |
| DELETE | `/:id` | Delete conversation |
| POST | `/:id/archive` | Archive conversation |

### Configs (`/api/configs`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List user's configs |
| GET | `/:id` | Get config details |
| POST | `/` | Create config |
| PUT | `/:id` | Update config |
| DELETE | `/:id` | Delete config |
| POST | `/:id/publish` | Make public |
| POST | `/:id/unpublish` | Make private |
| POST | `/:id/duplicate` | Clone config |

### Gallery (`/api/gallery`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Browse public configs |
| GET | `/templates` | Get system templates |
| POST | `/:id/use` | Add config to collection |
| POST | `/:id/save` | Bookmark config |
| DELETE | `/:id/save` | Remove bookmark |
| GET | `/saved` | List saved configs |

### WebSocket Events

**Client → Server**
- `join_conversation` - Join conversation room
- `leave_conversation` - Leave conversation room
- `send_message` - Send chat message
- `stop_generation` - Cancel AI response

**Server → Client**
- `message_start` - AI begins generating
- `message_chunk` - Streaming content chunk
- `message_complete` - Full response ready
- `message_error` - Generation failed
- `message_saved` - User message saved
- `conversation_created` - New conversation created

---

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SECRET_KEY` | Yes | Flask secret key for sessions |
| `JWT_SECRET_KEY` | Yes | JWT signing key |
| `MONGO_URI` | Yes | MongoDB connection string |
| `OPENROUTER_API_KEY` | Yes | OpenRouter API key |
| `FLASK_DEBUG` | No | Enable debug mode (default: False) |
| `FLASK_ENV` | No | Environment (development/production) |
| `AWS_ACCESS_KEY_ID` | No | S3 access key (for production) |
| `AWS_SECRET_ACCESS_KEY` | No | S3 secret key |
| `AWS_S3_BUCKET` | No | S3 bucket name |

### Application Settings

- **JWT Access Token**: 15 minute expiry
- **JWT Refresh Token**: 30 day expiry
- **Max File Upload**: 16 MB
- **Allowed File Types**: PNG, JPG, JPEG, GIF, WEBP, PDF, TXT, MD
- **Rate Limit**: 100 requests per minute
- **WebSocket Reconnection**: 5 attempts, 1 second delay

---

## Setup Instructions

### Prerequisites
- Python 3.8 or higher
- Node.js 18 or higher
- MongoDB (local installation or Atlas account)
- OpenRouter API key (from https://openrouter.ai)

### Backend Setup

1. Navigate to backend directory:
   ```
   cd backend
   ```

2. Create virtual environment (recommended):
   ```
   python -m venv venv
   source venv/bin/activate  # Linux/Mac
   venv\Scripts\activate     # Windows
   ```

   Or with Conda:
   ```
   conda create -n unichat python=3.11
   conda activate unichat
   ```

3. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

4. Create environment file:
   ```
   cp .env.example .env
   ```

5. Edit `.env` with your values:
   - Set `SECRET_KEY` to a random secure string
   - Set `JWT_SECRET_KEY` to a different random secure string
   - Set `MONGO_URI` to your MongoDB connection string
   - Set `OPENROUTER_API_KEY` to your OpenRouter API key

6. Start the server:
   ```
   python run.py
   ```
   Backend runs on http://localhost:5000

### Frontend Setup

1. Navigate to frontend directory:
   ```
   cd frontend
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Start development server:
   ```
   npm run dev
   ```
   Frontend runs on http://localhost:3000

### First Run

1. Open http://localhost:3000 in your browser
2. Register a new account
3. Create your first AI configuration (name, system prompt, model)
4. Start chatting!

---

## Development Notes

### Recent Bug Fixes (Phase 2)

The following issues have been addressed:

1. **GalleryPage.jsx**: Fixed `useMutation` variable name shadowing the React Query hook (renamed to `useConfigMutation`)

2. **GalleryPage.jsx, HistoryPage.jsx**: Removed unused imports (`Clock`, `Star`, `Filter`)

3. **ChatWindow.jsx**: Added toast notification for clipboard copy failures instead of console.error

4. **HistoryPage.jsx**: Added try-catch error handling with toast notifications for archive and delete operations

5. **ChatPage.jsx**: Added loading skeleton with spinner when conversation is loading

6. **SocketContext.jsx**: Added connection status feedback - toast notifications when connection is lost and when reconnected

### Known Limitations

- No message editing (planned for Phase 3)
- No drag-and-drop folder organization (planned for Phase 3)
- No message search within conversations (planned for Phase 3)
- No conversation export (planned for Phase 3)
- Mobile layout needs optimization (planned for Phase 5)

### Code Patterns

**State Management**
- React Query for server state (conversations, configs, user data)
- React Context for auth and socket connection
- Local state (useState) for UI state

**API Layer**
- Axios instance with interceptors for auth tokens
- Service modules abstract API calls
- Automatic token refresh on 401

**Styling**
- Tailwind CSS with custom color variables
- Dark theme by default
- `cn()` utility for conditional classes

**Error Handling**
- Toast notifications for user feedback
- Try-catch blocks in async operations
- API interceptor handles auth errors

---

## Deployment Considerations

### Production Checklist

- [ ] Change all secret keys to secure random values
- [ ] Set `FLASK_DEBUG=False`
- [ ] Configure CORS for production domain
- [ ] Set up HTTPS/SSL
- [ ] Use production MongoDB (Atlas recommended)
- [ ] Configure proper rate limiting
- [ ] Set up file storage (S3 for scalability)
- [ ] Add logging and monitoring
- [ ] Set up database backups

### Docker (Not Yet Implemented)

Docker configuration is planned for Phase 6. The application will need:
- Python/Flask container for backend
- Node container for frontend build
- MongoDB container (or Atlas connection)
- Nginx for reverse proxy

---

## Contributing

See `todo.md` for the current development roadmap and open tasks.

---

## License

[Add license information]
