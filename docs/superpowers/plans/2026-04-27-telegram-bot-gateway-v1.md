# Telegram Bot Gateway v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Telegram bot that lets a linked uni-chat user chat (text only) from inside Telegram, persisting to the same MongoDB and reusing existing models, AI Preferences, and OpenRouter service.

**Architecture:** New `bot/` service runs as a separate aiogram v3 process (systemd unit `unichat-bot`, port 8081), behind nginx on `api.sepijan.xyz`. Bot reuses backend `app` package (installed editable via `uv pip install -e ../backend`) and reads/writes the shared MongoDB. Web Flask app stays untouched at runtime; only gains three thin link-management endpoints + a Settings UI panel.

**Tech Stack:** Python 3.12 + aiogram 3.x + aiohttp + pymongo (bot); Flask + Flask-JWT-Extended + flask-pymongo (backend reused); React 18 + Tailwind + shadcn/ui (frontend); systemd + nginx (deploy).

**Source spec:** `C:\Users\sepito\.claude\plans\do-a-research-on-dazzling-ripple.md`

---

## File Structure

**Backend — new**
- `backend/app/models/telegram_link_token.py` — `TelegramLinkTokenModel` (create/consume one-time tokens, TTL)
- `backend/app/routes/telegram_link.py` — `telegram_link_bp` (3 endpoints under `/api/users/telegram`)
- `backend/pyproject.toml` — minimal package metadata so the bot's venv can `pip install -e ../backend`
- `backend/tests/test_telegram_link_token_model.py`
- `backend/tests/test_telegram_link_routes.py`

**Backend — modified**
- `backend/app/__init__.py` — register `telegram_link_bp` at `/api/users/telegram`
- `backend/app/models/user.py` — add `find_by_telegram_id`, `set_telegram_link`, `clear_telegram_link`
- `backend/.env.example` — document new env vars (also lives in `bot/.env.example`)

**Bot — new (whole tree)**
- `bot/pyproject.toml` — aiogram, aiohttp, pymongo, markdown-it-py, pydantic-settings; `-e ../backend`
- `bot/.env.example`
- `bot/README.md` — local-dev (polling) + prod (webhook) instructions
- `bot/bot/__init__.py`
- `bot/bot/settings.py` — pydantic-settings env config
- `bot/bot/flask_ctx.py` — `from app import create_app; app = create_app()`
- `bot/bot/main.py` — entry point (webhook server OR polling depending on `POLLING` env)
- `bot/bot/keyboards.py` — inline keyboards (model picker, history)
- `bot/bot/services/__init__.py`
- `bot/bot/services/format.py` — markdown → Telegram-HTML allowlist
- `bot/bot/services/ratelimit.py` — sliding-window per-user check
- `bot/bot/services/stream.py` — `stream_to_tg` adaptive edit batching
- `bot/bot/services/auth.py` — `resolve_user(telegram_id)` with LRU cache
- `bot/bot/services/chat.py` — orchestrate user-message → OpenRouter → persisted assistant message
- `bot/bot/handlers/__init__.py`
- `bot/bot/handlers/start.py` — `/start` + `/start <token>` link consume
- `bot/bot/handlers/commands.py` — `/new` `/help` `/history` `/unlink` `/model` `/assistant` (callbacks)
- `bot/bot/handlers/chat.py` — plain text → `chat.py` service → `stream_to_tg`
- `bot/tests/__init__.py`
- `bot/tests/test_format.py`
- `bot/tests/test_ratelimit.py`
- `bot/tests/test_stream.py`

**Frontend — new**
- `frontend/src/services/telegramService.js`
- `frontend/src/pages/dashboard/components/TelegramLinkPanel.jsx`

**Frontend — modified**
- `frontend/src/pages/dashboard/SettingsPage.jsx` — add `telegram` tab + `TelegramLinkPanel`

**Deployment — new**
- `deploy/unichat-bot.service` (systemd unit, committed as ref)
- `deploy/nginx-telegram.conf` (snippet to merge into existing site, committed as ref)
- `.github/workflows/deploy-bot.yml`

---

## Phase A — Backend Foundation

### Task A1: User model — Telegram helper methods (TDD)

**Files:**
- Modify: `backend/app/models/user.py` (append new staticmethods after `update_last_active`, before `get_ai_preferences`)
- Test: `backend/tests/test_models/test_user_telegram.py` (new)

- [x] **Step 1: Write the failing tests**

```python
# backend/tests/test_models/test_user_telegram.py
import pytest
from bson import ObjectId
from app.models.user import UserModel


class TestUserTelegram:
    def test_find_by_telegram_id_returns_none_when_unset(self, db, test_user):
        assert UserModel.find_by_telegram_id(123456789) is None

    def test_set_and_find_by_telegram_id(self, db, test_user):
        UserModel.set_telegram_link(str(test_user['_id']), 123456789, 'sepehr')
        found = UserModel.find_by_telegram_id(123456789)
        assert found is not None
        assert found['_id'] == test_user['_id']
        assert found['telegram_username'] == 'sepehr'
        assert 'telegram_linked_at' in found

    def test_clear_telegram_link_unsets_fields(self, db, test_user):
        UserModel.set_telegram_link(str(test_user['_id']), 123456789, 'sepehr')
        UserModel.clear_telegram_link(str(test_user['_id']))
        assert UserModel.find_by_telegram_id(123456789) is None
        u = UserModel.find_by_id(str(test_user['_id']))
        assert u.get('telegram_id') is None
```

- [x] **Step 2: Run tests, verify they fail**

Run: `cd backend && ./.venv-uv/Scripts/python.exe -m pytest tests/test_models/test_user_telegram.py -v`
Expected: FAIL with `AttributeError: type object 'UserModel' has no attribute 'find_by_telegram_id'`

- [x] **Step 3: Implement the methods**

Append to `backend/app/models/user.py` immediately after the `update_last_active` staticmethod (before any `get_ai_preferences` block):

```python
    @staticmethod
    def find_by_telegram_id(telegram_id):
        """Find user by Telegram ID (None if no user has it)"""
        return UserModel.get_collection().find_one({'telegram_id': int(telegram_id)})

    @staticmethod
    def set_telegram_link(user_id, telegram_id, telegram_username=None):
        """Bind a Telegram account to this user"""
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        return UserModel.get_collection().update_one(
            {'_id': user_id},
            {'$set': {
                'telegram_id': int(telegram_id),
                'telegram_username': telegram_username,
                'telegram_linked_at': datetime.utcnow(),
                'updated_at': datetime.utcnow(),
            }}
        )

    @staticmethod
    def clear_telegram_link(user_id):
        """Unbind Telegram from this user"""
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        return UserModel.get_collection().update_one(
            {'_id': user_id},
            {'$unset': {
                'telegram_id': '',
                'telegram_username': '',
                'telegram_linked_at': '',
                'telegram_active_conversation_id': '',
                'telegram_active_config_id': '',
                'telegram_rate_limit': '',
            },
             '$set': {'updated_at': datetime.utcnow()}}
        )
```

Also extend `create_indexes` (in same file) to add the unique sparse index. Replace the existing `create_indexes` body to also call:

```python
        collection.create_index('telegram_id', unique=True, sparse=True)
```

- [x] **Step 4: Run tests, verify they pass**

Run: `cd backend && ./.venv-uv/Scripts/python.exe -m pytest tests/test_models/test_user_telegram.py -v`
Expected: 3 passed

- [x] **Step 5: Commit**

```bash
git add backend/app/models/user.py backend/tests/test_models/test_user_telegram.py
git commit -m "feat(backend): UserModel Telegram link helpers + unique sparse index"
```

---

### Task A2: TelegramLinkTokenModel (TDD)

**Files:**
- Create: `backend/app/models/telegram_link_token.py`
- Test: `backend/tests/test_models/test_telegram_link_token.py`

- [x] **Step 1: Write the failing tests**

