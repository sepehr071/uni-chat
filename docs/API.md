# API Documentation

Uni-Chat REST API and WebSocket event documentation.

## Base URL

```
Development: http://localhost:5000/api
Production: https://your-domain.com/api
```

## Authentication

All protected endpoints require a JWT access token in the Authorization header:

```
Authorization: Bearer <access_token>
```

Token expires in 15 minutes. Use the `/auth/refresh` endpoint to get a new access token.

## Error Responses

All endpoints return errors in the following format:

```json
{
  "error": "Error message description"
}
```

Common HTTP status codes:
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized (invalid or missing token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `409` - Conflict (e.g., duplicate email)
- `429` - Too Many Requests (rate limit)
- `500` - Internal Server Error

---

## Authentication Endpoints

### POST /api/auth/register

Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "display_name": "John Doe"
}
```

**Validation:**
- Email: valid email format
- Password: minimum 8 characters, at least one uppercase, one lowercase, one number
- Display name: 2-50 characters

**Response (201):**
```json
{
  "message": "Registration successful",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "display_name": "John Doe",
    "role": "user"
  }
}
```

**Error Responses:**
- `400` - Invalid email, password, or display name
- `409` - Email already registered

---

### POST /api/auth/login

Login with email and password.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response (200):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 900,
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "display_name": "John Doe",
    "role": "user",
    "avatar_url": null
  }
}
```

**Error Responses:**
- `400` - Missing email or password
- `401` - Invalid email or password
- `403` - Account banned

---

### POST /api/auth/refresh

Refresh access token using refresh token.

**Headers:**
```
Authorization: Bearer <refresh_token>
```

