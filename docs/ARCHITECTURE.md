# Architecture Documentation

Comprehensive system design and architecture documentation for Uni-Chat.

## Table of Contents

1. [System Overview](#system-overview)
2. [Technology Stack](#technology-stack)
3. [Architecture Patterns](#architecture-patterns)
4. [Backend Architecture](#backend-architecture)
5. [Frontend Architecture](#frontend-architecture)
6. [Database Schema](#database-schema)
7. [API Integration](#api-integration)
8. [Real-time Communication](#real-time-communication)
9. [Security](#security)
10. [Performance Optimizations](#performance-optimizations)
11. [Data Flow](#data-flow)

---

## System Overview

Uni-Chat is a full-stack AI chat application that provides:
- Multi-model AI conversations via OpenRouter API
- Real-time streaming chat responses
- AI image generation with multiple models
- Arena mode for side-by-side model comparison
- Custom LLM configuration management
- Admin dashboard with analytics
- User management and authentication

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Browser    │  │  Mobile App  │  │   Desktop    │          │
│  │   (React)    │  │  (Future)    │  │   (Future)   │          │
│  └──────┬───────┘  └──────────────┘  └──────────────┘          │
└─────────┼────────────────────────────────────────────────────────┘
          │ HTTP/REST + WebSocket
          │
┌─────────┼────────────────────────────────────────────────────────┐
│         ▼              Application Layer                         │
│  ┌──────────────────────────────────────────────────────┐       │
│  │              Flask Backend (Python)                   │       │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐     │       │
│  │  │   Routes   │  │  Services  │  │   Sockets  │     │       │
│  │  │  (REST)    │  │ (Business) │  │ (Real-time)│     │       │
│  │  └────────────┘  └────────────┘  └────────────┘     │       │
│  └──────────────────────────────────────────────────────┘       │
└─────────┬──────────────────────────────┬──────────────────────────┘
          │                              │
          │ MongoDB                      │ OpenRouter API
          ▼                              ▼
┌─────────────────────┐    ┌─────────────────────────────┐
│  Database Layer     │    │   External Services         │
│  ┌───────────────┐  │    │  ┌───────────────────────┐  │
│  │   MongoDB     │  │    │  │  OpenRouter API       │  │
│  │   (NoSQL)     │  │    │  │  - GPT-4, Claude,     │  │
│  │               │  │    │  │    Gemini, etc.       │  │
│  └───────────────┘  │    │  │  - Image Generation   │  │
└─────────────────────┘    │  └───────────────────────┘  │
                           └─────────────────────────────┘
```

---

## Technology Stack

### Frontend
- **Framework:** React 18
- **Build Tool:** Vite 5
- **Styling:** Tailwind CSS 3
- **State Management:**
  - React Context (Auth, Socket)
  - TanStack Query (React Query) for server state
- **Routing:** React Router v6
- **Real-time:** Socket.IO Client
- **HTTP Client:** Axios
- **UI Libraries:**
  - Lucide React (Icons)
  - react-hot-toast (Notifications)
  - @dnd-kit (Drag & Drop)
  - Recharts (Analytics Charts)

### Backend
- **Framework:** Flask 3.0
- **Language:** Python 3.10+
- **ASGI Server:** Eventlet (for WebSocket support)
- **Authentication:** Flask-JWT-Extended
- **Database ODM:** PyMongo
- **WebSocket:** Flask-SocketIO
- **CORS:** Flask-CORS
- **Rate Limiting:** Flask-Limiter
- **Password Hashing:** bcrypt

### Database
- **Primary Database:** MongoDB 6.0+
- **Schema:** Document-based (NoSQL)
- **Indexing:** Compound indexes for performance

### External Services
- **AI Provider:** OpenRouter API
  - Multi-model access (GPT-4, Claude, Gemini, etc.)
  - Image generation models
  - Streaming responses

### Development Tools
- **Version Control:** Git
- **Package Management:** npm (frontend), pip (backend)
- **Code Quality:** ESLint (frontend), flake8 (backend)

---

## Architecture Patterns

### 1. Separation of Concerns

**Backend:**
```
app/
├── routes/          # HTTP endpoint handlers (Controller)
├── models/          # Data models and database operations (Model)
├── services/        # Business logic and external API calls (Service)
├── sockets/         # WebSocket event handlers
├── utils/           # Helpers, decorators, validators
└── extensions.py    # Shared Flask extensions
```

**Frontend:**
```
src/
├── pages/           # Page components (View)
├── components/      # Reusable UI components
├── services/        # API client functions
├── context/         # Global state management
└── utils/           # Helper functions
```

### 2. RESTful API Design

- Resource-based URLs (`/api/conversations`, `/api/configs`)
- HTTP methods for CRUD (GET, POST, PUT, DELETE)
- JSON request/response bodies
- Consistent error handling
- Pagination for list endpoints

### 3. Event-Driven Architecture

WebSocket events for real-time features:
- Chat message streaming
- Arena parallel generation
- Live notifications
- Connection management

### 4. Middleware Pattern

**Backend Middleware:**
- JWT authentication (`@jwt_required`)
- Admin authorization (`@admin_required`)
- Active user check (`@active_user_required`)
- Rate limiting
- CORS handling
- Error handling

**Frontend Middleware:**
- Axios interceptors for auth tokens
- Auto-refresh on 401 responses
- Request/response logging

### 5. Repository Pattern

Models act as repositories with static methods:
```python
class UserModel:
    @staticmethod
    def find_by_id(user_id):
        return mongo.db.users.find_one({'_id': ObjectId(user_id)})

    @staticmethod
    def create(email, password, display_name):
        # Create and return user
```

### 6. Service Layer

Services encapsulate external API interactions:
```python
class OpenRouterService:
    @staticmethod
    def chat_completion(messages, model, ...):
        # Handle OpenRouter API communication
```

---

## Backend Architecture

### Directory Structure

```
backend/
├── app/
│   ├── __init__.py              # Flask app factory
│   ├── config.py                # Configuration classes
│   ├── extensions.py            # Flask extensions (mongo, jwt, socketio)
│   │
│   ├── routes/                  # REST API endpoints
│   │   ├── __init__.py
│   │   ├── auth.py              # Authentication endpoints
│   │   ├── chat.py              # Chat operations
│   │   ├── conversations.py     # Conversation CRUD
│   │   ├── configs.py           # LLM config management
│   │   ├── gallery.py           # Public config gallery
│   │   ├── folders.py           # Conversation organization
│   │   ├── uploads.py           # File upload handling
│   │   ├── users.py             # User profile management
│   │   ├── admin.py             # Admin operations
│   │   ├── models.py            # Available AI models
│   │   ├── health.py            # Health check
│   │   ├── image_generation.py  # Image generation
│   │   ├── arena.py             # Arena sessions
│   │   └── prompt_templates.py  # Prompt templates
│   │
│   ├── models/                  # Data models
│   │   ├── __init__.py
│   │   ├── user.py              # User model
│   │   ├── conversation.py      # Conversation model
│   │   ├── message.py           # Message model
│   │   ├── llm_config.py        # LLM config model
│   │   ├── folder.py            # Folder model
│   │   ├── usage_log.py         # Usage tracking
│   │   ├── audit_log.py         # Audit trail
│   │   ├── generated_image.py   # Generated images
│   │   ├── arena_session.py     # Arena sessions
│   │   ├── arena_message.py     # Arena messages
│   │   └── prompt_template.py   # Prompt templates
│   │
│   ├── services/                # Business logic
│   │   ├── __init__.py
│   │   └── openrouter_service.py  # OpenRouter API integration
│   │
│   ├── sockets/                 # WebSocket events
│   │   ├── __init__.py
│   │   ├── connection_events.py  # Connect/disconnect
│   │   ├── chat_events.py        # Chat streaming
│   │   └── arena_events.py       # Arena streaming
│   │
│   └── utils/                   # Utilities
│       ├── decorators.py        # Custom decorators
│       ├── helpers.py           # Helper functions
│       ├── errors.py            # Error handlers
│       ├── validators.py        # Input validation
│       └── security_headers.py  # Security middleware
│
├── scripts/                     # Utility scripts
│   └── setup_indexes.py         # MongoDB index setup
│
├── uploads/                     # File uploads storage
├── run.py                       # Application entry point
└── requirements.txt             # Python dependencies
```

### Request Flow

1. **HTTP Request** → Flask receives request
2. **Middleware** → CORS, rate limiting, security headers
3. **Authentication** → JWT verification (@jwt_required)
4. **Authorization** → Role check (@admin_required)
5. **Route Handler** → Process request, validate input
6. **Model Layer** → Database operations
7. **Service Layer** → External API calls if needed
8. **Response** → Serialize and return JSON

### WebSocket Flow

1. **Client Connects** → Socket.IO handshake
2. **Authentication** → Verify JWT token
3. **Event Registration** → Store user_id → socket_id mapping
4. **Event Handling** → Process incoming events
5. **Streaming** → Use eventlet.spawn for parallel processing
6. **Cleanup** → Remove mappings on disconnect

---

## Frontend Architecture

### Directory Structure

```
frontend/
├── public/                      # Static assets
├── src/
│   ├── App.jsx                  # Root component with routing
│   ├── main.jsx                 # Application entry point
│   │
│   ├── context/                 # React Context providers
│   │   ├── AuthContext.jsx      # Authentication state
│   │   └── SocketContext.jsx    # WebSocket connection
│   │
│   ├── services/                # API client functions
│   │   ├── api.js               # Axios instance with interceptors
│   │   ├── authService.js       # Auth API calls
│   │   ├── chatService.js       # Chat & config API calls
│   │   ├── userService.js       # User API calls
│   │   ├── adminService.js      # Admin API calls
│   │   ├── imageService.js      # Image generation API
│   │   ├── arenaService.js      # Arena API calls
│   │   └── promptTemplateService.js  # Template API calls
│   │
│   ├── pages/                   # Page components
│   │   ├── auth/                # Login, Register
│   │   ├── chat/                # Main chat interface
│   │   ├── dashboard/           # Dashboard pages
│   │   ├── arena/               # Arena mode
│   │   └── admin/               # Admin pages
│   │
│   ├── components/              # Reusable components
│   │   ├── layout/              # Layout components
│   │   │   ├── MainLayout.jsx
│   │   │   ├── Sidebar.jsx
│   │   │   └── Header.jsx
│   │   ├── chat/                # Chat components
│   │   │   ├── ChatWindow.jsx
│   │   │   ├── MessageList.jsx
│   │   │   └── MessageInput.jsx
│   │   ├── config/              # Config components
│   │   │   ├── ConfigEditor.jsx
│   │   │   └── ConfigCard.jsx
│   │   ├── arena/               # Arena components
│   │   │   ├── ArenaPanel.jsx
│   │   │   └── ArenaConfigSelector.jsx
│   │   └── common/              # Shared components
│   │
│   ├── utils/                   # Utility functions
│   │   └── cn.js                # Tailwind class merger
│   │
│   ├── styles/                  # Global styles
│   └── assets/                  # Images, icons
│
├── index.html                   # HTML entry point
├── vite.config.js               # Vite configuration
├── tailwind.config.js           # Tailwind configuration
├── package.json                 # Dependencies
└── .env                         # Environment variables
```

### Component Hierarchy

```
App
├── AuthLayout (Public routes)
│   ├── LoginPage
│   └── RegisterPage
│
└── MainLayout (Protected routes)
    ├── Sidebar
    ├── Header
    └── Page Content
        ├── ChatPage
        │   ├── ChatWindow
        │   │   ├── MessageList
        │   │   │   └── MessageItem
        │   │   └── MessageInput
        │   └── ConversationList
        │
        ├── ConfigsPage
        │   └── ConfigEditor
        │
        ├── ArenaPage
        │   ├── ArenaConfigSelector
        │   └── ArenaPanel (x4 max)
        │
        ├── ImageStudioPage
        │   ├── ImageGenerator
        │   └── ImageGallery
        │
        └── AdminDashboard
            ├── AnalyticsCharts
            └── UserManagement
```

### State Management

**1. Server State (React Query)**
```javascript
// Cached API data with automatic refetching
const { data, isLoading } = useQuery({
  queryKey: ['conversations'],
  queryFn: () => chatService.getConversations(),
  staleTime: 5 * 60 * 1000  // 5 minutes
})
```

**2. Auth State (Context)**
```javascript
// Global authentication state
const { user, login, logout } = useAuth()
```

**3. Socket State (Context)**
```javascript
// Global WebSocket connection
const { socket, isConnected } = useSocket()
```

**4. Local State (useState)**
```javascript
// Component-specific state
const [messages, setMessages] = useState([])
```

### Data Flow

1. **Component Mounts** → useQuery fetches data
2. **User Action** → Event handler triggered
3. **API Call** → Service function called
4. **Axios Interceptor** → Adds auth token
5. **Backend Response** → Data returned
6. **Cache Update** → React Query updates cache
7. **Re-render** → Component reflects new data

---

## Database Schema

### Collections Overview

```
MongoDB Database: unichat
├── users                 # User accounts
├── conversations         # Chat conversations
├── messages              # Chat messages
├── llm_configs           # LLM configurations
├── folders               # Conversation folders
├── usage_logs            # API usage tracking
├── audit_logs            # Admin actions
├── generated_images      # AI-generated images
├── arena_sessions        # Arena sessions
├── arena_messages        # Arena messages
├── prompt_templates      # Prompt templates
└── revoked_tokens        # Blacklisted JWT tokens
```

### Schema Details

#### users
```javascript
{
  _id: ObjectId,
  email: String (unique, indexed),
  password_hash: String,
  role: String ('user' | 'admin'),
  profile: {
    display_name: String,
    avatar_url: String,
    bio: String
  },
  settings: {
    theme: String,
    notifications_enabled: Boolean,
    language: String
  },
  usage: {
    messages_sent: Number,
    tokens_used: Number,
    tokens_limit: Number,  // -1 for unlimited
    last_active: Date
  },
  status: {
    is_banned: Boolean,
    ban_reason: String,
    banned_at: Date,
    banned_by: ObjectId
  },
  saved_configs: [ObjectId],  // Saved gallery configs
  created_at: Date,
  updated_at: Date
}

# Indexes:
- email (unique)
- created_at
- usage.last_active
```

#### conversations
```javascript
{
  _id: ObjectId,
  user_id: ObjectId (indexed),
  config_id: ObjectId,
  folder_id: ObjectId,
  title: String,
  message_count: Number,
  is_pinned: Boolean,
  is_archived: Boolean,
  tags: [String],
  stats: {
    total_tokens: Number,
    input_tokens: Number,
    output_tokens: Number
  },
  created_at: Date,
  updated_at: Date,
  last_message_at: Date
}

# Indexes:
- user_id + created_at (compound)
- user_id + last_message_at (compound)
- user_id + is_archived (compound)
- folder_id
```

#### messages
```javascript
{
  _id: ObjectId,
  conversation_id: ObjectId (indexed),
  role: String ('user' | 'assistant' | 'system'),
  content: String,
  attachments: [{
    type: String,
    url: String,
    name: String,
    size: Number
  }],
  metadata: {
    model_id: String,
    tokens: {
      prompt: Number,
      completion: Number
    },
    generation_time_ms: Number,
    finish_reason: String,
    cost_usd: Number
  },
  is_edited: Boolean,
  edit_history: [{
    content: String,
    edited_at: Date
  }],
  is_error: Boolean,
  error_message: String,
  created_at: Date
}

# Indexes:
- conversation_id + created_at (compound)
- conversation_id + role (compound)
```

#### llm_configs
```javascript
{
  _id: ObjectId,
  name: String,
  model_id: String,
  model_name: String,
  owner_id: ObjectId,  // null for templates
  visibility: String ('private' | 'public' | 'template'),
  description: String,
  system_prompt: String,
  avatar: String,  // Emoji
  parameters: {
    temperature: Number,
    max_tokens: Number,
    top_p: Number,
    frequency_penalty: Number,
    presence_penalty: Number
  },
  tags: [String],
  stats: {
    uses_count: Number,
    saves_count: Number
  },
  created_at: Date,
  updated_at: Date
}

# Indexes:
- owner_id + created_at (compound)
- visibility + stats.uses_count (compound)
- tags
```

#### folders
```javascript
{
  _id: ObjectId,
  user_id: ObjectId (indexed),
  name: String,
  color: String,
  icon: String,
  conversation_count: Number,
  created_at: Date,
  updated_at: Date
}

# Indexes:
- user_id + created_at (compound)
```

#### usage_logs
```javascript
{
  _id: ObjectId,
  user_id: ObjectId (indexed),
  conversation_id: ObjectId,
  message_id: ObjectId,
  model_id: String,
  tokens: {
    prompt: Number,
    completion: Number,
    total: Number
  },
  cost_usd: Number,
  created_at: Date (indexed)
}

# Indexes:
- user_id + created_at (compound)
- created_at
- model_id + created_at (compound)
```

#### generated_images
```javascript
{
  _id: ObjectId,
  user_id: ObjectId (indexed),
  prompt: String,
  model_id: String,
  image_data: String,  // base64 data URI
  negative_prompt: String,
  is_favorite: Boolean,
  settings: {
    aspect_ratio: String,
    image_size: String,
    input_images_count: Number,
    has_input_images: Boolean
  },
  metadata: {
    generation_time_ms: Number,
    usage: Object
  },
  created_at: Date
}

# Indexes:
- user_id + created_at (compound)
- user_id + is_favorite (compound)
```

#### arena_sessions
```javascript
{
  _id: ObjectId,
  user_id: ObjectId (indexed),
  config_ids: [ObjectId],  // 2-4 configs
  title: String,
  message_count: Number,
  created_at: Date,
  updated_at: Date
}

# Indexes:
- user_id + created_at (compound)
```

#### arena_messages
```javascript
{
  _id: ObjectId,
  session_id: ObjectId (indexed),
  role: String ('user' | 'assistant'),
  config_id: ObjectId,  // null for user messages
  content: String,
  metadata: {
    model_id: String,
    tokens: {
      prompt: Number,
      completion: Number
    },
    generation_time_ms: Number
  },
  created_at: Date
}

# Indexes:
- session_id + created_at (compound)
```

#### prompt_templates
```javascript
{
  _id: ObjectId,
  name: String,
  category: String (indexed),
  template_text: String,
  variables: [String],
  description: String,
  usage_count: Number,
  is_active: Boolean,
  created_by: ObjectId,
  created_at: Date,
  updated_at: Date
}

# Indexes:
- category
- is_active + usage_count (compound)
```

---

## API Integration

### OpenRouter Service

The `OpenRouterService` class handles all interactions with the OpenRouter API.

**Key Methods:**

1. **get_available_models()**
   - Fetches list of available models
   - Cached for 1 hour
   - Returns model metadata (pricing, context length, etc.)

2. **chat_completion(messages, model, ...)**
   - Sends chat completion request
   - Supports streaming and non-streaming
   - Handles errors and retries

3. **generate_image(prompt, model, ...)**
   - Generates images using image-capable models
   - Supports image-to-image with reference images
   - Returns base64 data URI

4. **format_messages_for_api(messages)**
   - Converts database messages to OpenRouter format
   - Handles multimodal content (text + images)

**Error Handling:**

```python
try:
    response = OpenRouterService.chat_completion(...)
    if 'error' in response:
        # Handle API error
        error_message = response['error']['message']
except Exception as e:
    # Handle network/timeout errors
    pass
```

**Rate Limiting:**

- OpenRouter has per-model rate limits
- Application implements user-level token limits
- Graceful degradation on rate limit errors

---

## Real-time Communication

### WebSocket Architecture

**Connection Management:**

```python
# Backend: Store active connections
active_connections = {}  # user_id → socket_id

@socketio.on('connect')
def handle_connect():
    # Authenticate via JWT
    # Store mapping
    active_connections[user_id] = request.sid
```

**Streaming Pattern:**

```python
# Backend: Streaming chat response
def handle_send_message(data):
    # 1. Save user message
    # 2. Emit message_start
    # 3. Stream chunks
    for chunk in OpenRouterService.chat_completion(..., stream=True):
        emit('message_chunk', {'content': chunk})
        eventlet.sleep(0)  # Yield control for smooth streaming
    # 4. Emit message_complete
```

**Parallel Processing (Arena):**

```python
# Backend: Arena parallel generation
for config_id in config_ids:
    greenlet = eventlet.spawn(
        generate_arena_response,
        config_id,
        message,
        session_id
    )
    greenlets.append(greenlet)
```

**Client Handling:**

```javascript
// Frontend: Accumulate streaming chunks
let fullContent = ''

socket.on('message_chunk', (data) => {
  fullContent += data.content
  setMessages(prev => updateLastMessage(prev, fullContent))
})

socket.on('message_complete', (data) => {
  // Save final message with metadata
  saveMessage(data)
})
```

---

## Security

### Authentication

**JWT Token Flow:**

1. User logs in → Server issues access token (15 min) + refresh token (30 days)
2. Client stores tokens in localStorage
3. Access token sent in Authorization header: `Bearer <token>`
4. On 401 response → Auto-refresh using refresh token
5. On logout → Add token to blocklist

**Implementation:**

```python
# Backend
@jwt_required()
def protected_route():
    user = get_current_user()
    # Process request
```

```javascript
// Frontend: Axios interceptor
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})
```

### Authorization

**Role-Based Access Control (RBAC):**

```python
@admin_required
def admin_only_route():
    # Only accessible to admins
```

Roles:
- `user` - Standard user access
- `admin` - Full system access

### Input Validation

**Backend Validators:**

```python
def validate_email_address(email):
    # Email format validation
    # Returns normalized email or None

def validate_password(password):
    # Min 8 chars, uppercase, lowercase, number
    # Returns (is_valid, error_message)
```

**Frontend Validation:**

- Form validation before submission
- Input sanitization
- XSS prevention via React's automatic escaping

### Security Headers

```python
# CORS configuration
CORS(app, resources={
    r"/api/*": {
        "origins": ["http://localhost:3000"],
        "supports_credentials": True
    }
})

# Security headers
@app.after_request
def set_security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    return response
```

### Data Protection

- **Passwords:** Hashed with bcrypt (cost factor 12)
- **Sensitive Data:** Never logged or exposed in responses
- **File Uploads:** Type and size validation (max 16MB)
- **Rate Limiting:** Per-user and per-endpoint limits

### Token Revocation

```python
# Logout: Add token to blocklist
mongo.db.revoked_tokens.insert_one({
    'jti': token_id,
    'created_at': datetime.utcnow()
})

# Check on each request
@jwt.token_in_blocklist_loader
def check_if_token_revoked(jwt_header, jwt_payload):
    jti = jwt_payload['jti']
    return mongo.db.revoked_tokens.find_one({'jti': jti}) is not None
```

---

## Performance Optimizations

### Backend

**1. Database Indexing**

```python
# Compound indexes for common queries
db.conversations.create_index([
    ('user_id', 1),
    ('last_message_at', -1)
])

db.messages.create_index([
    ('conversation_id', 1),
    ('created_at', 1)
])
```

**2. Pagination**

All list endpoints support pagination to limit data transfer:

```python
skip = (page - 1) * limit
conversations = db.conversations.find(...).skip(skip).limit(limit)
```

**3. Selective Field Projection**

```python
# Don't return password hash
user = db.users.find_one({'_id': user_id}, {'password_hash': 0})
```

**4. Model Caching**

```python
# Cache available models for 1 hour
_models_cache = {
    'data': None,
    'timestamp': 0
}
```

**5. Connection Pooling**

- MongoDB connection pooling (default: 100 connections)
- HTTP connection pooling for OpenRouter API

### Frontend

**1. Code Splitting**

```javascript
// Lazy load pages
const ChatPage = lazy(() => import('./pages/chat/ChatPage'))
```

**2. React Query Caching**

```javascript
// Cache server data, automatic refetching
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,  // 5 minutes
      cacheTime: 10 * 60 * 1000  // 10 minutes
    }
  }
})
```

**3. Optimistic Updates**

```javascript
// Update UI immediately, rollback on error
const mutation = useMutation({
  mutationFn: updateConfig,
  onMutate: async (newConfig) => {
    // Optimistically update
    queryClient.setQueryData(['configs'], old => [...old, newConfig])
  }
})
```

**4. Virtual Scrolling**

For long message lists, implement virtualization to render only visible items.

**5. Asset Optimization**

- Vite builds with tree-shaking and minification
- Tailwind CSS purges unused styles
- Image optimization (future: use WebP format)

---

## Data Flow

### Chat Message Flow

```
User Types Message
       ↓
MessageInput Component
       ↓
socket.emit('send_message', {...})
       ↓
Backend: chat_events.py
       ↓
┌──────────────────────────┐
│ 1. Validate & Save       │
│ 2. Get Context Messages  │
│ 3. Call OpenRouter API   │
│ 4. Stream Response       │
└──────────────────────────┘
       ↓
socket.emit('message_chunk', ...)
       ↓
Frontend: ChatWindow
       ↓
Update UI with Chunk
       ↓
socket.emit('message_complete', ...)
       ↓
Save Complete Message
       ↓
Update Conversation Stats
```

### Authentication Flow

```
User Enters Credentials
       ↓
LoginPage Component
       ↓
POST /api/auth/login
       ↓
Backend: auth.py
       ↓
┌──────────────────────────┐
│ 1. Validate Credentials  │
│ 2. Generate JWT Tokens   │
│ 3. Update Last Active    │
└──────────────────────────┘
       ↓
Return Tokens + User Data
       ↓
Frontend: AuthContext
       ↓
Store Tokens in localStorage
       ↓
Update Global Auth State
       ↓
Redirect to /chat
       ↓
All API Calls Include Token
```

### Arena Comparison Flow

```
User Selects Configs
       ↓
ArenaPage Component
       ↓
POST /api/arena/sessions
       ↓
Backend: Create Session
       ↓
socket.emit('arena_send_message', {...})
       ↓
Backend: arena_events.py
       ↓
┌────────────────────────────────┐
│ For Each Config (Parallel):    │
│ 1. eventlet.spawn()            │
│ 2. Call OpenRouter API         │
│ 3. Stream to Specific Panel    │
└────────────────────────────────┘
       ↓
socket.emit('arena_message_chunk', {config_id, content})
       ↓
Frontend: ArenaPanel (per config)
       ↓
Update Respective Panel
       ↓
All Panels Complete
       ↓
Save Arena Messages
```

---

## Deployment Considerations

### Environment Variables

**Backend (.env):**
```
SECRET_KEY=<random-secret>
JWT_SECRET_KEY=<random-secret>
OPENROUTER_API_KEY=<api-key>
MONGO_URI=mongodb://localhost:27017/unichat
ADMIN_EMAIL=admin@admin.com
ADMIN_PASSWORD=admin123
ADMIN_NAME=Administrator
```

**Frontend (.env):**
```
VITE_API_URL=http://localhost:5000
VITE_WS_URL=ws://localhost:5000
```

### Scaling Strategies

**Horizontal Scaling:**
- Deploy multiple Flask instances behind load balancer
- Use sticky sessions for WebSocket connections
- Redis for session storage (future)

**Database Scaling:**
- MongoDB replica set for high availability
- Sharding for large datasets
- Read replicas for analytics

**Caching Layer:**
- Redis for session storage
- Cache frequently accessed configs/templates
- CDN for static assets

### Monitoring

**Metrics to Track:**
- API response times
- WebSocket connection count
- Database query performance
- Error rates
- Token usage and costs
- Active users

**Logging:**
- Structured logging with timestamps
- Error tracking (Sentry integration)
- Audit logs for admin actions

---

## Future Enhancements

### Planned Features

1. **Enhanced Collaboration:**
   - Shared conversations
   - Team workspaces
   - Real-time co-editing

2. **Advanced Analytics:**
   - Usage dashboards
   - Cost optimization suggestions
   - Model performance comparisons

3. **Integrations:**
   - Browser extensions
   - API for third-party apps
   - Webhooks for automation

4. **Content Management:**
   - Knowledge bases
   - Document upload and analysis
   - RAG (Retrieval-Augmented Generation)

5. **Performance:**
   - Response caching
   - Edge deployment (Cloudflare Workers)
   - Database query optimization

6. **UX Improvements:**
   - Voice input/output
   - Mobile applications
   - Offline mode

---

## Conclusion

Uni-Chat is built with a modern, scalable architecture that separates concerns, ensures security, and provides excellent performance. The system is designed to be maintainable, extensible, and ready for future enhancements.

For detailed API documentation, see [API.md](./API.md).
For setup instructions, see [SETUP.md](./SETUP.md).
For deployment guide, see [DEPLOYMENT.md](./DEPLOYMENT.md).