```python
# backend/tests/test_models/test_telegram_link_token.py
import time
from datetime import datetime, timedelta
from bson import ObjectId
from app.models.telegram_link_token import TelegramLinkTokenModel


class TestTelegramLinkToken:
    def test_create_returns_url_safe_token(self, db, test_user):
        token = TelegramLinkTokenModel.create(str(test_user['_id']))
        assert isinstance(token, str)
        assert 30 <= len(token) <= 64
        # URL-safe base64 alphabet only
        assert all(c.isalnum() or c in '-_' for c in token)

    def test_consume_returns_user_id_once(self, db, test_user):
        token = TelegramLinkTokenModel.create(str(test_user['_id']))
        first = TelegramLinkTokenModel.consume(token)
        assert first == str(test_user['_id'])
        # Second consume = None
        assert TelegramLinkTokenModel.consume(token) is None

    def test_consume_unknown_token_returns_none(self, db):
        assert TelegramLinkTokenModel.consume('does-not-exist') is None

    def test_consume_expired_token_returns_none(self, db, test_user):
        token = TelegramLinkTokenModel.create(str(test_user['_id']), ttl_seconds=1)
        # Manually backdate expiry
        from app.extensions import mongo
        mongo.db.telegram_link_tokens.update_one(
            {'token': token},
            {'$set': {'expires_at': datetime.utcnow() - timedelta(seconds=10)}}
        )
        assert TelegramLinkTokenModel.consume(token) is None
```

- [x] **Step 2: Run tests, verify they fail**

Run: `cd backend && ./.venv-uv/Scripts/python.exe -m pytest tests/test_models/test_telegram_link_token.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.models.telegram_link_token'`

- [x] **Step 3: Implement the model**

Create `backend/app/models/telegram_link_token.py`:

```python
import secrets
from datetime import datetime, timedelta
from bson import ObjectId
from app.extensions import mongo


class TelegramLinkTokenModel:
    collection_name = 'telegram_link_tokens'

    @staticmethod
    def get_collection():
        return mongo.db[TelegramLinkTokenModel.collection_name]

    @staticmethod
    def create_indexes():
        col = TelegramLinkTokenModel.get_collection()
        col.create_index('token', unique=True)
        col.create_index('expires_at', expireAfterSeconds=0)  # TTL

    @staticmethod
    def create(user_id, ttl_seconds=600):
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        token = secrets.token_urlsafe(32)
        TelegramLinkTokenModel.get_collection().insert_one({
            'token': token,
            'user_id': user_id,
            'expires_at': datetime.utcnow() + timedelta(seconds=ttl_seconds),
            'created_at': datetime.utcnow(),
        })
        return token

    @staticmethod
    def consume(token):
        """Atomic find+delete; returns user_id (str) or None if missing/expired"""
        doc = TelegramLinkTokenModel.get_collection().find_one_and_delete(
            {'token': token}
        )
        if not doc:
            return None
        if doc['expires_at'] < datetime.utcnow():
            return None
        return str(doc['user_id'])
```

Also call `TelegramLinkTokenModel.create_indexes()` from existing index-bootstrap site. Search for where `UserModel.create_indexes()` is invoked at startup (likely `app/__init__.py` or a `models/__init__.py`); add the call alongside it.

- [x] **Step 4: Run tests, verify they pass**

Run: `cd backend && ./.venv-uv/Scripts/python.exe -m pytest tests/test_models/test_telegram_link_token.py -v`
Expected: 4 passed

- [x] **Step 5: Commit**

```bash
git add backend/app/models/telegram_link_token.py backend/tests/test_models/test_telegram_link_token.py
git commit -m "feat(backend): TelegramLinkTokenModel with TTL + atomic consume"
```

---

### Task A3: Telegram link routes (TDD)

**Files:**
- Create: `backend/app/routes/telegram_link.py`
- Test: `backend/tests/test_telegram_link_routes.py`

- [x] **Step 1: Write the failing tests**

```python
# backend/tests/test_telegram_link_routes.py
import os
from app.models.user import UserModel
from app.models.telegram_link_token import TelegramLinkTokenModel


class TestTelegramLinkRoutes:
    def test_status_unlinked(self, client, test_user, auth_headers):
        r = client.get('/api/users/telegram/status', headers=auth_headers)
        assert r.status_code == 200
        body = r.get_json()
        assert body == {'linked': False, 'telegram_username': None}

    def test_generate_token_returns_link_url(self, client, test_user, auth_headers, monkeypatch):
        monkeypatch.setenv('TELEGRAM_BOT_USERNAME', 'unichat_ai_bot')
        r = client.post('/api/users/telegram/generate-token', headers=auth_headers)
        assert r.status_code == 200
        body = r.get_json()
        assert body['link_url'].startswith('https://t.me/unichat_ai_bot?start=')
        assert len(body['link_url'].split('start=')[1]) >= 30

    def test_status_linked_after_consume(self, client, test_user, auth_headers, db):
        token = TelegramLinkTokenModel.create(str(test_user['_id']))
        UserModel.set_telegram_link(str(test_user['_id']), 9999, 'me')
        r = client.get('/api/users/telegram/status', headers=auth_headers)
        assert r.get_json() == {'linked': True, 'telegram_username': 'me'}

    def test_unlink_clears_telegram_id(self, client, test_user, auth_headers, db):
        UserModel.set_telegram_link(str(test_user['_id']), 9999, 'me')
        r = client.delete('/api/users/telegram/unlink', headers=auth_headers)
        assert r.status_code == 200
        u = UserModel.find_by_id(str(test_user['_id']))
        assert u.get('telegram_id') is None

    def test_routes_require_jwt(self, client):
        assert client.get('/api/users/telegram/status').status_code == 401
        assert client.post('/api/users/telegram/generate-token').status_code == 401
        assert client.delete('/api/users/telegram/unlink').status_code == 401
```

- [x] **Step 2: Run tests, verify they fail**

Run: `cd backend && ./.venv-uv/Scripts/python.exe -m pytest tests/test_telegram_link_routes.py -v`
Expected: FAIL with 404 (route not registered) — that's expected; we wire registration in Task A4.

- [x] **Step 3: Implement the routes**

Create `backend/app/routes/telegram_link.py`:

```python
import os
from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_current_user
from app.utils.decorators import active_user_required
from app.models.user import UserModel
from app.models.telegram_link_token import TelegramLinkTokenModel

telegram_link_bp = Blueprint('telegram_link', __name__)


@telegram_link_bp.route('/status', methods=['GET'])
@jwt_required()
@active_user_required
def status():
    user = get_current_user()
    return jsonify({
        'linked': user.get('telegram_id') is not None,
        'telegram_username': user.get('telegram_username'),
    }), 200


@telegram_link_bp.route('/generate-token', methods=['POST'])
@jwt_required()
@active_user_required
def generate_token():
    user = get_current_user()
    bot_username = os.environ.get('TELEGRAM_BOT_USERNAME', 'unichat_ai_bot')
    token = TelegramLinkTokenModel.create(str(user['_id']))
    return jsonify({
        'link_url': f'https://t.me/{bot_username}?start={token}',
        'expires_in_seconds': 600,
    }), 200


@telegram_link_bp.route('/unlink', methods=['DELETE'])
@jwt_required()
@active_user_required
def unlink():
    user = get_current_user()
    UserModel.clear_telegram_link(str(user['_id']))
    return jsonify({'unlinked': True}), 200
```

- [x] **Step 4: Run unit tests for the routes (will still 404 until A4)**

Skip running until next task. Move on.

- [x] **Step 5: Commit**

```bash
git add backend/app/routes/telegram_link.py backend/tests/test_telegram_link_routes.py
git commit -m "feat(backend): /api/users/telegram link routes (status, generate-token, unlink)"
```

---

### Task A4: Register link blueprint + verify

**Files:**
- Modify: `backend/app/__init__.py`

- [x] **Step 1: Add the import + register call**

In `backend/app/__init__.py`, after `from app.routes.ai_preferences import ai_preferences_bp` add:

```python
    from app.routes.telegram_link import telegram_link_bp
```

After `app.register_blueprint(ai_preferences_bp, url_prefix='/api/users')` add:

```python
    app.register_blueprint(telegram_link_bp, url_prefix='/api/users/telegram')
```

- [x] **Step 2: Run all link tests**

Run: `cd backend && ./.venv-uv/Scripts/python.exe -m pytest tests/test_telegram_link_routes.py tests/test_models/test_telegram_link_token.py tests/test_models/test_user_telegram.py -v`
Expected: 12 passed (3 + 4 + 5)