**Response (200):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 900
}
```

---

### POST /api/auth/logout

Logout and revoke current token.

**Headers:** Requires authentication

**Response (200):**
```json
{
  "message": "Successfully logged out"
}
```

---

### GET /api/auth/me

Get current user information.

**Headers:** Requires authentication

**Response (200):**
```json
{
  "id": "507f1f77bcf86cd799439011",
  "email": "user@example.com",
  "role": "user",
  "profile": {
    "display_name": "John Doe",
    "avatar_url": null,
    "bio": ""
  },
  "settings": {
    "theme": "dark",
    "notifications_enabled": true
  },
  "usage": {
    "messages_sent": 150,
    "tokens_used": 45000,
    "tokens_limit": 100000
  },
  "created_at": "2024-01-15T10:30:00Z"
}
```

---

### PUT /api/auth/password

Change user password.

**Headers:** Requires authentication

**Request Body:**
```json
{
  "current_password": "OldPass123!",
  "new_password": "NewPass456!"
}
```

**Response (200):**
```json
{
  "message": "Password updated successfully"
}
```

**Error Responses:**
- `401` - Current password incorrect
- `400` - Invalid new password

---

## Conversation Endpoints

### GET /api/conversations

Get user's conversations with filtering and pagination.

**Headers:** Requires authentication

**Query Parameters:**
- `folder_id` (optional) - Filter by folder
- `archived` (optional) - `true` to show archived, default `false`
- `search` (optional) - Search in titles
- `page` (optional) - Page number, default `1`
- `limit` (optional) - Items per page, default `20`
- `sort` (optional) - Sort field, default `last_message_at`

**Response (200):**
```json
{
  "conversations": [
    {
      "id": "507f1f77bcf86cd799439011",
      "title": "How to implement JWT auth",
      "user_id": "507f191e810c19729de860ea",
      "config_id": "507f191e810c19729de860eb",
      "folder_id": null,
      "message_count": 12,
      "is_pinned": false,
      "is_archived": false,
      "tags": ["development", "security"],
      "created_at": "2024-01-15T10:30:00Z",
      "last_message_at": "2024-01-15T11:45:00Z",
      "stats": {
        "total_tokens": 5420,
        "input_tokens": 2100,
        "output_tokens": 3320
      }
    }
  ],
  "total": 45,
  "page": 1,
  "limit": 20,
  "has_more": true
}
```

---

### GET /api/conversations/:id

Get a specific conversation with all messages.

**Headers:** Requires authentication

**Response (200):**
```json
{
  "conversation": {
    "id": "507f1f77bcf86cd799439011",
    "title": "How to implement JWT auth",
    "user_id": "507f191e810c19729de860ea",
    "config_id": "507f191e810c19729de860eb",
    "message_count": 12,
    "created_at": "2024-01-15T10:30:00Z",
    "last_message_at": "2024-01-15T11:45:00Z"
  },
  "messages": [
    {
      "id": "507f1f77bcf86cd799439012",
      "conversation_id": "507f1f77bcf86cd799439011",
      "role": "user",
      "content": "How do I implement JWT authentication?",
      "created_at": "2024-01-15T10:30:00Z"
    },
    {
      "id": "507f1f77bcf86cd799439013",
      "conversation_id": "507f1f77bcf86cd799439011",
      "role": "assistant",
      "content": "Here's how to implement JWT authentication...",
      "metadata": {
        "model_id": "anthropic/claude-3-sonnet",
        "tokens": {
          "prompt": 150,
          "completion": 450
        },
        "generation_time_ms": 2300,
        "cost_usd": 0.0021
      },
      "created_at": "2024-01-15T10:30:15Z"
    }
  ]
}
```

**Error Responses:**
- `404` - Conversation not found or not owned by user

---

### POST /api/conversations

Create a new conversation.

**Headers:** Requires authentication

**Request Body:**
```json
{
  "config_id": "507f191e810c19729de860eb",
  "title": "New Conversation",
  "folder_id": "507f191e810c19729de860ec"
}
```

**Response (201):**
```json
{
  "conversation": {
    "id": "507f1f77bcf86cd799439011",
    "title": "New Conversation",
    "user_id": "507f191e810c19729de860ea",
    "config_id": "507f191e810c19729de860eb",
    "folder_id": "507f191e810c19729de860ec",
    "message_count": 0,
    "created_at": "2024-01-15T10:30:00Z"
  }
}
```

---

### PUT /api/conversations/:id

Update conversation details.

**Headers:** Requires authentication

**Request Body:**
```json
{
  "title": "Updated Title",
  "folder_id": "507f191e810c19729de860ec",
  "tags": ["development", "security"],
  "is_pinned": true
}
```

**Response (200):**
```json
{
  "conversation": {
    "id": "507f1f77bcf86cd799439011",
    "title": "Updated Title",
    "is_pinned": true,
    "tags": ["development", "security"]
  }
}
```

---

### DELETE /api/conversations/:id

Delete a conversation and all its messages.

**Headers:** Requires authentication

**Response (200):**
```json
{
  "message": "Conversation deleted"
}
```

---

### POST /api/conversations/:id/archive

Archive or unarchive a conversation.

**Headers:** Requires authentication

**Response (200):**
```json
{
  "message": "Archived",
  "is_archived": true
}
```

---

### GET /api/conversations/search

Search conversations by title.

**Headers:** Requires authentication

**Query Parameters:**
- `q` (required) - Search query

**Response (200):**
```json
{
  "conversations": [...],
  "query": "jwt auth"
}
```

---

### GET /api/conversations/search/messages

Search within message content across all conversations.

**Headers:** Requires authentication

**Query Parameters:**
- `q` (required) - Search query
- `limit` (optional) - Max results, default `50`, max `100`

**Response (200):**
```json
{
  "results": [
    {
      "id": "507f1f77bcf86cd799439013",
      "conversation_id": "507f1f77bcf86cd799439011",
      "role": "assistant",
      "content": "...matching content...",
      "created_at": "2024-01-15T10:30:15Z"
    }
  ],
  "query": "authentication",
  "total": 5
}
```

---

### GET /api/conversations/:id/export

Export conversation in JSON or Markdown format.

**Headers:** Requires authentication

**Query Parameters:**
- `format` (optional) - `json` or `markdown`, default `markdown`
- `metadata` (optional) - Include metadata, default `true`

**Response (200):**
- Content-Type: `application/json` or `text/markdown`
- Content-Disposition: `attachment; filename="conversation_<title>_<date>.{json|md}"`

---

## Chat Endpoints

### POST /api/chat/send

Send a message and get AI response (non-streaming).

**Note:** For real-time streaming, use WebSocket events (see WebSocket section).

**Headers:** Requires authentication

**Request Body:**
```json
{
  "conversation_id": "507f1f77bcf86cd799439011",
  "config_id": "507f191e810c19729de860eb",
  "message": "What is React?",
  "attachments": []
}
```

**Response (200):**
```json
{
  "conversation_id": "507f1f77bcf86cd799439011",
  "user_message": {
    "id": "507f1f77bcf86cd799439012",
    "role": "user",
    "content": "What is React?",
    "created_at": "2024-01-15T10:30:00Z"
  },
  "assistant_message": {
    "id": "507f1f77bcf86cd799439013",
    "role": "assistant",
    "content": "React is a JavaScript library...",
    "metadata": {
      "model_id": "anthropic/claude-3-sonnet",
      "tokens": {
        "prompt": 50,
        "completion": 200
      },
      "generation_time_ms": 1500,
      "cost_usd": 0.0008
    },
    "created_at": "2024-01-15T10:30:02Z"
  },
  "is_new_conversation": false
}
```

**Error Responses:**
- `400` - Missing message or config_id
- `404` - Config or conversation not found
- `429` - Token limit reached

---

### GET /api/chat/:conversation_id/messages

Get messages for a conversation with pagination.

**Headers:** Requires authentication

**Query Parameters:**
- `page` (optional) - Page number, default `1`
- `limit` (optional) - Items per page, default `100`

**Response (200):**
```json
{
  "messages": [...],
  "total": 45,
  "page": 1,
  "limit": 100
}
```

---

### DELETE /api/chat/messages/:id

Delete a specific message.

**Headers:** Requires authentication

**Response (200):**
```json
{
  "message": "Message deleted"
}
```

---

### PUT /api/chat/messages/:id

Edit a user message and optionally regenerate AI response.

**Headers:** Requires authentication

**Request Body:**
```json
{
  "content": "Updated message content",
  "regenerate": true
}
```

**Response (200):**
```json
{
  "message": {
    "id": "507f1f77bcf86cd799439012",
    "content": "Updated message content",
    "is_edited": true,
    "edit_history": [...]
  },
  "deleted_count": 5,
  "assistant_message": {
    "id": "507f1f77bcf86cd799439014",
    "content": "New regenerated response...",
    "metadata": {...}
  }
}
```

---

### POST /api/chat/regenerate/:id

Regenerate an assistant message.

**Headers:** Requires authentication

**Response (200):**
```json
{
  "message": {
    "id": "507f1f77bcf86cd799439015",
    "role": "assistant",
    "content": "Regenerated response...",
    "metadata": {...}
  }
}
```

---

## LLM Configuration Endpoints

### GET /api/configs

Get user's LLM configurations.

**Headers:** Requires authentication

**Query Parameters:**
- `page` (optional) - Page number, default `1`
- `limit` (optional) - Items per page, default `50`

**Response (200):**
```json
{
  "configs": [
    {
      "id": "507f191e810c19729de860eb",
      "name": "Code Assistant",
      "model_id": "anthropic/claude-3-sonnet",
      "model_name": "Claude 3 Sonnet",
      "owner_id": "507f191e810c19729de860ea",
      "visibility": "private",
      "description": "Helpful coding assistant",
      "system_prompt": "You are a helpful coding assistant...",
      "avatar": "👨‍💻",
      "parameters": {
        "temperature": 0.7,
        "max_tokens": 2048,
        "top_p": 1.0,
        "frequency_penalty": 0.0,
        "presence_penalty": 0.0
      },
      "tags": ["coding", "development"],
      "stats": {
        "uses_count": 45,
        "saves_count": 12
      },
      "created_at": "2024-01-10T08:00:00Z",
      "updated_at": "2024-01-15T10:00:00Z"
    }
  ],
  "total": 8,
  "page": 1,
  "limit": 50
}
```

---

### GET /api/configs/:id

Get a specific configuration.

**Headers:** Requires authentication

**Response (200):**
```json
{
  "config": {
    "id": "507f191e810c19729de860eb",
    "name": "Code Assistant",
    "model_id": "anthropic/claude-3-sonnet",
    ...
  }
}
```

**Error Responses:**
- `404` - Config not found or not accessible

---

### POST /api/configs

Create a new LLM configuration.

**Headers:** Requires authentication

**Request Body:**
```json
{
  "name": "My Assistant",
  "model_id": "anthropic/claude-3-sonnet",
  "model_name": "Claude 3 Sonnet",
  "description": "Custom assistant for...",
  "system_prompt": "You are a helpful assistant...",
  "avatar": "🤖",
  "parameters": {
    "temperature": 0.7,
    "max_tokens": 2048,
    "top_p": 1.0,
    "frequency_penalty": 0.0,
    "presence_penalty": 0.0
  },
  "tags": ["general"]
}
```

**Response (201):**
```json
{
  "config": {
    "id": "507f191e810c19729de860eb",
    "name": "My Assistant",
    ...
  }
}
```

**Error Responses:**
- `400` - Invalid name, model_id, or system_prompt

---

### PUT /api/configs/:id

Update a configuration.

**Headers:** Requires authentication

**Request Body:**
```json
{
  "name": "Updated Name",
  "description": "Updated description",
  "system_prompt": "Updated prompt...",
  "parameters": {...},
  "tags": ["updated", "tags"]
}
```

**Response (200):**
```json
{
  "config": {
    "id": "507f191e810c19729de860eb",
    "name": "Updated Name",
    ...
  }
}
```

---

### DELETE /api/configs/:id

Delete a configuration.

**Headers:** Requires authentication

**Response (200):**
```json
{
  "message": "Config deleted"
}
```

---

### POST /api/configs/:id/publish

Make a configuration public (share to gallery).

**Headers:** Requires authentication

**Response (200):**
```json
{
  "message": "Config published",
  "visibility": "public"
}
```

---

### POST /api/configs/:id/unpublish

Make a configuration private.

**Headers:** Requires authentication

**Response (200):**
```json
{
  "message": "Config unpublished",
  "visibility": "private"
}
```

---

### POST /api/configs/:id/duplicate

Duplicate a configuration.

**Headers:** Requires authentication

**Request Body:**
```json
{
  "name": "Copy of Config Name"
}
```

**Response (201):**
```json
{
  "config": {
    "id": "507f191e810c19729de860ec",
    "name": "Copy of Config Name",
    ...
  }
}
```

---

### POST /api/configs/enhance-prompt

Enhance a system prompt using AI.

**Headers:** Requires authentication

**Request Body:**
```json
{
  "prompt": "You are a helpful assistant"
}
```

**Response (200):**
```json
{
  "enhanced_prompt": "You are a highly knowledgeable and helpful AI assistant. Your role is to provide clear, accurate, and comprehensive responses..."
}
```

**Error Responses:**
- `400` - Prompt too long (max 10000 characters)

---

## Gallery Endpoints

### GET /api/gallery

Browse public configurations.

**Headers:** Requires authentication

**Query Parameters:**
- `search` (optional) - Search in name/description
- `tags` (optional) - Comma-separated tags
- `model` (optional) - Filter by model
- `sort` (optional) - Sort by `uses_count`, `saves_count`, `created_at`, default `uses_count`
- `page` (optional) - Page number, default `1`
- `limit` (optional) - Items per page, default `20`

**Response (200):**
```json
{
  "configs": [...],
  "total": 150,
  "page": 1,
  "limit": 20,
  "has_more": true
}
```

---

### GET /api/gallery/templates

Get admin-created templates.

**Headers:** Requires authentication

**Query Parameters:**
- `page` (optional) - Page number, default `1`
- `limit` (optional) - Items per page, default `50`

**Response (200):**
```json
{
  "templates": [...]
}
```

---

### GET /api/gallery/:id

Get public configuration details.

**Headers:** Requires authentication

**Response (200):**
```json
{
  "config": {...}
}
```

---

### POST /api/gallery/:id/save

Save a public config to user's collection (bookmark).

**Headers:** Requires authentication

**Response (200):**
```json
{
  "message": "Config saved to your collection"
}
```

---

### POST /api/gallery/:id/unsave

Remove config from user's saved collection.

**Headers:** Requires authentication

**Response (200):**
```json
{
  "message": "Config removed from your collection"
}
```

---

### POST /api/gallery/:id/use

Use a config (creates a copy for the user).

**Headers:** Requires authentication

**Response (200):**
```json
{
  "config": {...},
  "message": "Config copied to your collection"
}
```

---

### GET /api/gallery/saved

Get user's saved configs from gallery.

**Headers:** Requires authentication

**Response (200):**
```json
{
  "configs": [...]
}
```

---

## Image Generation Endpoints

### GET /api/image-gen/models

Get available image generation models.

**Headers:** Requires authentication

**Response (200):**
```json
{
  "models": [
    {
      "id": "bytedance-seed/seedream-4.5",
      "name": "ByteDance Seedream 4.5",
      "description": "Supports up to 14 reference images, 2048x2048 max resolution",
      "pricing": {
        "image": "0.04"
      }
    },
    {
      "id": "black-forest-labs/flux.2-flex",
      "name": "Black Forest Labs FLUX.2 Flex",
      "description": "Supports up to 5 reference images, 4MP resolution",
      "pricing": {
        "image": "varies"
      }
    }
  ]
}
```

---

### POST /api/image-gen/generate

Generate an image from text prompt.

**Headers:** Requires authentication

**Request Body:**
```json
{
  "prompt": "A beautiful sunset over mountains",
  "model": "bytedance-seed/seedream-4.5",
  "negative_prompt": "blurry, low quality",
  "input_images": []
}
```

**Note:** `input_images` should be an array of base64 data URIs or URLs for image-to-image generation.

**Response (200):**
```json
{
  "image": {
    "id": "507f1f77bcf86cd799439011",
    "user_id": "507f191e810c19729de860ea",
    "prompt": "A beautiful sunset over mountains",
    "model_id": "bytedance-seed/seedream-4.5",
    "negative_prompt": "blurry, low quality",
    "is_favorite": false,
    "settings": {
      "input_images_count": 0,
      "has_input_images": false
    },
    "metadata": {
      "generation_time_ms": 8500,
      "usage": {}
    },
    "created_at": "2024-01-15T12:00:00Z"
  },
  "image_data": "data:image/png;base64,iVBORw0KGgoAAAANS..."
}
```

**Error Responses:**
- `400` - Missing prompt or model, invalid input images
- `500` - Generation failed

---

### GET /api/image-gen/history

Get user's image generation history.

**Headers:** Requires authentication

**Query Parameters:**
- `page` (optional) - Page number, default `1`
- `limit` (optional) - Items per page, default `20`
- `favorites` (optional) - `true` for favorites only, default `false`

**Response (200):**
```json
{
  "images": [...],
  "total": 25,
  "page": 1,
  "pages": 2
}
```

---

### DELETE /api/image-gen/:id

Delete a generated image.

**Headers:** Requires authentication

**Response (200):**
```json
{
  "message": "Image deleted"
}
```

---

### POST /api/image-gen/:id/favorite

Toggle favorite status for an image.

**Headers:** Requires authentication

**Response (200):**
```json
{
  "is_favorite": true
}
```

---

## Arena Endpoints

### POST /api/arena/sessions

Create a new arena session for multi-config comparison.

**Headers:** Requires authentication

**Request Body:**
```json
{
  "config_ids": [
    "507f191e810c19729de860eb",
    "507f191e810c19729de860ec",
    "507f191e810c19729de860ed"
  ],
  "title": "GPT vs Claude vs Gemini"
}
```

**Note:** Minimum 2 configs, maximum 4 configs.

**Response (201):**
```json
{
  "session": {
    "id": "507f1f77bcf86cd799439011",
    "user_id": "507f191e810c19729de860ea",
    "config_ids": [...],
    "title": "GPT vs Claude vs Gemini",
    "message_count": 0,
    "created_at": "2024-01-15T14:00:00Z"
  }
}
```

**Error Responses:**
- `400` - Less than 2 or more than 4 configs
- `404` - Config not found

---

### GET /api/arena/sessions

List user's arena sessions.

**Headers:** Requires authentication

**Query Parameters:**
- `page` (optional) - Page number, default `1`
- `limit` (optional) - Items per page, default `20`

**Response (200):**
```json
{
  "sessions": [...]
}
```

---

### GET /api/arena/sessions/:id

Get arena session with messages and configs.

**Headers:** Requires authentication

**Response (200):**
```json
{
  "session": {
    "id": "507f1f77bcf86cd799439011",
    "user_id": "507f191e810c19729de860ea",
    "config_ids": [...],
    "title": "GPT vs Claude vs Gemini",
    "message_count": 6,
    "created_at": "2024-01-15T14:00:00Z"
  },
  "messages": [
    {
      "id": "507f1f77bcf86cd799439012",
      "session_id": "507f1f77bcf86cd799439011",
      "role": "user",
      "content": "What is quantum computing?",
      "created_at": "2024-01-15T14:05:00Z"
    },
    {
      "id": "507f1f77bcf86cd799439013",
      "session_id": "507f1f77bcf86cd799439011",
      "role": "assistant",
      "config_id": "507f191e810c19729de860eb",
      "content": "Quantum computing is...",
      "metadata": {...},
      "created_at": "2024-01-15T14:05:03Z"
    }
  ],
  "configs": [...]
}
```

---

### DELETE /api/arena/sessions/:id

Delete an arena session and its messages.

**Headers:** Requires authentication

**Response (200):**
```json
{
  "message": "Session deleted"
}
```

---

## Prompt Template Endpoints

### GET /api/prompt-templates/

Get all active prompt templates.

**Headers:** Requires authentication

**Query Parameters:**
- `category` (optional) - Filter by category

**Response (200):**
```json
{
  "templates": [
    {
      "id": "507f1f77bcf86cd799439011",
      "name": "Marketing Copy",
      "category": "marketing",
      "template_text": "Create compelling marketing copy for {product} targeting {audience}...",
      "variables": ["product", "audience"],
      "description": "Generate marketing copy",
      "usage_count": 145,
      "is_active": true,
      "created_at": "2024-01-10T08:00:00Z"
    }
  ]
}
```

---

### GET /api/prompt-templates/categories

Get list of all template categories.

**Headers:** Requires authentication

**Response (200):**
```json
{
  "categories": ["marketing", "development", "writing", "analysis"]
}
```

---

### POST /api/prompt-templates/:id/use

Increment usage count when template is used.

**Headers:** Requires authentication

**Response (200):**
```json
{
  "message": "Usage recorded"
}
```

---

### POST /api/prompt-templates/ (Admin Only)

Create a new prompt template.

**Headers:** Requires authentication + admin role

**Request Body:**
```json
{
  "name": "New Template",
  "category": "marketing",
  "template_text": "Template with {variable1} and {variable2}",
  "variables": ["variable1", "variable2"],
  "description": "Description of template"
}
```

**Response (201):**
```json
{
  "message": "Template created",
  "template": {...}
}
```

---

### PUT /api/prompt-templates/:id (Admin Only)

Update a prompt template.

**Headers:** Requires authentication + admin role

**Request Body:**
```json
{
  "name": "Updated Name",
  "template_text": "Updated template",
  "is_active": true
}
```

**Response (200):**
```json
{
  "message": "Template updated"
}
```

---

### DELETE /api/prompt-templates/:id (Admin Only)

Delete a prompt template.

**Headers:** Requires authentication + admin role

**Response (200):**
```json
{
  "message": "Template deleted"
}
```

---

## Model Endpoints

### GET /api/models

Get list of available OpenRouter models.

**Headers:** Requires authentication

**Response (200):**
```json
{
  "models": [
    {
      "id": "anthropic/claude-3-sonnet",
      "name": "Claude 3 Sonnet",
      "description": "Balance of intelligence and speed",
      "context_length": 200000,
      "pricing": {
        "prompt": "0.003",
        "completion": "0.015"
      },
      "top_provider": {
        "max_completion_tokens": 4096
      },
      "architecture": {
        "modality": "text",
        "tokenizer": "Claude",
        "instruct_type": "claude"
      }
    }
  ],
  "count": 150
}
```

---

### GET /api/models/:model_id

Get details for a specific model.

**Headers:** Requires authentication

**Response (200):**
```json
{
  "model": {
    "id": "anthropic/claude-3-sonnet",
    "name": "Claude 3 Sonnet",
    "description": "Balance of intelligence and speed",
    "context_length": 200000,
    "pricing": {...},
    "top_provider": {...},
    "architecture": {...},
    "per_request_limits": {...}
  }
}
```

---

### POST /api/models/refresh

Force refresh the models cache.

**Headers:** Requires authentication

**Response (200):**
```json
{
  "message": "Models cache refreshed",
  "count": 150
}
```

---

### GET /api/models/categories

Get models grouped by provider.

**Headers:** Requires authentication

**Response (200):**
```json
{
  "categories": {
    "openai": [
      {
        "id": "openai/gpt-4",
        "name": "GPT-4",
        "context_length": 8192
      }
    ],
    "anthropic": [...],
    "google": [...]
  }
}
```

---

## Admin Endpoints

All admin endpoints require authentication with an `admin` role.

### GET /api/admin/users

Get all users with filtering and pagination.

**Headers:** Requires authentication + admin role

**Query Parameters:**
- `page` (optional) - Page number, default `1`
- `limit` (optional) - Items per page, default `20`
- `include_banned` (optional) - Include banned users, default `true`
- `search` (optional) - Search in email and display name

**Response (200):**
```json
{
  "users": [
    {
      "id": "507f191e810c19729de860ea",
      "email": "user@example.com",
      "role": "user",
      "profile": {
        "display_name": "John Doe",
        "avatar_url": null
      },
      "usage": {
        "messages_sent": 150,
        "tokens_used": 45000,
        "tokens_limit": 100000
      },
      "status": {
        "is_banned": false,
        "ban_reason": null
      },
      "created_at": "2024-01-10T08:00:00Z"
    }
  ],
  "total": 450,
  "page": 1,
  "limit": 20,
  "has_more": true
}
```

---

### GET /api/admin/users/:id

Get detailed user information.

**Headers:** Requires authentication + admin role

**Response (200):**
```json
{
  "user": {
    "id": "507f191e810c19729de860ea",
    "email": "user@example.com",
    "role": "user",
    "profile": {...},
    "usage": {...},
    "status": {...},
    "stats": {
      "conversation_count": 45,
      "config_count": 8
    },
    "created_at": "2024-01-10T08:00:00Z"
  }
}
```

---

### PUT /api/admin/users/:id/ban

Ban a user account.

**Headers:** Requires authentication + admin role

**Request Body:**
```json
{
  "reason": "Violation of terms of service"
}
```

**Response (200):**
```json
{
  "message": "User banned",
  "user_id": "507f191e810c19729de860ea",
  "reason": "Violation of terms of service"
}
```

**Error Responses:**
- `400` - Cannot ban yourself or other admins

---

### PUT /api/admin/users/:id/unban

Unban a user account.

**Headers:** Requires authentication + admin role

**Response (200):**
```json
{
  "message": "User unbanned",
  "user_id": "507f191e810c19729de860ea"
}
```

---

### PUT /api/admin/users/:id/limits

Set usage limits for a user.

**Headers:** Requires authentication + admin role

**Request Body:**
```json
{
  "tokens_limit": 500000
}
```

**Note:** Set to `-1` for unlimited.

**Response (200):**
```json
{
  "message": "User limits updated",
  "user_id": "507f191e810c19729de860ea",
  "tokens_limit": 500000
}
```

---

### GET /api/admin/users/:id/history

Get user's chat history.

**Headers:** Requires authentication + admin role

**Query Parameters:**
- `page` (optional) - Page number, default `1`
- `limit` (optional) - Items per page, default `20`
- `include_messages` (optional) - Include messages in conversations, default `false`

**Response (200):**
```json
{
  "conversations": [...],
  "user": {
    "id": "507f191e810c19729de860ea",
    "email": "user@example.com",
    "display_name": "John Doe"
  }
}
```

---

### GET /api/admin/templates

Get all config templates.

**Headers:** Requires authentication + admin role

**Response (200):**
```json
{
  "templates": [...]
}
```

---

### POST /api/admin/templates

Create a new config template.

**Headers:** Requires authentication + admin role

**Request Body:**
```json
{
  "name": "Template Name",
  "model_id": "anthropic/claude-3-sonnet",
  "model_name": "Claude 3 Sonnet",
  "description": "Template description",
  "system_prompt": "You are...",
  "avatar": "🤖",
  "parameters": {...},
  "tags": ["general"]
}
```

**Response (201):**
```json
{
  "template": {
    "id": "507f191e810c19729de860eb",
    "visibility": "template",
    ...
  }
}
```

---

### PUT /api/admin/templates/:id

Update a config template.

**Headers:** Requires authentication + admin role

**Request Body:**
```json
{
  "name": "Updated Name",
  "description": "Updated description"
}
```

**Response (200):**
```json
{
  "template": {...}
}
```

---

### DELETE /api/admin/templates/:id

Delete a config template.

**Headers:** Requires authentication + admin role

**Response (200):**
```json
{
  "message": "Template deleted"
}
```

---

### GET /api/admin/analytics

Get usage analytics and statistics.

**Headers:** Requires authentication + admin role

**Query Parameters:**
- `days` (optional) - Time range in days, default `30`

**Response (200):**
```json
{
  "analytics": {
    "users": {
      "total": 450,
      "active": 120
    },
    "conversations": {
      "total": 5600,
      "recent": 450
    },
    "messages": {
      "total": 45000
    },
    "tokens": {
      "total": 12500000
    },
    "model_usage": [
      {
        "_id": "anthropic/claude-3-sonnet",
        "count": 1500,
        "total_tokens": 4500000
      }
    ],
    "period_days": 30
  }
}
```

---

### GET /api/admin/analytics/costs

Get API cost breakdown.

**Headers:** Requires authentication + admin role

**Query Parameters:**
- `days` (optional) - Time range in days, default `30`

**Response (200):**
```json
{
  "costs": {
    "by_model": [
      {
        "_id": "anthropic/claude-3-sonnet",
        "total_cost": 125.50,
        "total_requests": 1500,
        "total_tokens": 4500000
      }
    ],
    "total_cost_usd": 350.75,
    "period_days": 30
  }
}
```

---

### GET /api/admin/analytics/timeseries

Get time-series analytics for charts.

**Headers:** Requires authentication + admin role

**Query Parameters:**
- `days` (optional) - Time range in days, default `30`
- `granularity` (optional) - `day`, `week`, `month`, default `day`

**Response (200):**
```json
{
  "timeseries": {
    "messages": [
      {"date": "2024-01-15", "value": 450},
      {"date": "2024-01-16", "value": 520}
    ],
    "users": [
      {"date": "2024-01-15", "value": 5},
      {"date": "2024-01-16", "value": 8}
    ],
    "conversations": [...],
    "tokens": [...],
    "popular_models": [
      {"model": "anthropic/claude-3-sonnet", "count": 150}
    ],
    "period_days": 30,
    "granularity": "day"
  }
}
```

---

### GET /api/admin/audit-logs

Get audit logs with filtering and pagination.

**Headers:** Requires authentication + admin role

**Query Parameters:**
- `skip` (optional) - Skip N records, default `0`
- `limit` (optional) - Items per page, default `50`
- `action` (optional) - Filter by action type

**Response (200):**
```json
{
  "logs": [
    {
      "id": "507f1f77bcf86cd799439011",
      "admin_id": "507f191e810c19729de860ea",
      "admin_email": "admin@example.com",
      "action": "ban_user",
      "target_id": "507f191e810c19729de860eb",
      "details": {
        "reason": "Violation of terms"
      },
      "created_at": "2024-01-15T14:30:00Z"
    }
  ],
  "total": 250,
  "skip": 0,
  "limit": 50
}
```

---

## User Endpoints

### GET /api/users/profile

Get user profile information.

**Headers:** Requires authentication

**Response (200):**
```json
{
  "user": {
    "id": "507f191e810c19729de860ea",
    "email": "user@example.com",
    "profile": {
      "display_name": "John Doe",
      "avatar_url": null,
      "bio": "Software developer"
    },
    "settings": {...},
    "usage": {...}
  }
}
```

---

### PUT /api/users/profile

Update user profile.

**Headers:** Requires authentication

**Request Body:**
```json
{
  "display_name": "John Smith",
  "bio": "Full-stack developer",
  "avatar_url": "https://..."
}
```

**Response (200):**
```json
{
  "user": {...}
}
```

---

### PUT /api/users/settings

Update user settings.

**Headers:** Requires authentication

**Request Body:**
```json
{
  "theme": "dark",
  "notifications_enabled": true,
  "language": "en"
}
```

**Response (200):**
```json
{
  "settings": {...}
}
```

---

## Health Check Endpoints

### GET /api/health

Health check endpoint (no authentication required).

**Response (200):**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T14:00:00Z",
  "version": "1.0.0"
}
```

