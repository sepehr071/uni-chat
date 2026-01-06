# 🧪 Testing Setup & Instructions

## Quick Start

### 1. Fix Template Display Bug

**Problem**: Templates show count but display "No templates found"

**Solution**: Run the seed script to populate the database

```bash
# Open terminal in backend directory
cd backend

# Activate conda environment
conda activate uni-chat

# Run the simple seed script
python seed_templates_simple.py
```

You should see:
```
Seeding prompt templates...
Successfully seeded 32 prompt templates
Categories: 8

Templates by category:
   - advertisement: 4 templates
   - fashion_apparel: 4 templates
   - food_restaurant: 4 templates
   - hero_banner: 4 templates
   - lifestyle: 4 templates
   - product_photography: 4 templates
   - social_media: 4 templates
   - tech_saas: 4 templates

Done!
```

### 2. Install Test Dependencies

```bash
# Make sure you're in backend directory with conda activated
conda activate uni-chat

# Install test dependencies
pip install -r requirements-test.txt
```

### 3. Run All Tests

**Once agents finish writing tests:**

```bash
# Run all tests with coverage
pytest

# Run specific test file
pytest tests/test_auth.py

# Run tests in parallel (faster)
pytest -n auto

# Run with detailed output
pytest -v -s

# Run only unit tests
pytest -m unit

# Run only integration tests
pytest -m integration

# Generate HTML coverage report
pytest --cov=app --cov-report=html
# Open htmlcov/index.html in browser
```

## 🤖 Multi-Agent Test Writing (In Progress)

I've launched **4 specialized agents** working in parallel to write comprehensive tests:

### Agent 1: Auth & User Tests
**Coverage**: Authentication, user management, token handling
**Files Creating**:
- `tests/test_auth.py` - Registration, login, logout, token refresh
- `tests/test_users.py` - User profile operations
- `tests/test_models/test_user_model.py` - UserModel unit tests
- `tests/conftest.py` - Shared pytest fixtures

### Agent 2: Chat & Conversation Tests
**Coverage**: Chat functionality, conversations, messaging
**Files Creating**:
- `tests/test_chat.py` - Chat route tests
- `tests/test_conversations.py` - Conversation CRUD operations
- `tests/test_models/test_conversation_model.py` - ConversationModel tests
- `tests/test_models/test_message_model.py` - MessageModel tests
- `tests/test_sockets/test_chat_events.py` - Socket.IO chat events

### Agent 3: Config, Image & Gallery Tests
**Coverage**: LLM configs, image generation, public gallery
**Files Creating**:
- `tests/test_configs.py` - LLM configuration management
- `tests/test_image_generation.py` - Image generation with mocked OpenRouter
- `tests/test_gallery.py` - Public config gallery
- `tests/test_models/test_llm_config_model.py` - LLMConfigModel tests
- `tests/test_models/test_generated_image_model.py` - Image model tests
- `tests/test_models/test_prompt_template_model.py` - Template model tests

### Agent 4: Admin, Arena & Auxiliary Tests
**Coverage**: Admin panel, arena mode, utilities
**Files Creating**:
- `tests/test_admin.py` - Admin routes (user management, analytics, audit)
- `tests/test_arena.py` - Arena session management
- `tests/test_sockets/test_arena_events.py` - Arena parallel streaming
- `tests/test_models.py` - Model listing routes
- `tests/test_folders.py` - Folder organization
- `tests/test_uploads.py` - File upload security
- `tests/test_health.py` - Health check endpoint

## 📊 Expected Test Coverage

**Target**: 90%+ code coverage

**Focus Areas**:
- ✅ All route handlers (success + error paths)
- ✅ Model CRUD operations
- ✅ Socket.IO events
- ✅ Authentication & authorization
- ✅ Input validation
- ✅ Security (NoSQL injection, file uploads, CORS)
- ✅ Edge cases (null, empty, extreme values)
- ✅ Error handling