- [x] **Step 3: Commit**

```bash
git add backend/app/__init__.py
git commit -m "feat(backend): register telegram_link_bp at /api/users/telegram"
```

---

## Phase B — Frontend Settings Panel

### Task B1: telegramService.js

**Files:**
- Create: `frontend/src/services/telegramService.js`

- [x] **Step 1: Create the service** (no test — frontend services in this repo are thin wrappers, untested)

```javascript
// frontend/src/services/telegramService.js
import api from './api'

export const telegramService = {
  async getStatus() {
    const res = await api.get('/users/telegram/status')
    return res.data
  },
  async generateToken() {
    const res = await api.post('/users/telegram/generate-token')
    return res.data
  },
  async unlink() {
    const res = await api.delete('/users/telegram/unlink')
    return res.data
  },
}
```

- [x] **Step 2: Smoke-check via curl after backend is up**

Run (in another terminal with backend running and a logged-in JWT):

```bash
TOKEN=<jwt>
curl -H "Authorization: Bearer $TOKEN" http://localhost:5000/api/users/telegram/status
# Expect: {"linked":false,"telegram_username":null}
```

- [x] **Step 3: Commit**

```bash
git add frontend/src/services/telegramService.js
git commit -m "feat(frontend): telegramService client (status/generate-token/unlink)"
```

---

### Task B2: TelegramLinkPanel component

**Files:**
- Create: `frontend/src/pages/dashboard/components/TelegramLinkPanel.jsx`

- [x] **Step 1: Create the component**

```jsx
// frontend/src/pages/dashboard/components/TelegramLinkPanel.jsx
import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Send, Loader2, Unlink, ExternalLink } from 'lucide-react'
import { Button } from '../../../components/ui/button'
import { Card, CardContent } from '../../../components/ui/card'
import { telegramService } from '../../../services/telegramService'
import toast from 'react-hot-toast'

export default function TelegramLinkPanel() {
  const queryClient = useQueryClient()
  const [polling, setPolling] = useState(false)
  const pollTimer = useRef(null)

  const { data, isLoading } = useQuery({
    queryKey: ['telegram-status'],
    queryFn: telegramService.getStatus,
    refetchInterval: polling ? 3000 : false,
  })

  const generateMutation = useMutation({
    mutationFn: telegramService.generateToken,
    onSuccess: ({ link_url }) => {
      window.open(link_url, '_blank', 'noopener')
      setPolling(true)
      // Auto-stop polling after 60s
      clearTimeout(pollTimer.current)
      pollTimer.current = setTimeout(() => setPolling(false), 60_000)
    },
    onError: () => toast.error('Failed to generate Telegram link'),
  })

  const unlinkMutation = useMutation({
    mutationFn: telegramService.unlink,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['telegram-status'] })
      toast.success('Telegram unlinked')
    },
    onError: () => toast.error('Failed to unlink Telegram'),
  })

  useEffect(() => {
    if (data?.linked && polling) {
      setPolling(false)
      clearTimeout(pollTimer.current)
      toast.success(`Linked as @${data.telegram_username || 'telegram'}`)
    }
  }, [data?.linked, polling, data?.telegram_username])

  if (isLoading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-foreground mb-1">Telegram Bot</h3>
        <p className="text-sm text-foreground-secondary">
          Chat with uni-chat from inside Telegram. Conversations sync to your account in real time.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          {data?.linked ? (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-foreground-secondary">Linked Telegram account</p>
                <p className="font-medium text-foreground">@{data.telegram_username || '(unknown)'}</p>
              </div>
              <Button
                variant="outline"
                onClick={() => unlinkMutation.mutate()}
                disabled={unlinkMutation.isPending}
              >
                {unlinkMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4 mr-2" />}
                Unlink
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-foreground-secondary">
                Click below to open Telegram and finish linking. The link is valid for 10 minutes.
              </p>
              <Button
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending || polling}
              >
                {generateMutation.isPending || polling ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />{polling ? 'Waiting for Telegram…' : 'Generating…'}</>
                ) : (
                  <><Send className="h-4 w-4 mr-2" />Link Telegram</>
                )}
                {!polling && !generateMutation.isPending && <ExternalLink className="h-4 w-4 ml-2" />}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

- [x] **Step 2: Commit**

```bash
git add frontend/src/pages/dashboard/components/TelegramLinkPanel.jsx
git commit -m "feat(frontend): TelegramLinkPanel with status poll + open-bot flow"
```

---

### Task B3: Wire Telegram tab into SettingsPage

**Files:**
- Modify: `frontend/src/pages/dashboard/SettingsPage.jsx`

- [x] **Step 1: Add the import**

At the top of `SettingsPage.jsx`, modify the lucide import to include `Send`:

```jsx
import { User, Lock, Palette, Save, Loader2, DollarSign, Brain, Send } from 'lucide-react'
```

After existing imports add:

```jsx
import TelegramLinkPanel from './components/TelegramLinkPanel'
```

- [x] **Step 2: Add the tab trigger**

Inside `<TabsList>`, after the `ai-preferences` `<TabsTrigger>` block, add:

```jsx
<TabsTrigger value="telegram" className="gap-2 data-[state=active]:bg-accent data-[state=active]:text-white">
  <Send className="h-4 w-4" />
  <span className="hidden sm:inline">Telegram</span>
</TabsTrigger>
```

- [x] **Step 3: Add the tab content**

Inside the `<Card><CardContent>` block, after the `ai-preferences` `<TabsContent>`, add:

```jsx
<TabsContent value="telegram" className="mt-0">
  <TelegramLinkPanel />
</TabsContent>
```

- [x] **Step 4: Smoke check**

Run `cd frontend && npm run dev`. Open `http://localhost:3000/settings` (or wherever Settings is mounted). Confirm "Telegram" tab appears, opens, shows "Link Telegram" button.

- [x] **Step 5: Commit**

```bash
git add frontend/src/pages/dashboard/SettingsPage.jsx
git commit -m "feat(frontend): Telegram tab in Settings page"
```

---

## Phase C — Bot Service Scaffolding

### Task C1: Make `app` package installable

**Files:**
- Create: `backend/pyproject.toml`

- [x] **Step 1: Create minimal pyproject**

```toml
# backend/pyproject.toml
[project]
name = "unichat-backend"
version = "0.1.0"
description = "uni-chat Flask backend (importable as `app`)"
requires-python = ">=3.12"

[tool.setuptools]
packages = ["app"]

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"
```

- [x] **Step 2: Verify editable install works**

```bash
cd E:/Projects/uni-chat/backend
./.venv-uv/Scripts/python.exe -c "from app import create_app; print(create_app())"
```

Expected: prints `<Flask 'app'>` (no import errors). If `app` was already importable from cwd, this just confirms.

- [x] **Step 3: Commit**

```bash
git add backend/pyproject.toml
git commit -m "build(backend): add pyproject.toml so the bot venv can `pip install -e ../backend`"
```

---

### Task C2: Bot project skeleton

**Files:**
- Create: `bot/pyproject.toml`, `bot/.env.example`, `bot/README.md`, `bot/bot/__init__.py`

- [x] **Step 1: Create `bot/pyproject.toml`**

```toml
[project]
name = "unichat-bot"
version = "0.1.0"
description = "uni-chat Telegram gateway"
requires-python = ">=3.12"
dependencies = [
  "aiogram>=3.7,<4",
  "aiohttp>=3.9",
  "pymongo>=4.6",
  "pydantic-settings>=2.2",
  "markdown-it-py>=3.0",
  "python-dotenv>=1.0",
  "unichat-backend",
]

[tool.setuptools]
packages = ["bot"]

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"
```

- [x] **Step 2: Create `bot/.env.example`**

```
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_BOT_USERNAME=unichat_ai_bot
WEBHOOK_URL=https://api.sepijan.xyz/telegram/webhook/
MONGO_URI=mongodb://localhost:27017/unichat
OPENROUTER_API_KEY=
BOT_PORT=8081
POLLING=1
```

- [x] **Step 3: Create `bot/bot/__init__.py`** (empty file)

```python
# bot/bot/__init__.py
```

