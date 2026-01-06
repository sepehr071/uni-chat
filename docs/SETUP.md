# Setup Guide

Complete development environment setup guide for Uni-Chat.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [System Requirements](#system-requirements)
3. [Quick Start](#quick-start)
4. [Backend Setup](#backend-setup)
5. [Frontend Setup](#frontend-setup)
6. [Database Setup](#database-setup)
7. [Environment Configuration](#environment-configuration)
8. [Running the Application](#running-the-application)
9. [Development Workflow](#development-workflow)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before you begin, ensure you have the following installed:

### Required Software

1. **Python 3.10 or higher**
   - Download: https://www.python.org/downloads/
   - Verify: `python --version`

2. **Node.js 18.x or higher**
   - Download: https://nodejs.org/
   - Verify: `node --version`

3. **npm 9.x or higher** (comes with Node.js)
   - Verify: `npm --version`

4. **MongoDB 6.0 or higher**
   - Download: https://www.mongodb.com/try/download/community
   - Verify: `mongod --version`

5. **Git**
   - Download: https://git-scm.com/downloads
   - Verify: `git --version`

### Optional Tools

- **MongoDB Compass** - GUI for MongoDB (recommended)
- **Postman** - API testing
- **VS Code** - Recommended code editor

---

## System Requirements

### Minimum Requirements

- **OS:** Windows 10/11, macOS 10.15+, Linux (Ubuntu 20.04+)
- **RAM:** 4 GB
- **Disk Space:** 2 GB free space
- **Internet:** Required for OpenRouter API access

### Recommended Requirements

- **OS:** Windows 11, macOS 12+, Linux (Ubuntu 22.04+)
- **RAM:** 8 GB or more
- **Disk Space:** 5 GB free space
- **Internet:** Stable broadband connection

---

## Quick Start

For the impatient, here's the fastest way to get started:

```bash
# 1. Clone repository
git clone https://github.com/yourusername/uni-chat.git
cd uni-chat

# 2. Setup backend
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env and add your OPENROUTER_API_KEY

# 3. Setup frontend
cd ../frontend
npm install
cp .env.example .env
# Edit .env if needed

# 4. Start MongoDB
mongod --dbpath /path/to/data/directory

# 5. Run backend (in backend/ directory)
python run.py

# 6. Run frontend (in frontend/ directory, new terminal)
npm run dev

# 7. Open browser
# Visit http://localhost:3000
```

---

## Backend Setup

### 1. Clone Repository

```bash
git clone https://github.com/yourusername/uni-chat.git
cd uni-chat
```

### 2. Create Virtual Environment

**On macOS/Linux:**
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
```

**On Windows:**
```bash
cd backend
python -m venv venv
venv\Scripts\activate
```

You should see `(venv)` in your terminal prompt.

### 3. Install Dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

**Expected packages:**
- Flask 3.0+
- Flask-SocketIO
- Flask-JWT-Extended
- Flask-CORS
- Flask-Limiter
- PyMongo
- bcrypt
- python-dotenv
- eventlet
- requests

### 4. Verify Installation

```bash
python -c "import flask; print(flask.__version__)"
python -c "import pymongo; print(pymongo.__version__)"
```

### 5. Setup Environment Variables

```bash
cp .env.example .env
```

Edit `.env` with your favorite text editor:

```bash
# Required
SECRET_KEY=your-random-secret-key-here
JWT_SECRET_KEY=your-different-random-secret-here
OPENROUTER_API_KEY=your-openrouter-api-key

# Database
MONGO_URI=mongodb://localhost:27017/unichat

# Default Admin (created on first run)
ADMIN_EMAIL=admin@admin.com
ADMIN_PASSWORD=admin123
ADMIN_NAME=Administrator

# Optional
FLASK_ENV=development
FLASK_DEBUG=1
```

**To generate secret keys:**

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

**To get OpenRouter API key:**
1. Sign up at https://openrouter.ai/
2. Navigate to API Keys section
3. Create a new API key
4. Copy and paste into `.env`

---

## Frontend Setup

### 1. Navigate to Frontend Directory

```bash
cd frontend
```

### 2. Install Dependencies

```bash
npm install
```

**Expected packages:**
- react
- react-dom
- react-router-dom
- vite
- tailwindcss
- axios
- socket.io-client
- @tanstack/react-query
- lucide-react
- react-hot-toast

This may take a few minutes.

### 3. Setup Environment Variables

```bash
cp .env.example .env
```

Edit `.env`:

```bash
# API Configuration
VITE_API_URL=http://localhost:5000
VITE_WS_URL=ws://localhost:5000

# Optional: Feature Flags
VITE_ENABLE_IMAGE_GENERATION=true
VITE_ENABLE_ARENA=true
```

### 4. Verify Installation

```bash
npm run lint
```

Should show no errors (warnings are okay).

---

## Database Setup

### 1. Install MongoDB

**On macOS (using Homebrew):**
```bash
brew tap mongodb/brew
brew install mongodb-community@6.0
brew services start mongodb-community@6.0
```

**On Ubuntu/Debian:**
```bash
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod
```

**On Windows:**
1. Download MongoDB Community Server from https://www.mongodb.com/try/download/community
2. Run the installer (choose "Complete" installation)
3. Install as a Windows Service
4. Start MongoDB service from Services app

### 2. Verify MongoDB is Running

```bash
mongosh
```

You should see the MongoDB shell. Type `exit` to quit.

### 3. Create Database (Optional)

MongoDB creates databases automatically, but you can create it manually:

```bash
mongosh
> use unichat
> db.createCollection("users")
> exit
```

### 4. Setup Indexes (Recommended)

After first run, optimize performance with indexes:

```bash
cd backend
source venv/bin/activate  # On Windows: venv\Scripts\activate
python scripts/setup_indexes.py
```

This creates compound indexes for faster queries.

### 5. MongoDB Compass (Optional)

For a GUI to view your data:

1. Download MongoDB Compass: https://www.mongodb.com/try/download/compass
2. Install and open
3. Connect to `mongodb://localhost:27017`
4. View `unichat` database

---

## Environment Configuration

### Backend Environment Variables

**Required:**
- `SECRET_KEY` - Flask secret key for session management
- `JWT_SECRET_KEY` - Secret key for JWT token signing
- `OPENROUTER_API_KEY` - Your OpenRouter API key
- `MONGO_URI` - MongoDB connection string

**Optional:**
- `ADMIN_EMAIL` - Default admin email (default: admin@admin.com)
- `ADMIN_PASSWORD` - Default admin password (default: admin123)
- `ADMIN_NAME` - Default admin display name (default: Administrator)
- `FLASK_ENV` - Environment mode (development/production)
- `FLASK_DEBUG` - Debug mode (0 or 1)
- `CORS_ORIGINS` - Allowed CORS origins (comma-separated)
- `RATE_LIMIT_ENABLED` - Enable rate limiting (default: true)
- `MAX_UPLOAD_SIZE` - Max file upload size in MB (default: 16)

### Frontend Environment Variables

**Required:**
- `VITE_API_URL` - Backend API URL
- `VITE_WS_URL` - Backend WebSocket URL

**Optional:**
- `VITE_ENABLE_IMAGE_GENERATION` - Enable image generation features
- `VITE_ENABLE_ARENA` - Enable arena mode
- `VITE_APP_NAME` - Application name (default: Uni-Chat)

---

## Running the Application

### Option 1: Manual Start (Recommended for Development)

**Terminal 1 - MongoDB:**
```bash
# If not running as a service
mongod --dbpath /path/to/data
```

**Terminal 2 - Backend:**
```bash
cd backend
source venv/bin/activate  # On Windows: venv\Scripts\activate
python run.py
```

Expected output:
```
 * Running on http://127.0.0.1:5000
 * Restarting with stat
 * Debugger is active!
```

**Terminal 3 - Frontend:**
```bash
cd frontend
npm run dev
```

Expected output:
```
  VITE v5.x.x  ready in XXX ms

  ➜  Local:   http://localhost:3000/
  ➜  Network: use --host to expose
```

### Option 2: Using Process Manager

**Install PM2 (optional):**
```bash
npm install -g pm2
```

**Start all services:**
```bash
# Backend
cd backend
pm2 start run.py --name unichat-backend --interpreter python

# Frontend
cd frontend
pm2 start "npm run dev" --name unichat-frontend

# View logs
pm2 logs

# Stop all
pm2 stop all
```

### Option 3: Docker (Coming Soon)

Docker support is planned for future releases.

---

## Development Workflow

### Backend Development

**1. Activate Virtual Environment**
```bash
cd backend
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

**2. Make Changes**
- Edit files in `app/`
- Flask auto-reloads on file changes (if `FLASK_DEBUG=1`)

**3. Add New Dependencies**
```bash
pip install <package-name>
pip freeze > requirements.txt
```

**4. Run Tests** (when available)
```bash
pytest
```

**5. Database Operations**

**Create a new model:**
```python
# app/models/new_model.py
class NewModel:
    @staticmethod
    def create(data):
        from app.extensions import mongo
        result = mongo.db.new_collection.insert_one(data)
        return mongo.db.new_collection.find_one({'_id': result.inserted_id})
```

**Create a new route:**
```python
# app/routes/new_route.py
from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required

new_bp = Blueprint('new_route', __name__)

@new_bp.route('/endpoint', methods=['GET'])
@jwt_required()
def endpoint():
    return jsonify({'message': 'Hello'})
```

**Register route in `app/__init__.py`:**
```python
from app.routes.new_route import new_bp
app.register_blueprint(new_bp, url_prefix='/api/new')
```

### Frontend Development

**1. Navigate to Frontend**
```bash
cd frontend
```

**2. Make Changes**
- Edit files in `src/`
- Vite hot-reloads instantly

**3. Add New Dependencies**
```bash
npm install <package-name>
```

**4. Run Linter**
```bash
npm run lint
npm run lint -- --fix  # Auto-fix issues
```

**5. Build for Production**
```bash
npm run build
npm run preview  # Preview production build
```

**6. Create New Page**

```javascript
// src/pages/NewPage.jsx
export default function NewPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">New Page</h1>
    </div>
  )
}
```

**Add route in `src/App.jsx`:**
```javascript
const NewPage = lazy(() => import('./pages/NewPage'))

// In Routes:
<Route path="/new" element={<Suspense fallback={<LoadingSpinner />}><NewPage /></Suspense>} />
```

### Git Workflow

**1. Create Feature Branch**
```bash
git checkout -b feature/my-feature
```

**2. Make Changes and Commit**
```bash
git add .
git commit -m "feat: add new feature"
```

**3. Push to Remote**
```bash
git push origin feature/my-feature
```

**4. Create Pull Request**
- Go to GitHub
- Create PR from feature branch to main
- Request review

### Code Style

**Backend (Python):**
- Follow PEP 8
- Use 4 spaces for indentation
- Docstrings for all functions
- Type hints where appropriate

**Frontend (JavaScript/React):**
- Use ESLint configuration
- Use 2 spaces for indentation
- Functional components with hooks
- PropTypes or TypeScript (future)

---

## Troubleshooting

### Common Issues

#### 1. Port Already in Use

**Backend (Port 5000):**
```bash
# Find process using port
lsof -ti:5000  # macOS/Linux
netstat -ano | findstr :5000  # Windows

# Kill process
kill -9 <PID>  # macOS/Linux
taskkill /PID <PID> /F  # Windows
```

**Frontend (Port 3000):**
```bash
# Similar to above, but for port 3000
```

#### 2. MongoDB Connection Failed

**Check if MongoDB is running:**
```bash
mongosh
```

**Start MongoDB service:**
```bash
# macOS
brew services start mongodb-community

# Linux
sudo systemctl start mongod

# Windows
net start MongoDB
```

**Check connection string:**
- Verify `MONGO_URI` in `.env`
- Default: `mongodb://localhost:27017/unichat`

#### 3. Module Not Found (Python)

**Ensure virtual environment is activated:**
```bash
# You should see (venv) in prompt
source venv/bin/activate  # macOS/Linux
venv\Scripts\activate  # Windows
```

**Reinstall dependencies:**
```bash
pip install -r requirements.txt
```

#### 4. Module Not Found (Node)

**Clear cache and reinstall:**
```bash
rm -rf node_modules package-lock.json
npm install
```

#### 5. CORS Errors

**Check `CORS_ORIGINS` in backend `.env`:**
```bash
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

**Verify frontend is running on expected port.**

#### 6. WebSocket Connection Failed

**Check `VITE_WS_URL` in frontend `.env`:**
```bash
VITE_WS_URL=ws://localhost:5000
```

**Ensure backend is running and accessible.**

**Check browser console for specific error messages.**

#### 7. OpenRouter API Errors

**Verify API key:**
- Check `OPENROUTER_API_KEY` in backend `.env`
- Ensure key is valid and has credits

**Check API status:**
- Visit https://openrouter.ai/status

**View backend logs for detailed error messages.**

#### 8. Admin Login Not Working

**Check default credentials:**
- Email: Value of `ADMIN_EMAIL` in `.env` (default: admin@admin.com)
- Password: Value of `ADMIN_PASSWORD` in `.env` (default: admin123)

**Reset admin password:**
```bash
cd backend
python
>>> from app.extensions import mongo
>>> from app.models.user import UserModel
>>> user = mongo.db.users.find_one({'email': 'admin@admin.com'})
>>> if user:
...     import bcrypt
...     new_hash = bcrypt.hashpw(b'newpassword', bcrypt.gensalt())
...     mongo.db.users.update_one({'_id': user['_id']}, {'$set': {'password_hash': new_hash}})
>>> exit()
```

#### 9. Image Generation Not Working

**Check model availability:**
- Some image generation models may not be available
- Check OpenRouter documentation for current models

**Verify image generation is enabled:**
```bash
# frontend/.env
VITE_ENABLE_IMAGE_GENERATION=true
```

**Check file size limits:**
- Input images must be base64 data URIs or URLs
- Check console for specific errors

#### 10. Database Performance Issues

**Create indexes:**
```bash
cd backend
python scripts/setup_indexes.py
```

**Check MongoDB logs:**
```bash
# macOS/Linux
tail -f /usr/local/var/log/mongodb/mongo.log

# Linux (systemd)
journalctl -u mongod -f
```

### Getting Help

If you encounter issues not covered here:

1. **Check Logs:**
   - Backend: Terminal output
   - Frontend: Browser console (F12)
   - MongoDB: MongoDB logs

2. **Search Issues:**
   - Check GitHub Issues: https://github.com/yourusername/uni-chat/issues
   - Search for error messages

3. **Create Issue:**
   - Provide detailed error messages
   - Include environment details (OS, Python version, Node version)
   - Steps to reproduce

4. **Community:**
   - Discord: [Coming Soon]
   - Stack Overflow: Tag with `uni-chat`

---

## Next Steps

Once you have the application running:

1. **Explore the Application:**
   - Create an account
   - Try different AI models
   - Create custom configurations
   - Test arena mode
   - Generate images

2. **Read Documentation:**
   - [API Documentation](./API.md)
   - [Architecture Documentation](./ARCHITECTURE.md)
   - [Deployment Guide](./DEPLOYMENT.md)

3. **Start Developing:**
   - Read [CONTRIBUTING.md](../CONTRIBUTING.md)
   - Pick an issue to work on
   - Join the community

4. **Configure for Production:**
   - See [DEPLOYMENT.md](./DEPLOYMENT.md)
   - Set up production environment
   - Configure monitoring

---

## Development Tools

### Recommended VS Code Extensions

**Backend:**
- Python
- Pylance
- Python Docstring Generator
- GitLens

**Frontend:**
- ES7+ React/Redux/React-Native snippets
- Tailwind CSS IntelliSense
- ESLint
- Prettier
- Auto Rename Tag

**General:**
- Docker (if using Docker)
- MongoDB for VS Code
- REST Client

### Useful Commands

**Backend:**
```bash
# Activate venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run backend
python run.py

# Python shell with app context
python
>>> from app import create_app
>>> app = create_app()
>>> with app.app_context():
...     # Run code here
```

**Frontend:**
```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run linter
npm run lint
```

**Database:**
```bash
# MongoDB shell
mongosh

# Backup database
mongodump --db unichat --out ./backup

# Restore database
mongorestore --db unichat ./backup/unichat

# Drop database (CAUTION!)
mongosh unichat --eval "db.dropDatabase()"
```

---

## Security Notes

### Development Environment

1. **Never commit `.env` files:**
   - Already in `.gitignore`
   - Contains sensitive keys

2. **Use different secrets for production:**
   - Generate new `SECRET_KEY` and `JWT_SECRET_KEY`
   - Use environment-specific API keys

3. **Default admin credentials:**
   - Change default admin password immediately
   - Use strong passwords in production

4. **API Keys:**
   - Rotate OpenRouter API key regularly
   - Set spending limits on OpenRouter dashboard
   - Monitor usage

### Best Practices

1. **Keep dependencies updated:**
   ```bash
   # Backend
   pip list --outdated
   pip install --upgrade <package>

   # Frontend
   npm outdated
   npm update
   ```

2. **Regular backups:**
   - Backup MongoDB database regularly
   - Store backups securely

3. **Monitor logs:**
   - Check for suspicious activity
   - Set up log aggregation in production

---

## Performance Tips

### Backend

1. **Use MongoDB indexes:**
   - Run `setup_indexes.py` after database changes
   - Monitor slow queries

2. **Enable caching:**
   - Models list is cached for 1 hour
   - Implement Redis for session storage (future)

3. **Optimize database queries:**
   - Use projection to limit fields
   - Paginate large result sets

### Frontend

1. **Lazy load routes:**
   - Already implemented with React.lazy()

2. **Optimize bundle size:**
   - Check with `npm run build`
   - Use code splitting

3. **Use React Query caching:**
   - Already configured with 5-minute stale time

### MongoDB

1. **Monitor performance:**
   ```bash
   mongosh
   > db.currentOp()
   > db.serverStatus()
   ```

2. **Optimize queries:**
   - Use `explain()` to analyze queries
   - Create appropriate indexes

---

## Conclusion

You should now have a fully functional development environment for Uni-Chat. If you encounter any issues, refer to the [Troubleshooting](#troubleshooting) section or open an issue on GitHub.

Happy coding!