## 🔧 Test Structure

```
backend/tests/
├── conftest.py              # Shared fixtures (app, client, auth)
├── test_auth.py             # Authentication tests
├── test_users.py            # User management tests
├── test_chat.py             # Chat route tests
├── test_conversations.py    # Conversation tests
├── test_configs.py          # LLM config tests
├── test_image_generation.py # Image generation tests
├── test_gallery.py          # Public gallery tests
├── test_admin.py            # Admin panel tests
├── test_arena.py            # Arena session tests
├── test_folders.py          # Folder organization tests
├── test_uploads.py          # File upload tests
├── test_health.py           # Health check tests
├── test_models.py           # Model listing tests
├── test_models/             # Model unit tests
│   ├── test_user_model.py
│   ├── test_conversation_model.py
│   ├── test_message_model.py
│   ├── test_llm_config_model.py
│   ├── test_generated_image_model.py
│   └── test_prompt_template_model.py
└── test_sockets/            # Socket.IO tests
    ├── test_chat_events.py
    └── test_arena_events.py
```

## 🚀 After Tests Are Written

### Step 1: Review Generated Tests
Agents will create comprehensive test files. Review them for:
- Completeness
- Correct assertions
- Realistic test data
- Proper mocking

### Step 2: Run Tests
```bash
conda activate uni-chat
cd backend
pytest
```

### Step 3: Fix Failing Tests
The agents will write tests based on current code structure. If tests fail:

**Common Fixes Needed**:
1. **Import errors**: Ensure all dependencies installed
2. **MongoDB connection**: Tests use `unichat_test` database
3. **Environment variables**: `.env.test` may be needed
4. **Mock responses**: OpenRouter API calls must be mocked
5. **Fixtures**: Ensure conftest.py fixtures are correct

### Step 4: Iterate Until All Pass
Run tests → Fix failures → Run tests → Repeat

I'll help you fix any failing tests after the agents complete!

## 📈 Continuous Testing

### Run Tests on Every Change
```bash
# Watch mode (install pytest-watch)
pip install pytest-watch
ptw

# Or use pytest-xdist for fast reruns
pytest --looponfail
```

### Pre-commit Hooks
```bash
# Install pre-commit
pip install pre-commit

# Run tests before each commit
# Add to .pre-commit-config.yaml:
# - repo: local
#   hooks:
#     - id: pytest
#       name: pytest
#       entry: pytest
#       language: system
#       pass_filenames: false
```

## 🎯 Test Quality Checklist

- [ ] All tests pass
- [ ] Coverage above 90%
- [ ] No skipped tests without reason
- [ ] Security tests included
- [ ] Edge cases covered
- [ ] Error paths tested
- [ ] Mocks properly configured
- [ ] Tests run fast (< 30 seconds total)
- [ ] Tests are deterministic (no flaky tests)
- [ ] Clear test names and documentation

## 🐛 Debugging Failed Tests

```bash
# Run with full output
pytest -vvs tests/test_auth.py

# Run single test
pytest tests/test_auth.py::test_login_success

# Drop into debugger on failure
pytest --pdb

# Show local variables on failure
pytest -l

# Run last failed tests only
pytest --lf
```

## ✅ Expected Outcome

After all agents complete and tests are fixed:
- **~20-30 test files** with comprehensive coverage
- **200+ test cases** covering all functionality
- **90%+ code coverage**
- **Security vulnerabilities** tested and documented
- **Regression prevention** for future changes
- **Confidence to refactor** knowing tests will catch breaks

## 📝 Next Steps After Testing

Once all tests pass:
1. Review AGENT_FINDINGS_CONSOLIDATED.md
2. Fix critical security issues (with tests to verify)
3. Implement high-priority refactorings (tests ensure no breaks)
4. Add CI/CD pipeline to run tests automatically

---

**Status**: Agents are currently writing tests in parallel. This may take 10-15 minutes. When complete, you'll have a fully tested backend!