- [x] **Step 4: Create `bot/README.md`**

```markdown
# uni-chat Telegram Bot

## Local dev (polling)

```
cd bot
uv venv .venv-uv --python 3.12
. .venv-uv/Scripts/activate
uv pip install -e . -e ../backend
cp .env.example .env  # fill in TELEGRAM_BOT_TOKEN + MONGO_URI + OPENROUTER_API_KEY
POLLING=1 python -m bot.main
```

## Prod (webhook)

systemd unit at `deploy/unichat-bot.service`. nginx snippet at `deploy/nginx-telegram.conf`.

Set webhook on first boot — happens automatically in `bot/main.py:on_startup`.
```

- [x] **Step 5: Create the venv**

```bash
cd E:/Projects/uni-chat/bot
uv venv .venv-uv --python 3.12
./.venv-uv/Scripts/python.exe -m pip install -e . -e ../backend
```

Expected: install succeeds; aiogram, aiohttp, pymongo etc. land in the venv.

- [x] **Step 6: Commit**

```bash
git add bot/pyproject.toml bot/.env.example bot/bot/__init__.py bot/README.md
git commit -m "build(bot): scaffold uv-managed Telegram bot package"
```

---

### Task C3: Bot settings + flask context

**Files:**
- Create: `bot/bot/settings.py`, `bot/bot/flask_ctx.py`

- [x] **Step 1: Create `bot/bot/settings.py`**

```python
# bot/bot/settings.py
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')

    telegram_bot_token: str
    telegram_webhook_secret: str = ''
    telegram_bot_username: str = 'unichat_ai_bot'
    webhook_url: str = ''
    mongo_uri: str
    openrouter_api_key: str
    bot_port: int = 8081
    polling: bool = False


settings = Settings()
```

- [x] **Step 2: Create `bot/bot/flask_ctx.py`**

```python
# bot/bot/flask_ctx.py
"""
Imports the Flask app once at module load, so handlers can do:

    from bot.flask_ctx import flask_app
    with flask_app.app_context():
        UserModel.find_by_id(...)
"""
import os
from app import create_app

# Force-set env so create_app's prod guards don't trip in dev
os.environ.setdefault('FLASK_ENV', 'development')

flask_app = create_app()
```

- [x] **Step 3: Smoke-check**

```bash
cd E:/Projects/uni-chat/bot
./.venv-uv/Scripts/python.exe -c "from bot.flask_ctx import flask_app; print(flask_app)"
```

Expected: prints `<Flask 'app'>` with no errors.

- [x] **Step 4: Commit**

```bash
git add bot/bot/settings.py bot/bot/flask_ctx.py
git commit -m "feat(bot): pydantic settings + flask app context bootstrap"
```

---

### Task C4: Minimal bot main with `/help` only

**Files:**
- Create: `bot/bot/main.py`

- [x] **Step 1: Create `bot/bot/main.py`** (minimal — handlers added in later tasks; only `/help` for now)

```python
# bot/bot/main.py
import asyncio
import logging
from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.filters import Command
from aiogram.types import Message
from aiohttp import web
from aiogram.webhook.aiohttp_server import SimpleRequestHandler, setup_application

from bot.settings import settings

logging.basicConfig(level=logging.INFO)
log = logging.getLogger('unichat-bot')

bot = Bot(
    token=settings.telegram_bot_token,
    default=DefaultBotProperties(parse_mode=ParseMode.HTML),
)
dp = Dispatcher()


@dp.message(Command('help'))
async def cmd_help(msg: Message):
    await msg.answer(
        '<b>uni-chat bot</b>\n\n'
        'Link your account at <a href="https://unichat.sepijan.xyz/settings">Settings → Telegram</a>, '
        'then chat away.\n\n'
        '/new — fresh conversation\n'
        '/model — pick a model\n'
        '/assistant — pick a saved assistant\n'
        '/history — recent conversations\n'
        '/unlink — disconnect this account\n'
    )


async def on_startup(app: web.Application):
    if settings.webhook_url:
        url = settings.webhook_url.rstrip('/') + '/' + settings.telegram_webhook_secret
        await bot.set_webhook(url, secret_token=settings.telegram_webhook_secret, allowed_updates=['message', 'callback_query'])
        log.info('Webhook set to %s', url)


async def on_shutdown(app: web.Application):
    await bot.session.close()


def run_polling():
    log.info('Starting in polling mode')
    asyncio.run(dp.start_polling(bot))


def run_webhook():
    log.info('Starting webhook server on :%d', settings.bot_port)
    app = web.Application()
    handler = SimpleRequestHandler(dispatcher=dp, bot=bot, secret_token=settings.telegram_webhook_secret)
    handler.register(app, path=f'/{settings.telegram_webhook_secret}')
    setup_application(app, dp, bot=bot)
    app.on_startup.append(on_startup)
    app.on_shutdown.append(on_shutdown)
    web.run_app(app, host='127.0.0.1', port=settings.bot_port)


def main():
    if settings.polling:
        run_polling()
    else:
        run_webhook()


if __name__ == '__main__':
    main()
```

- [ ] **Step 2: Run locally in polling mode**

```bash
cd E:/Projects/uni-chat/bot
# Ensure .env has TELEGRAM_BOT_TOKEN from a real bot (BotFather)
POLLING=1 ./.venv-uv/Scripts/python.exe -m bot.main
```

Send `/help` to your bot in Telegram. Expected: HTML-formatted help reply.

- [ ] **Step 3: Commit**

```bash
git add bot/bot/main.py
git commit -m "feat(bot): aiogram entry point with polling/webhook switch + /help"
```

---

## Phase D — Bot Services (TDD)

### Task D1: format.py — Markdown to Telegram-HTML allowlist

**Files:**
- Create: `bot/bot/services/__init__.py`, `bot/bot/services/format.py`
- Test: `bot/tests/__init__.py`, `bot/tests/test_format.py`

- [x] **Step 1: Write the failing tests**

```python
# bot/tests/test_format.py
from bot.services.format import md_to_tg_html


def test_bold_and_italic():
    assert md_to_tg_html('**bold** and *italic*') == '<b>bold</b> and <i>italic</i>'

def test_inline_code():
    assert md_to_tg_html('use `foo()`') == 'use <code>foo()</code>'

def test_fenced_code_block_with_lang():
    src = '```python\nprint(1)\n```'
    out = md_to_tg_html(src)
    assert '<pre><code class="language-python">' in out
    assert 'print(1)' in out

def test_link():
    assert md_to_tg_html('[x](https://e.com)') == '<a href="https://e.com">x</a>'

def test_disallowed_tag_stripped():
    # h1 is not in Telegram allowlist — must be flattened to plain text
    out = md_to_tg_html('# Heading')
    assert '<h1>' not in out
    assert 'Heading' in out

def test_html_escapes_unsafe_chars():
    assert md_to_tg_html('a < b') == 'a &lt; b'
```

Add empty `bot/tests/__init__.py` and `bot/bot/services/__init__.py` (single-line files: `# package marker`).

- [x] **Step 2: Run tests, verify they fail**

```bash
cd E:/Projects/uni-chat/bot
./.venv-uv/Scripts/python.exe -m pytest tests/test_format.py -v
```
Expected: FAIL with `ModuleNotFoundError: No module named 'bot.services.format'`

- [x] **Step 3: Implement**

