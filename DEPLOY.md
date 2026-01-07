# Deployment Guide: Frontend (Vercel) + Backend (Ubuntu Server)

## Architecture Overview

```
┌─────────────────┐         ┌─────────────────────────────┐
│     Vercel      │         │      Ubuntu Server          │
│   (Frontend)    │ ──────► │       (Backend)             │
│                 │         │                             │
│  React + Vite   │  HTTPS  │  Flask + Socket.IO + Gunicorn│
│                 │         │  Nginx (reverse proxy)      │
│                 │         │  MongoDB                    │
└─────────────────┘         └─────────────────────────────┘
```

---

## Prerequisites

- Domain name for backend (e.g., `api.yourdomain.com`)
- Ubuntu 20.04+ server with root access
- Vercel account
- MongoDB (local on server or MongoDB Atlas)
- OpenRouter API key

---

## Step 1: Prepare Backend Code

### 1.1 Update `frontend/vercel.json`

Replace `YOUR_BACKEND_DOMAIN` with your actual backend domain:

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://api.yourdomain.com/api/:path*"
    },
    {
      "source": "/socket.io/:path*",
      "destination": "https://api.yourdomain.com/socket.io/:path*"
    }
  ]
}
```

---

## Step 2: Ubuntu Server Setup

### 2.1 Install System Dependencies

```bash
sudo apt update
sudo apt install -y python3.11 python3.11-venv python3-pip nginx certbot python3-certbot-nginx git
```

### 2.2 Install MongoDB (if running locally)

```bash
# Import MongoDB GPG key
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor

# Add repository
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

# Install
sudo apt update
sudo apt install -y mongodb-org

# Start and enable
sudo systemctl start mongod
sudo systemctl enable mongod
```

### 2.3 Clone and Setup Backend

```bash
# Create directory
sudo mkdir -p /var/www/uni-chat
sudo chown $USER:$USER /var/www/uni-chat

# Clone repository (or upload files)
cd /var/www/uni-chat
git clone https://github.com/yourusername/uni-chat.git .

# Setup Python environment
cd backend
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2.4 Create Environment File

```bash
nano /var/www/uni-chat/backend/.env
```

Add the following (replace with your values):

```bash
# Required
SECRET_KEY=your-random-64-character-secret-key-here
JWT_SECRET_KEY=your-random-64-character-jwt-secret-here
OPENROUTER_API_KEY=sk-or-v1-your-openrouter-api-key

# Database
MONGO_URI=mongodb://localhost:27017/unichat

# CORS - Replace with your Vercel URL after deployment
CORS_ORIGINS=https://your-app.vercel.app

# App Info (used by OpenRouter for tracking)
BASE_URL=https://api.yourdomain.com
APP_NAME=Uni-Chat

# Optional: Default admin user
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=your-secure-admin-password

# Environment
FLASK_ENV=production
FLASK_DEBUG=false
```

Generate secure keys:
```bash
# Generate SECRET_KEY
python3 -c "import secrets; print(secrets.token_hex(32))"

# Generate JWT_SECRET_KEY
python3 -c "import secrets; print(secrets.token_hex(32))"
```

---

## Step 3: Configure Gunicorn Service

### 3.1 Create Systemd Service

```bash
sudo nano /etc/systemd/system/unichat.service
```

Add:

```ini
[Unit]
Description=Uni-Chat Backend API
After=network.target mongod.service

[Service]
User=www-data
Group=www-data
WorkingDirectory=/var/www/uni-chat/backend
Environment="PATH=/var/www/uni-chat/backend/venv/bin"
EnvironmentFile=/var/www/uni-chat/backend/.env
ExecStart=/var/www/uni-chat/backend/venv/bin/gunicorn \
    --worker-class eventlet \
    --workers 1 \
    --bind 127.0.0.1:5000 \
    --timeout 120 \
    --access-logfile /var/log/unichat/access.log \
    --error-logfile /var/log/unichat/error.log \
    wsgi:app
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### 3.2 Setup Log Directory and Permissions

```bash
# Create log directory
sudo mkdir -p /var/log/unichat
sudo chown www-data:www-data /var/log/unichat

# Set permissions for app directory
sudo chown -R www-data:www-data /var/www/uni-chat
```

### 3.3 Start Service

```bash
sudo systemctl daemon-reload
sudo systemctl enable unichat
sudo systemctl start unichat

# Check status
sudo systemctl status unichat