---

## WebSocket Events

WebSocket connection endpoint: `ws://localhost:5000/socket.io`

**Connection:**
```javascript
import io from 'socket.io-client'

const socket = io('http://localhost:5000', {
  auth: {
    token: '<access_token>'
  }
})
```

### Connection Events

#### connect
Fired when socket connects successfully.

```javascript
socket.on('connect', () => {
  console.log('Connected:', socket.id)
})
```

---

#### authenticated
Fired after successful authentication.

```javascript
socket.on('authenticated', (data) => {
  console.log('Authenticated as:', data.user_id)
})
```

---

#### disconnect
Fired when socket disconnects.

```javascript
socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason)
})
```

---

#### error
Fired when an error occurs.

```javascript
socket.on('error', (error) => {
  console.error('Socket error:', error.message)
})
```

---

### Chat Events

#### send_message (emit)
Send a message and stream AI response.

```javascript
socket.emit('send_message', {
  conversation_id: '507f1f77bcf86cd799439011',  // Optional for new conversation
  config_id: '507f191e810c19729de860eb',
  message: 'What is React?',
  attachments: []
})
```

---

#### conversation_created (receive)
New conversation was created.

```javascript
socket.on('conversation_created', (data) => {
  console.log('New conversation:', data.conversation)
})
```