```python
# bot/bot/services/format.py
"""Markdown -> Telegram-HTML allowlist converter.

Telegram supports a small HTML subset: <b> <i> <u> <s> <code> <pre> <a> <blockquote>.
We render markdown via markdown-it-py, then walk the HTML and keep only allowed tags.
Anything else is replaced by its text content. < and > in raw text are escaped.
"""
import re
from html import escape
from markdown_it import MarkdownIt

_md = MarkdownIt('commonmark', {'html': False, 'breaks': True, 'linkify': False})

_ALLOWED = {'b', 'strong', 'i', 'em', 'u', 's', 'code', 'pre', 'a', 'blockquote'}
_REPLACE = {'strong': 'b', 'em': 'i'}


def md_to_tg_html(md: str) -> str:
    raw = _md.render(md)
    return _sanitize(raw).strip()


_TAG_RE = re.compile(r'<(/?)([a-zA-Z][a-zA-Z0-9]*)(\s[^>]*)?>')


def _sanitize(html: str) -> str:
    out = []
    pos = 0
    for m in _TAG_RE.finditer(html):
        # Append intervening text (already escaped by markdown-it for < > inside text)
        out.append(html[pos:m.start()])
        closing, tag, attrs = m.group(1), m.group(2).lower(), (m.group(3) or '')
        if tag in _ALLOWED:
            tag_out = _REPLACE.get(tag, tag)
            # For <a>, keep only href= attr
            if tag == 'a' and not closing:
                href_match = re.search(r'href="([^"]*)"', attrs)
                href = href_match.group(1) if href_match else ''
                out.append(f'<a href="{escape(href, quote=True)}">')
            elif tag == 'pre' and not closing:
                # next char should be <code class="language-x"> — pass through and
                # let the inner code tag handle the language attr
                out.append('<pre>')
            elif tag == 'code' and not closing and 'class="language-' in attrs:
                cls = re.search(r'class="(language-[^"]*)"', attrs).group(1)
                out.append(f'<code class="{escape(cls, quote=True)}">')
            else:
                out.append(f'<{"/" if closing else ""}{tag_out}>')
        # else: drop the tag entirely (text content stays)
        pos = m.end()
    out.append(html[pos:])
    # Replace <p> wrappers (markdown-it wraps everything) — we drop them, leaving raw newlines
    return ''.join(out).replace('<p>', '').replace('</p>', '\n').replace('<br>', '\n').replace('<br />', '\n')
```

- [x] **Step 4: Run tests, verify they pass**

```bash
./.venv-uv/Scripts/python.exe -m pytest tests/test_format.py -v
```
Expected: 6 passed.

- [x] **Step 5: Commit**

```bash
git add bot/bot/services/__init__.py bot/bot/services/format.py bot/tests/__init__.py bot/tests/test_format.py
git commit -m "feat(bot): markdown to Telegram HTML allowlist"
```

---

### Task D2: ratelimit.py — sliding window per user

**Files:**
- Create: `bot/bot/services/ratelimit.py`
- Test: `bot/tests/test_ratelimit.py`

- [x] **Step 1: Write the failing tests**

```python
# bot/tests/test_ratelimit.py
from datetime import datetime, timedelta
from bot.services.ratelimit import allow_request, RATE_PER_MINUTE


def make_user(window_start=None, count=0):
    return {'_id': 'u1', 'telegram_rate_limit': {'window_start': window_start, 'count': count}}


def test_first_request_allowed():
    user = {'_id': 'u1'}  # no telegram_rate_limit field
    ok, new_state = allow_request(user, now=datetime.utcnow())
    assert ok is True
    assert new_state['count'] == 1


def test_within_window_increments():
    now = datetime.utcnow()
    user = make_user(window_start=now, count=5)
    ok, new_state = allow_request(user, now=now)
    assert ok is True
    assert new_state['count'] == 6


def test_window_resets_after_60s():
    now = datetime.utcnow()
    user = make_user(window_start=now - timedelta(seconds=61), count=RATE_PER_MINUTE)
    ok, new_state = allow_request(user, now=now)
    assert ok is True
    assert new_state['count'] == 1


def test_exceeded_blocked():
    now = datetime.utcnow()
    user = make_user(window_start=now, count=RATE_PER_MINUTE)
    ok, _ = allow_request(user, now=now)
    assert ok is False
```

- [x] **Step 2: Run tests, verify they fail**

```bash
./.venv-uv/Scripts/python.exe -m pytest tests/test_ratelimit.py -v
```
Expected: FAIL with `ModuleNotFoundError`.

- [x] **Step 3: Implement**

```python
# bot/bot/services/ratelimit.py
"""Sliding-window rate limiter that lives inside users.telegram_rate_limit."""
from datetime import datetime, timedelta

RATE_PER_MINUTE = 20
WINDOW_SECONDS = 60


def allow_request(user: dict, now: datetime | None = None) -> tuple[bool, dict]:
    """
    Returns (allowed, new_state). Caller is responsible for persisting new_state to MongoDB.
    """
    now = now or datetime.utcnow()
    state = user.get('telegram_rate_limit') or {}
    window_start = state.get('window_start')
    count = state.get('count', 0)

    if not window_start or now - window_start > timedelta(seconds=WINDOW_SECONDS):
        return True, {'window_start': now, 'count': 1}

    if count >= RATE_PER_MINUTE:
        return False, state

    return True, {'window_start': window_start, 'count': count + 1}
```

- [x] **Step 4: Run tests, verify they pass**

```bash
./.venv-uv/Scripts/python.exe -m pytest tests/test_ratelimit.py -v
```
Expected: 4 passed.

- [x] **Step 5: Commit**

```bash
git add bot/bot/services/ratelimit.py bot/tests/test_ratelimit.py
git commit -m "feat(bot): per-user sliding-window rate limiter"
```

---

### Task D3: stream.py — adaptive Telegram edit batching

**Files:**
- Create: `bot/bot/services/stream.py`
- Test: `bot/tests/test_stream.py`

- [x] **Step 1: Write the failing tests**

```python
# bot/tests/test_stream.py
import asyncio
import time
from unittest.mock import AsyncMock, MagicMock
import pytest
from bot.services.stream import stream_to_tg, BUF_CHARS


class FakeClock:
    def __init__(self): self.t = 0.0
    def __call__(self): return self.t
    def advance(self, dt): self.t += dt


@pytest.mark.asyncio
async def test_batches_small_chunks_into_one_edit(monkeypatch):
    clock = FakeClock()
    monkeypatch.setattr('bot.services.stream.monotonic', clock)
    bot = MagicMock()
    bot.edit_message_text = AsyncMock()

    async def gen():
        for c in 'abcdef':  # 6 chars total < BUF_CHARS
            yield c

    out = await stream_to_tg(bot, chat_id=1, message_id=10, gen=gen(), clock=clock)
    assert out == 'abcdef'
    # Only the final flush edit
    assert bot.edit_message_text.call_count == 1


@pytest.mark.asyncio
async def test_emits_edit_on_buffer_threshold(monkeypatch):
    clock = FakeClock()
    monkeypatch.setattr('bot.services.stream.monotonic', clock)
    bot = MagicMock()
    bot.edit_message_text = AsyncMock()

    async def gen():
        yield 'x' * (BUF_CHARS + 5)
        yield 'y' * (BUF_CHARS + 5)

    out = await stream_to_tg(bot, chat_id=1, message_id=10, gen=gen(), clock=clock)
    # At least 2 edits + final
    assert bot.edit_message_text.call_count >= 2
    assert out == 'x' * (BUF_CHARS + 5) + 'y' * (BUF_CHARS + 5)
```

Add `pytest-asyncio` to `bot/pyproject.toml` `[project.optional-dependencies]`:

```toml
[project.optional-dependencies]
dev = ["pytest>=8", "pytest-asyncio>=0.23"]
```

Then `uv pip install -e ".[dev]"` in the bot venv.

Add to `bot/pyproject.toml`:

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
```

- [x] **Step 2: Run tests, verify they fail**

```bash
./.venv-uv/Scripts/python.exe -m pytest tests/test_stream.py -v
```
Expected: FAIL with import error.

- [x] **Step 3: Implement**

```python
# bot/bot/services/stream.py
"""Adaptive Telegram-message edit batching for streamed LLM tokens."""
from time import monotonic
from typing import AsyncIterator, Callable

from bot.services.format import md_to_tg_html

BUF_CHARS = 80
BUF_INTERVAL_S = 1.2
TG_MAX = 4000  # leave headroom under 4096