# View logs if needed
sudo journalctl -u unichat -f
```

---

## Step 4: Configure Nginx

### 4.1 Create Nginx Site Config

```bash
sudo nano /etc/nginx/sites-available/unichat
```

Add:

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    # Redirect HTTP to HTTPS (after SSL setup)
    # return 301 https://$server_name$request_uri;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;

        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts for long-running requests (streaming)
        proxy_read_timeout 120s;
        proxy_connect_timeout 120s;
        proxy_send_timeout 120s;

        # Disable buffering for streaming
        proxy_buffering off;
        proxy_cache off;
    }
}
```

### 4.2 Enable Site and Test

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/unichat /etc/nginx/sites-enabled/

# Remove default site (optional)
sudo rm /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

### 4.3 Setup SSL with Let's Encrypt

```bash
sudo certbot --nginx -d api.yourdomain.com
```

Follow the prompts. Certbot will automatically configure HTTPS and set up auto-renewal.

---

## Step 5: Deploy Frontend to Vercel

### 5.1 Install Vercel CLI

```bash
npm install -g vercel
```

### 5.2 Deploy

```bash
cd frontend
vercel login
vercel deploy --prod
```

### 5.3 Note Your Vercel URL

After deployment, note your URL (e.g., `https://uni-chat-abc123.vercel.app` or your custom domain).

---

## Step 6: Update CORS Origins

After getting your Vercel URL, update the backend `.env`:

```bash
sudo nano /var/www/uni-chat/backend/.env
```

Update `CORS_ORIGINS`:
```bash
CORS_ORIGINS=https://uni-chat-abc123.vercel.app
```

For multiple origins (e.g., custom domain + vercel URL):
```bash
CORS_ORIGINS=https://yourdomain.com,https://uni-chat-abc123.vercel.app
```

Restart the service:
```bash
sudo systemctl restart unichat
```

---

## Step 7: Verify Deployment

### 7.1 Test Backend Health

```bash
curl https://api.yourdomain.com/api/health/status
```

Expected response:
```json
{"status": "healthy", "message": "API is running"}
```

### 7.2 Test Frontend

Visit your Vercel URL and:
1. Register a new account
2. Create an LLM config
3. Start a chat conversation
4. Verify real-time streaming works

---

## Troubleshooting

### Backend Won't Start

```bash
# Check logs
sudo journalctl -u unichat -n 50

# Check if port is in use
sudo lsof -i :5000

# Test manually
cd /var/www/uni-chat/backend
source venv/bin/activate
python run.py
```

### WebSocket Connection Failed

1. Ensure Nginx has WebSocket headers configured
2. Check CORS_ORIGINS includes your frontend URL
3. Verify SSL certificate is valid

### MongoDB Connection Failed

```bash
# Check MongoDB status
sudo systemctl status mongod

# Check if listening
sudo netstat -tlnp | grep 27017
```

### 502 Bad Gateway

```bash
# Check if Gunicorn is running
sudo systemctl status unichat

# Check Nginx error log
sudo tail -f /var/log/nginx/error.log
```

---

## Maintenance Commands

```bash
# Restart backend
sudo systemctl restart unichat

# View backend logs
sudo tail -f /var/log/unichat/error.log

# Update code
cd /var/www/uni-chat
git pull
sudo systemctl restart unichat

# Renew SSL (auto, but manual if needed)
sudo certbot renew
```

---

## Security Checklist

- [ ] Strong SECRET_KEY and JWT_SECRET_KEY (64+ characters)
- [ ] CORS_ORIGINS set to specific domains (not `*`)
- [ ] FLASK_DEBUG=false in production
- [ ] SSL/HTTPS enabled
- [ ] MongoDB not exposed to internet
- [ ] Firewall configured (only 80, 443, 22 open)
- [ ] Regular backups of MongoDB data

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `SECRET_KEY` | Yes | Flask secret key (64+ chars) |
| `JWT_SECRET_KEY` | Yes | JWT signing key (64+ chars) |
| `OPENROUTER_API_KEY` | Yes | OpenRouter API key |
| `MONGO_URI` | Yes | MongoDB connection string |
| `CORS_ORIGINS` | Yes | Allowed frontend origins (comma-separated) |
| `BASE_URL` | Yes | Backend URL for OpenRouter referer |
| `APP_NAME` | No | App name for OpenRouter (default: Uni-Chat) |
| `ADMIN_EMAIL` | No | Default admin email |
| `ADMIN_PASSWORD` | No | Default admin password |
| `FLASK_ENV` | No | Environment (production/development) |
| `FLASK_DEBUG` | No | Enable debug mode (true/false) |
| `PORT` | No | Backend port (default: 5000) |