---

#### message_saved (receive)
User message was saved.

```javascript
socket.on('message_saved', (data) => {
  console.log('Message saved:', data.message)
  console.log('Conversation ID:', data.conversation_id)
})
```

---

#### message_start (receive)
AI response generation started.

```javascript
socket.on('message_start', (data) => {
  console.log('Generation started')
  console.log('Message ID:', data.message_id)
  console.log('Conversation ID:', data.conversation_id)
})
```

---

#### message_chunk (receive)
Streaming chunk of AI response.

```javascript
socket.on('message_chunk', (data) => {
  console.log('Chunk:', data.content)
  console.log('Message ID:', data.message_id)
  // Append to UI
})
```

---

#### message_complete (receive)
AI response generation completed.

```javascript
socket.on('message_complete', (data) => {
  console.log('Complete message:', data.content)
  console.log('Metadata:', data.metadata)
  // metadata includes: model_id, tokens, generation_time_ms, cost_usd
})
```

---

#### message_error (receive)
Error during message generation.

```javascript
socket.on('message_error', (data) => {
  console.error('Generation error:', data.error)
  console.log('Message ID:', data.message_id)
})
```

---

#### title_updated (receive)
Conversation title was auto-generated.

```javascript
socket.on('title_updated', (data) => {
  console.log('Title updated:', data.title)
  console.log('Conversation ID:', data.conversation_id)
})
```