async def stream_to_tg(bot, chat_id: int, message_id: int, gen: AsyncIterator[str],
                       *, clock: Callable[[], float] = monotonic) -> str:
    """
    Edit `message_id` in `chat_id` as `gen` yields tokens.
    Returns the full assembled text.

    Buffering: edit when (len(buf) - len(sent)) >= BUF_CHARS OR (clock() - last_edit) >= BUF_INTERVAL_S.
    Splits into multiple messages past TG_MAX chars.
    """
    buf = ''
    last_sent_len = 0
    last_edit = clock()
    current_msg_id = message_id

    async for token in gen:
        buf += token

        # Roll over to a new message past TG_MAX
        if len(buf) > TG_MAX:
            head, buf = buf[:TG_MAX], buf[TG_MAX:]
            await _safe_edit(bot, chat_id, current_msg_id, head)
            sent = await bot.send_message(chat_id, '…')
            current_msg_id = sent.message_id
            last_sent_len = 0
            last_edit = clock()
            continue

        if (len(buf) - last_sent_len >= BUF_CHARS) or (clock() - last_edit >= BUF_INTERVAL_S):
            await _safe_edit(bot, chat_id, current_msg_id, buf)
            last_sent_len = len(buf)
            last_edit = clock()

    # Final flush
    if buf:
        await _safe_edit(bot, chat_id, current_msg_id, buf)
    return buf


async def _safe_edit(bot, chat_id: int, message_id: int, text: str):
    html = md_to_tg_html(text) or '…'
    try:
        await bot.edit_message_text(text=html, chat_id=chat_id, message_id=message_id)
    except Exception:
        # Telegram returns "message is not modified" sometimes — ignore
        pass
```

- [x] **Step 4: Run tests, verify they pass**

```bash
./.venv-uv/Scripts/python.exe -m pytest tests/test_stream.py -v
```
Expected: 2 passed.

- [x] **Step 5: Commit**

```bash
git add bot/bot/services/stream.py bot/tests/test_stream.py bot/pyproject.toml
git commit -m "feat(bot): adaptive edit-in-place streaming with TG_MAX rollover"
```

---

### Task D4: auth.py — resolve Telegram → uni-chat user

**Files:**
- Create: `bot/bot/services/auth.py`

- [x] **Step 1: Implement** (no separate test file — covered by integration test in Task E1)

```python
# bot/bot/services/auth.py
"""Resolve a Telegram user_id to a uni-chat user dict, with a tiny LRU cache."""
import time
from threading import Lock
from typing import Optional
from app.models.user import UserModel
from bot.flask_ctx import flask_app

_CACHE: dict[int, tuple[float, dict]] = {}
_CACHE_TTL = 60.0  # seconds
_LOCK = Lock()


def resolve_user(telegram_id: int) -> Optional[dict]:
    """Return the uni-chat user dict for this Telegram id, or None if unlinked."""
    now = time.time()
    with _LOCK:
        cached = _CACHE.get(telegram_id)
        if cached and now - cached[0] < _CACHE_TTL:
            return cached[1]

    with flask_app.app_context():
        user = UserModel.find_by_telegram_id(telegram_id)

    with _LOCK:
        _CACHE[telegram_id] = (now, user) if user else (now, None)
    return user


def invalidate(telegram_id: int) -> None:
    with _LOCK:
        _CACHE.pop(telegram_id, None)
```

- [x] **Step 2: Smoke check via REPL**

```bash
cd E:/Projects/uni-chat/bot
./.venv-uv/Scripts/python.exe -c "from bot.services.auth import resolve_user; print(resolve_user(0))"
```

Expected: prints `None` (no errors).

- [x] **Step 3: Commit**

```bash
git add bot/bot/services/auth.py
git commit -m "feat(bot): telegram_id -> user resolver with 60s LRU cache"
```

---

## Phase E — Bot Handlers

### Task E1: handlers/start.py — `/start` + deep-link link

**Files:**
- Create: `bot/bot/handlers/__init__.py` (empty), `bot/bot/handlers/start.py`
- Modify: `bot/bot/main.py` (register the router)

- [ ] **Step 1: Implement**

```python
# bot/bot/handlers/start.py
from aiogram import Router
from aiogram.filters import CommandStart, CommandObject
from aiogram.types import Message
from app.models.telegram_link_token import TelegramLinkTokenModel
from app.models.user import UserModel
from bot.flask_ctx import flask_app
from bot.services.auth import invalidate as invalidate_cache

router = Router()


@router.message(CommandStart(deep_link=True))
async def start_with_token(msg: Message, command: CommandObject):
    token = (command.args or '').strip()
    if not token:
        return await start_plain(msg)

    with flask_app.app_context():
        user_id = TelegramLinkTokenModel.consume(token)
        if not user_id:
            return await msg.answer('Link expired or invalid. Generate a new one in uni-chat → Settings → Telegram.')
        UserModel.set_telegram_link(user_id, msg.from_user.id, msg.from_user.username)

    invalidate_cache(msg.from_user.id)
    name = msg.from_user.username or msg.from_user.first_name or 'there'
    await msg.answer(f'Linked, @{name}. Send a message to start chatting, or /help for commands.')


@router.message(CommandStart())
async def start_plain(msg: Message):
    await msg.answer(
        '<b>uni-chat bot</b>\n\n'
        'Open uni-chat → Settings → Telegram and click "Link Telegram" to connect this account.'
    )
```

- [ ] **Step 2: Wire into main.py**

In `bot/bot/main.py`, after `dp = Dispatcher()` add:

```python
from bot.handlers import start as start_handlers
dp.include_router(start_handlers.router)
```

And remove the inline `cmd_help` (it'll be replaced by the commands router in Task E2 — for now keep it).

- [ ] **Step 3: Manual integration check**

Boot bot in polling mode. Send `/start` to it from Telegram → expect "Open uni-chat..." reply. Manually generate a link token via the web app's Settings panel (now possible since Phase B is done), tap the resulting `t.me/?start=<token>` URL, then run `/help` — bot should respond as a linked user from your profile (verify in Mongo: `db.users.findOne({telegram_id: <your_id>})`).

- [ ] **Step 4: Commit**

```bash
git add bot/bot/handlers/__init__.py bot/bot/handlers/start.py bot/bot/main.py
git commit -m "feat(bot): /start deep-link consumes link token"
```

---

### Task E2: handlers/commands.py — `/help` `/new` `/history` `/unlink`

**Files:**
- Create: `bot/bot/handlers/commands.py`
- Modify: `bot/bot/main.py` (register router, remove old inline /help)

- [ ] **Step 1: Implement commands.py**

```python
# bot/bot/handlers/commands.py
from datetime import datetime
from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message
from app.extensions import mongo
from app.models.user import UserModel
from app.models.conversation import ConversationModel
from bot.flask_ctx import flask_app
from bot.services.auth import resolve_user, invalidate

router = Router()

HELP_TEXT = (
    '<b>uni-chat bot</b>\n\n'
    '/new — fresh conversation\n'
    '/model — pick a model\n'
    '/assistant — pick a saved assistant\n'
    '/history — recent conversations\n'
    '/unlink — disconnect this account\n'
    '/help — this message\n'
)


def _require_linked(msg: Message):
    user = resolve_user(msg.from_user.id)
    if not user:
        return None
    return user


@router.message(Command('help'))
async def cmd_help(msg: Message):
    await msg.answer(HELP_TEXT)


@router.message(Command('new'))
async def cmd_new(msg: Message):
    user = _require_linked(msg)
    if not user:
        return await msg.answer('Not linked. Open uni-chat → Settings → Telegram.')
    with flask_app.app_context():
        UserModel.update(str(user['_id']), {'telegram_active_conversation_id': None})
    invalidate(msg.from_user.id)
    await msg.answer('New conversation. Send a message to begin.')


@router.message(Command('history'))
async def cmd_history(msg: Message):
    user = _require_linked(msg)
    if not user:
        return await msg.answer('Not linked.')
    with flask_app.app_context():
        convos = ConversationModel.find_by_user(str(user['_id']), limit=10)
    if not convos:
        return await msg.answer('No conversations yet.')
    lines = ['<b>Recent conversations</b>']
    for c in convos:
        title = c.get('title') or 'Untitled'
        lines.append(f'• {title} ({c["message_count"]} msgs)')
    await msg.answer('\n'.join(lines))


@router.message(Command('unlink'))
async def cmd_unlink(msg: Message):
    user = _require_linked(msg)
    if not user:
        return await msg.answer('Already unlinked.')
    with flask_app.app_context():
        UserModel.clear_telegram_link(str(user['_id']))
    invalidate(msg.from_user.id)
    await msg.answer('Unlinked. /start to relink anytime.')
```

- [ ] **Step 2: Wire into main.py**

In `bot/bot/main.py`:
1. Delete the inline `@dp.message(Command('help'))` block from Task C4.
2. Add at module level after `start_handlers` import:

```python
from bot.handlers import commands as commands_handlers
dp.include_router(commands_handlers.router)
```

- [ ] **Step 3: Manual smoke**

Restart bot. Send `/help` → expect command list. `/new` while linked → expect "New conversation." `/history` → expect list (will be empty until chat handler exists). `/unlink` → confirms.

- [ ] **Step 4: Commit**

```bash
git add bot/bot/handlers/commands.py bot/bot/main.py
git commit -m "feat(bot): /help /new /history /unlink commands"
```

---

### Task E3: keyboards.py + `/model` + `/assistant` callback handlers

**Files:**
- Create: `bot/bot/keyboards.py`
- Modify: `bot/bot/handlers/commands.py` (add /model, /assistant, callback handler)

- [ ] **Step 1: Create keyboards.py**

```python
# bot/bot/keyboards.py
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup
from aiogram.utils.keyboard import InlineKeyboardBuilder

QUICK_MODELS = [
    ('Gemini 3 Flash',     'quick:google/gemini-3-flash-preview'),
    ('Grok 4.1 Fast',      'quick:x-ai/grok-4.1-fast'),
    ('Gemini 2.5 Lite',    'quick:google/gemini-2.5-flash-lite'),
    ('GPT-5.2',            'quick:openai/gpt-5.2'),
    ('Claude Sonnet 4.5',  'quick:anthropic/claude-sonnet-4.5'),
]


def model_picker(assistants: list[dict]) -> InlineKeyboardMarkup:
    b = InlineKeyboardBuilder()
    for label, cfg_id in QUICK_MODELS:
        b.button(text=label, callback_data=f'cfg:{cfg_id}')
    for a in assistants[:10]:  # top 10 assistants
        b.button(text=f'⭐ {a["name"]}', callback_data=f'cfg:{a["_id"]}')
    b.adjust(1)
    return b.as_markup()
```

- [ ] **Step 2: Append to commands.py**

```python
# bot/bot/handlers/commands.py — append after /unlink

from aiogram.types import CallbackQuery
from app.models.llm_config import LLMConfigModel  # adjust import to your project
from bot.keyboards import model_picker


@router.message(Command('model'))
async def cmd_model(msg: Message):
    user = _require_linked(msg)
    if not user:
        return await msg.answer('Not linked.')
    with flask_app.app_context():
        assistants = LLMConfigModel.find_by_owner(str(user['_id']), limit=10) or []
    await msg.answer('Pick a model:', reply_markup=model_picker(assistants))


@router.message(Command('assistant'))
async def cmd_assistant(msg: Message):
    user = _require_linked(msg)
    if not user:
        return await msg.answer('Not linked.')
    with flask_app.app_context():
        assistants = LLMConfigModel.find_by_owner(str(user['_id']), limit=10) or []
    if not assistants:
        return await msg.answer('No saved assistants. Create one in uni-chat web app.')
    await msg.answer('Pick an assistant:', reply_markup=model_picker(assistants[:10]))


@router.callback_query(lambda c: c.data and c.data.startswith('cfg:'))
async def on_pick_config(cb: CallbackQuery):
    user = resolve_user(cb.from_user.id)
    if not user:
        return await cb.answer('Not linked.', show_alert=True)
    cfg_id = cb.data[len('cfg:'):]
    with flask_app.app_context():
        UserModel.update(str(user['_id']), {'telegram_active_config_id': cfg_id})
    invalidate(cb.from_user.id)
    await cb.answer('Set.')
    await cb.message.edit_text(f'Active model: <code>{cfg_id}</code>')
```

> NOTE: `LLMConfigModel.find_by_owner` was confirmed during plan-writing (returns user-owned + public configs depending on params). If the result list shape doesn't have `_id` and `name` strings, adapt the keyboard builder accordingly.

- [ ] **Step 3: Manual smoke**

Restart bot. `/model` → keyboard. Tap one. Bot edits message to "Active model: quick:...". `/assistant` → either keyboard or "No saved assistants."

- [ ] **Step 4: Commit**

```bash
git add bot/bot/keyboards.py bot/bot/handlers/commands.py
git commit -m "feat(bot): /model and /assistant inline keyboards + cfg callback"
```

---

### Task E4: services/chat.py + handlers/chat.py — text → LLM → stream

**Files:**
- Create: `bot/bot/services/chat.py`, `bot/bot/handlers/chat.py`
- Modify: `bot/bot/main.py` (register chat router)

- [ ] **Step 1: Implement services/chat.py**

```python
# bot/bot/services/chat.py
"""Glue: take a Telegram text message, persist user msg, stream OpenRouter, persist assistant."""
import asyncio
import time
from datetime import datetime

from app.extensions import mongo
from app.models.conversation import ConversationModel
from app.models.message import MessageModel
from app.models.user import UserModel
from app.services.openrouter_service import OpenRouterService
from app.utils.config_resolver import resolve_config
from bot.flask_ctx import flask_app

DEFAULT_QUICK = 'quick:google/gemini-3-flash-preview'


def _ensure_active_conversation(user: dict, config_id: str) -> dict:
    """Get or create the user's active Telegram conversation."""
    cid = user.get('telegram_active_conversation_id')
    with flask_app.app_context():
        if cid:
            convo = ConversationModel.find_by_id(cid)
            if convo:
                return convo
        convo = ConversationModel.create(str(user['_id']), config_id, title='Telegram chat')
        UserModel.update(str(user['_id']), {'telegram_active_conversation_id': str(convo['_id'])})
    return convo


def prepare_request(user: dict, text: str) -> tuple[dict, dict, list[dict], str]:
    """Returns (convo, config, messages, system_prompt). All MongoDB ops use Flask context."""
    cfg_id = user.get('telegram_active_config_id') or DEFAULT_QUICK
    with flask_app.app_context():
        config = resolve_config(cfg_id)
        if not config:
            raise ValueError(f'Unknown config_id: {cfg_id}')
        convo = _ensure_active_conversation(user, cfg_id)
        # Persist user message
        MessageModel.create_user_message(str(convo['_id']), text)
        # Build context
        history = MessageModel.get_context_messages(str(convo['_id']), limit=20)
        formatted = OpenRouterService.format_messages_for_api(history)
        system = OpenRouterService.build_enhanced_system_prompt(
            config.get('system_prompt') or '',
            UserModel.get_ai_preferences(str(user['_id'])),
        )
    return convo, config, formatted, system


def call_openrouter_stream(messages, model, system_prompt, params: dict):
    """Yields token strings (sync generator from OpenRouterService)."""
    with flask_app.app_context():
        gen = OpenRouterService.chat_completion(
            messages=messages,
            model=model,
            system_prompt=system_prompt,
            stream=True,
            temperature=params.get('temperature', 0.7),
            max_tokens=params.get('max_tokens', 2048),
        )
        for chunk in gen:
            # OpenRouter SSE chunks → extract text delta
            if isinstance(chunk, dict):
                choices = chunk.get('choices') or []
                if choices and 'delta' in choices[0]:
                    yield choices[0]['delta'].get('content') or ''


def persist_assistant(convo_id: str, content: str, model_id: str, prompt_tokens: int, completion_tokens: int, gen_ms: int):
    with flask_app.app_context():
        MessageModel.create_assistant_message(
            convo_id, content,
            model_id=model_id,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            generation_time_ms=gen_ms,
        )
        ConversationModel.increment_message_count(convo_id, prompt_tokens, completion_tokens)
```

- [ ] **Step 2: Implement handlers/chat.py**

```python
# bot/bot/handlers/chat.py
import asyncio
import time
from aiogram import Router, F
from aiogram.types import Message

from app.models.user import UserModel
from bot.flask_ctx import flask_app
from bot.services.auth import resolve_user, invalidate
from bot.services.ratelimit import allow_request
from bot.services.chat import prepare_request, call_openrouter_stream, persist_assistant
from bot.services.stream import stream_to_tg

router = Router()