---

#### stop_generation (emit)
Stop ongoing generation.

```javascript
socket.emit('stop_generation', {
  message_id: '507f1f77bcf86cd799439013'
})
```

---

#### generation_stopped (receive)
Confirmation that generation was stopped.

```javascript
socket.on('generation_stopped', (data) => {
  console.log('Generation stopped for:', data.message_id)
})
```

---

#### regenerate_message (emit)
Regenerate an assistant message.

```javascript
socket.emit('regenerate_message', {
  message_id: '507f1f77bcf86cd799439013'
})
```

This will trigger the same sequence of events as `send_message`: `message_start`, `message_chunk`, `message_complete`.

---

### Arena Events

#### arena_send_message (emit)
Send message to multiple configs simultaneously.

```javascript
socket.emit('arena_send_message', {
  session_id: '507f1f77bcf86cd799439011',  // Optional for new session
  config_ids: [
    '507f191e810c19729de860eb',
    '507f191e810c19729de860ec'
  ],
  message: 'What is quantum computing?'
})
```

---

#### arena_session_created (receive)
New arena session was created.

```javascript
socket.on('arena_session_created', (data) => {
  console.log('Arena session:', data.session)
})
```

---

#### arena_user_message (receive)
User message was saved to arena session.

```javascript
socket.on('arena_user_message', (data) => {
  console.log('User message:', data.message)
  console.log('Session ID:', data.session_id)
})
```