@router.message(F.text & ~F.text.startswith('/'))
async def on_text(msg: Message):
    user = resolve_user(msg.from_user.id)
    if not user:
        return await msg.answer('Not linked. Open uni-chat → Settings → Telegram.')

    ok, new_state = allow_request(user)
    if not ok:
        return await msg.answer('Slow down — 20 messages per minute limit. Try again shortly.')

    with flask_app.app_context():
        UserModel.update(str(user['_id']), {'telegram_rate_limit': new_state})
    invalidate(msg.from_user.id)

    placeholder = await msg.answer('…')
    started = time.monotonic()

    try:
        convo, config, history, system = prepare_request(user, msg.text)
    except ValueError as e:
        return await placeholder.edit_text(f'Error: {e}')

    # Wrap sync generator into async iterator
    sync_gen = call_openrouter_stream(history, config['model_id'], system, config.get('parameters') or {})

    async def aiter():
        loop = asyncio.get_event_loop()
        while True:
            tok = await loop.run_in_executor(None, lambda: next(sync_gen, None))
            if tok is None:
                break
            if tok:
                yield tok

    full = await stream_to_tg(msg.bot, msg.chat.id, placeholder.message_id, aiter())
    elapsed_ms = int((time.monotonic() - started) * 1000)
    persist_assistant(str(convo['_id']), full, config['model_id'], 0, 0, elapsed_ms)
```

- [ ] **Step 3: Wire router**

In `bot/bot/main.py`, after the commands router include add:

```python
from bot.handlers import chat as chat_handlers
dp.include_router(chat_handlers.router)
```

- [ ] **Step 4: End-to-end smoke**

Restart bot in polling mode. From Telegram (linked account):
1. Send "Hello, who are you?"
2. Expect placeholder "…" within 1s
3. Stream of edits arrives, final reply ≤5s for `gemini-3-flash`
4. Open web app → conversation appears in chat list with title "Telegram chat"
5. Send 21 messages within 60s → 21st replies "Slow down".
6. `/new`, then send another message → new conversation appears in web app.

- [ ] **Step 5: Commit**

```bash
git add bot/bot/services/chat.py bot/bot/handlers/chat.py bot/bot/main.py
git commit -m "feat(bot): text chat -> OpenRouter stream -> persisted messages"
```

---

## Phase F — Deployment

### Task F1: Deployment artifacts (committed reference files)

**Files:**
- Create: `deploy/unichat-bot.service`, `deploy/nginx-telegram.conf`

- [ ] **Step 1: Create systemd unit**

```ini
# deploy/unichat-bot.service
[Unit]
Description=uni-chat Telegram bot
After=network.target

[Service]
Type=simple
User=unichat
WorkingDirectory=/opt/unichat
ExecStart=/opt/unichat/bot/.venv-uv/bin/python -m bot.main
EnvironmentFile=/opt/unichat/bot/.env
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 2: Create nginx snippet**

```nginx
# deploy/nginx-telegram.conf
# Merge into the existing api.sepijan.xyz server block.

location /telegram/webhook/ {
    proxy_pass http://127.0.0.1:8081/;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Telegram-Bot-Api-Secret-Token $http_x_telegram_bot_api_secret_token;
    proxy_read_timeout 30s;
}
```

- [ ] **Step 3: Manual deploy steps documented in README**

Append to `bot/README.md`:

```markdown
## First-time prod deploy

1. SSH to server, clone repo to `/opt/unichat`, create user `unichat`, `chown -R unichat:unichat /opt/unichat`.
2. `cd /opt/unichat/bot && uv venv .venv-uv --python 3.12 && uv pip install -e . -e ../backend`
3. `cp /opt/unichat/bot/.env.example /opt/unichat/bot/.env` and fill values (TELEGRAM_BOT_TOKEN from BotFather, WEBHOOK_URL, secret).
4. `sudo cp /opt/unichat/deploy/unichat-bot.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now unichat-bot`
5. Add the nginx snippet to the existing `api.sepijan.xyz` site config and `nginx -s reload`.
6. Verify: `journalctl -u unichat-bot -f` shows "Webhook set to https://api.sepijan.xyz/telegram/webhook/<secret>".
7. Send `/help` to bot. Watch journal for delivery.

## BotFather setup

- /newbot → pick username e.g. `unichat_ai_bot`
- /setdescription, /setabouttext, /setuserpic
- /setcommands → paste:
  ```
  start - Link your uni-chat account
  new - Start a new conversation
  model - Pick a model
  assistant - Pick a saved assistant
  history - Recent conversations
  unlink - Disconnect Telegram
  help - Commands
  ```
- /setprivacy → enabled (default)
- /setjoingroups → disable
- /setinline → disable
```

- [ ] **Step 4: Commit**

```bash
git add deploy/unichat-bot.service deploy/nginx-telegram.conf bot/README.md
git commit -m "build(deploy): systemd unit + nginx snippet + first-deploy notes for bot"
```

---

### Task F2: GitHub Actions deploy-bot job

**Files:**
- Create: `.github/workflows/deploy-bot.yml`

- [ ] **Step 1: Create workflow**

```yaml
# .github/workflows/deploy-bot.yml
name: Deploy bot
on:
  push:
    branches: [main]
    paths:
      - 'bot/**'
      - 'backend/app/**'
      - 'backend/pyproject.toml'

jobs:
  deploy-bot:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: SSH deploy
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SERVER_SSH_KEY }}
          script: |
            set -e
            cd /opt/unichat
            git fetch --all
            git reset --hard origin/main
            cd bot
            ./.venv-uv/bin/python -m pip install -e . -e ../backend --upgrade
            sudo systemctl restart unichat-bot
            sudo systemctl status unichat-bot --no-pager
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/deploy-bot.yml
git commit -m "ci: deploy-bot workflow on bot/** or backend/** changes"
```

---

## Phase G — Verification

### Task G1: End-to-end verification

- [ ] **Step 1: Run all backend tests**

```bash
cd backend
./.venv-uv/Scripts/python.exe -m pytest tests/test_telegram_link_routes.py tests/test_models/test_telegram_link_token.py tests/test_models/test_user_telegram.py -v
```
Expected: 12 passed.

- [ ] **Step 2: Run all bot tests**

```bash
cd bot
./.venv-uv/Scripts/python.exe -m pytest -v
```
Expected: 12 passed (6 format + 4 ratelimit + 2 stream).

- [ ] **Step 3: Local end-to-end**

1. Backend up: `cd backend && ./.venv-uv/Scripts/python.exe run.py`
2. Frontend up: `cd frontend && npm run dev`
3. Bot up (polling): `cd bot && POLLING=1 ./.venv-uv/Scripts/python.exe -m bot.main`
4. Open `http://localhost:3000/settings`, click Telegram tab, click "Link Telegram", complete the deep-link in Telegram, wait for "Linked as @user" toast.
5. In Telegram, send "Hello". Expect placeholder + streamed reply within seconds.
6. Reload web app at `/chat` → conversation "Telegram chat" present, contains your messages.
7. `/model` → pick a different model. Send another message. Verify reply uses new model (look at message metadata in Mongo or check the response style).
8. `/new` → send a message → new conversation appears in web app.
9. Send 21 messages within 60s → expect "Slow down".
10. `/unlink` → bot says farewell. Web Settings panel flips to unlinked.

- [ ] **Step 4: Prod webhook smoke (after F2 deploy)**

```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"update_id":1}' \
  https://api.sepijan.xyz/telegram/webhook/wrongsecret
# Expect: 401 or 403

ssh server "journalctl -u unichat-bot -n 50 --no-pager"
# Expect: webhook hits when sending /help to the bot
```

- [ ] **Step 5: Commit verification artifacts (none needed unless docs change)**

If this phase exposed bugs, fix them, add regression tests, and commit. If clean: no commit.

---

## Out of scope (future specs)

- `/image`, vision (photo input), voice in/out
- `/save` to Knowledge Vault
- Group chats, inline mode (`@unichat_ai_bot ...`)
- Workflow triggers, Arena, Debate from Telegram
- BYOK per-user OpenRouter keys
- Discord gateway (port the same architecture)

These are documented in §11 of the source spec. Each becomes its own brainstorm → spec → plan cycle.