---

#### arena_message_start (receive)
Generation started for a specific config.

```javascript
socket.on('arena_message_start', (data) => {
  console.log('Generation started for config:', data.config_id)
  console.log('Message ID:', data.message_id)
  console.log('Session ID:', data.session_id)
})
```

---

#### arena_message_chunk (receive)
Streaming chunk from a specific config.

```javascript
socket.on('arena_message_chunk', (data) => {
  console.log('Config:', data.config_id)
  console.log('Chunk:', data.content)
  console.log('Message ID:', data.message_id)
  // Append to corresponding panel in UI
})
```

---

#### arena_message_complete (receive)
Generation completed for a specific config.

```javascript
socket.on('arena_message_complete', (data) => {
  console.log('Config:', data.config_id)
  console.log('Complete:', data.content)
  console.log('Metadata:', data.metadata)
})
```

---

#### arena_message_error (receive)
Error during generation for a specific config.

```javascript
socket.on('arena_message_error', (data) => {
  console.error('Config:', data.config_id)
  console.error('Error:', data.error)
})
```

---

#### arena_stop_generation (emit)
Stop all ongoing generations in session.

```javascript
socket.emit('arena_stop_generation', {
  session_id: '507f1f77bcf86cd799439011'
})
```

---

#### arena_generation_stopped (receive)
Confirmation that arena generation was stopped.

```javascript
socket.on('arena_generation_stopped', (data) => {
  console.log('Arena generation stopped for:', data.session_id)
})
```

---

## Rate Limiting

Rate limits are applied per user:
- **Authentication endpoints:** 5 requests per minute
- **Chat endpoints:** 30 requests per minute
- **Other endpoints:** 60 requests per minute

When rate limit is exceeded, you'll receive a `429 Too Many Requests` response:

```json
{
  "error": "Rate limit exceeded. Please try again later."
}
```

---

## Pagination

All list endpoints support pagination with the following parameters:
- `page` - Page number (1-indexed)
- `limit` - Items per page
- `skip` - Skip N items (alternative to page)

Response includes:
```json
{
  "items": [...],
  "total": 150,
  "page": 1,
  "limit": 20,
  "has_more": true
}
```

---

## CORS

The API supports CORS for the following origins:
- `http://localhost:3000` (development)
- Your production domain

Preflight requests are handled automatically.

---

## Content Types

All request bodies should be sent as `application/json`.
All responses are returned as `application/json` unless otherwise specified (e.g., file exports).

---

## Examples

### Complete Chat Flow

```javascript
// 1. Connect to WebSocket
const socket = io('http://localhost:5000', {
  auth: { token: accessToken }
})

// 2. Listen for events
socket.on('message_chunk', (data) => {
  appendToUI(data.content)
})

socket.on('message_complete', (data) => {
  saveMessage(data)
})

// 3. Send message
socket.emit('send_message', {
  config_id: 'my-config-id',
  message: 'Hello, AI!'
})
```

### Arena Comparison

```javascript
// Create session with 3 configs
const response = await fetch('/api/arena/sessions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    config_ids: ['gpt4-id', 'claude-id', 'gemini-id'],
    title: 'Model Comparison'
  })
})

const { session } = await response.json()

// Send message to all configs
socket.emit('arena_send_message', {
  session_id: session.id,
  config_ids: session.config_ids,
  message: 'Explain quantum computing'
})

// Listen for responses from each config
socket.on('arena_message_chunk', (data) => {
  updatePanel(data.config_id, data.content)
})
```

---

## Support

For API issues or questions:
- GitHub Issues: [github.com/yourrepo/uni-chat/issues](https://github.com)
- Email: support@uni-chat.com
- Documentation: [docs.uni-chat.com](https://docs.uni-chat.com)
