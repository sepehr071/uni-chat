# Deployment Guide

Production deployment guide for Uni-Chat application.

## Table of Contents

1. [Overview](#overview)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Deployment Options](#deployment-options)
4. [Database Deployment](#database-deployment)
5. [Backend Deployment](#backend-deployment)
6. [Frontend Deployment](#frontend-deployment)
7. [Environment Configuration](#environment-configuration)
8. [Security Hardening](#security-hardening)
9. [SSL/TLS Setup](#ssltls-setup)
10. [Monitoring and Logging](#monitoring-and-logging)
11. [Backup and Recovery](#backup-and-recovery)
12. [Scaling](#scaling)
13. [CI/CD Pipeline](#cicd-pipeline)
14. [Troubleshooting](#troubleshooting)

---

## Overview

This guide covers deploying Uni-Chat to production environments. We'll cover various deployment strategies from simple single-server deployments to scalable cloud architectures.

### Architecture Components

```
┌─────────────────────────────────────────────────────────────┐
│                        Internet                              │
└────────────────────────────┬────────────────────────────────┘
                             │
                     ┌───────▼────────┐
                     │   DNS/CDN      │
                     │  (Cloudflare)  │
                     └───────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
      ┌───────▼────────┐          ┌────────▼────────┐
      │   Frontend      │          │   Backend       │
      │   (Vercel)      │          │   (Railway)     │
      │   Static Files  │◄─────────┤   Flask API     │
      └─────────────────┘   API    │   WebSocket     │
                            Calls   └────────┬────────┘
                                            │
                                    ┌───────▼────────┐
                                    │   Database     │
                                    │   (MongoDB)    │
                                    └────────────────┘
```

---

## Pre-Deployment Checklist

### Code Preparation

- [ ] All tests passing
- [ ] Code reviewed and approved
- [ ] No debug code or console.logs in production
- [ ] Environment-specific configurations separated
- [ ] Dependencies up to date and audited
- [ ] Build succeeds without errors
- [ ] API documentation updated
- [ ] Database migrations ready

### Security

- [ ] All secrets in environment variables (not hardcoded)
- [ ] Strong, unique secrets generated for production
- [ ] API keys have spending limits
- [ ] CORS configured for production domains only
- [ ] Rate limiting enabled
- [ ] SQL/NoSQL injection prevention verified
- [ ] XSS prevention verified
- [ ] CSRF protection enabled
- [ ] Security headers configured

### Infrastructure

- [ ] Domain name registered
- [ ] SSL certificate obtained
- [ ] CDN configured (optional but recommended)
- [ ] Monitoring tools set up
- [ ] Log aggregation configured
- [ ] Backup strategy defined
- [ ] Disaster recovery plan documented

### Performance

- [ ] Database indexes created
- [ ] Static assets optimized
- [ ] Images compressed
- [ ] Bundle size optimized
- [ ] Caching strategies implemented
- [ ] Load testing completed

---

## Deployment Options

### Option 1: Platform as a Service (Recommended)

**Pros:** Easy setup, managed infrastructure, automatic scaling
**Cons:** Less control, potentially higher costs at scale

**Recommended Platforms:**
- **Frontend:** Vercel, Netlify, Cloudflare Pages
- **Backend:** Railway, Render, Heroku
- **Database:** MongoDB Atlas, DigitalOcean Managed MongoDB

### Option 2: Virtual Private Server (VPS)

**Pros:** Full control, cost-effective for medium traffic
**Cons:** Manual setup, requires DevOps knowledge

**Recommended Providers:**
- DigitalOcean
- Linode
- Vultr
- AWS EC2 (if familiar with AWS)

### Option 3: Container Orchestration

**Pros:** Scalable, portable, industry standard
**Cons:** Complex setup, steep learning curve

**Platforms:**
- Kubernetes (AWS EKS, Google GKE, DigitalOcean Kubernetes)
- Docker Swarm
- Nomad

### Option 4: Serverless

**Pros:** Pay-per-use, auto-scaling, zero server management
**Cons:** Cold starts, vendor lock-in, limited for WebSocket

**Platforms:**
- AWS Lambda + API Gateway
- Google Cloud Functions
- Cloudflare Workers

**Note:** WebSocket support is limited in serverless environments.

---

## Database Deployment

### MongoDB Atlas (Recommended)

MongoDB Atlas is a fully managed MongoDB hosting service.

#### 1. Create Cluster

1. Sign up at https://www.mongodb.com/cloud/atlas
2. Create a new cluster (Free tier available)
3. Choose cloud provider and region (closest to your backend)
4. Wait for cluster creation (5-10 minutes)

#### 2. Configure Security

**Network Access:**
```
1. Go to Network Access
2. Add IP Address
3. Choose "Allow Access from Anywhere" (0.0.0.0/0) for development
   OR add specific IP addresses for production
```

**Database Users:**
```
1. Go to Database Access
2. Add New Database User
3. Choose Password authentication
4. Set username and strong password
5. Assign "Read and write to any database" role
```

#### 3. Get Connection String

```
1. Click "Connect" on your cluster
2. Choose "Connect your application"
3. Select Driver: Python, Version: 3.12 or later
4. Copy connection string
5. Replace <password> with your actual password
```

Example:
```
mongodb+srv://unichat_user:<password>@cluster0.xxxxx.mongodb.net/unichat?retryWrites=true&w=majority
```

#### 4. Setup Indexes

```bash
# On your local machine
export MONGO_URI="mongodb+srv://..."
cd backend
source venv/bin/activate
python scripts/setup_indexes.py
```

### Self-Hosted MongoDB

If you prefer self-hosting:

#### On Ubuntu Server

```bash
# Import MongoDB public key
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -

# Create list file
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list

# Update and install
sudo apt-get update
sudo apt-get install -y mongodb-org

# Start and enable
sudo systemctl start mongod
sudo systemctl enable mongod

# Secure MongoDB
sudo mongo
> use admin
> db.createUser({
    user: "adminUser",
    pwd: "StrongPassword123!",
    roles: [ { role: "userAdminAnyDatabase", db: "admin" } ]
  })
> exit

# Enable authentication
sudo nano /etc/mongod.conf
# Add:
# security:
#   authorization: enabled

sudo systemctl restart mongod
```

#### Configure Firewall

```bash
sudo ufw allow from YOUR_BACKEND_IP to any port 27017
```

---

## Backend Deployment

### Option 1: Railway (Recommended for Quick Deploy)

Railway offers easy deployment with automatic scaling.

#### 1. Prepare Application

Create `Procfile` in `backend/`:
```
web: python run.py
```

Create `runtime.txt`:
```
python-3.10.12
```

Update `run.py` for production:
```python
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    socketio.run(app, host='0.0.0.0', port=port, debug=False)
```

#### 2. Deploy to Railway

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Initialize project
cd backend
railway init

# Add environment variables
railway variables set SECRET_KEY="your-secret"
railway variables set JWT_SECRET_KEY="your-jwt-secret"
railway variables set OPENROUTER_API_KEY="your-api-key"
railway variables set MONGO_URI="your-mongodb-uri"

# Deploy
railway up
```

#### 3. Configure Domain

```
1. Go to Railway dashboard
2. Click on your service
3. Go to Settings → Domains
4. Add custom domain or use Railway subdomain
```

### Option 2: DigitalOcean App Platform

#### 1. Create App

```bash
# Install doctl
brew install doctl  # macOS
# OR
snap install doctl  # Linux

# Authenticate
doctl auth init

# Create app from GitHub
doctl apps create --spec .do/app.yaml
```

Create `.do/app.yaml`:
```yaml
name: unichat-backend
services:
- name: api
  github:
    repo: yourusername/uni-chat
    branch: main
    deploy_on_push: true
  source_dir: backend
  environment_slug: python
  run_command: python run.py
  http_port: 5000
  envs:
  - key: SECRET_KEY
    value: ${SECRET_KEY}
  - key: JWT_SECRET_KEY
    value: ${JWT_SECRET_KEY}
  - key: OPENROUTER_API_KEY
    value: ${OPENROUTER_API_KEY}
  - key: MONGO_URI
    value: ${MONGO_URI}
  instance_size_slug: basic-xxs
  instance_count: 1
```

### Option 3: VPS (Ubuntu 22.04)

#### 1. Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Python
sudo apt install -y python3.10 python3.10-venv python3-pip

# Install Nginx
sudo apt install -y nginx

# Install Supervisor (process manager)
sudo apt install -y supervisor

# Create app user
sudo useradd -m -s /bin/bash unichat
sudo su - unichat
```

#### 2. Deploy Application

```bash
# Clone repository
git clone https://github.com/yourusername/uni-chat.git
cd uni-chat/backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
pip install gunicorn eventlet

# Setup environment
cp .env.example .env
nano .env  # Edit with production values
```

#### 3. Configure Gunicorn

Create `/home/unichat/uni-chat/backend/gunicorn_config.py`:
```python
import os

bind = '127.0.0.1:5000'
workers = 4
worker_class = 'eventlet'
worker_connections = 1000
timeout = 120
keepalive = 5

accesslog = '/home/unichat/logs/gunicorn_access.log'
errorlog = '/home/unichat/logs/gunicorn_error.log'
loglevel = 'info'

# For production
daemon = False
```

#### 4. Configure Supervisor

Create `/etc/supervisor/conf.d/unichat.conf`:
```ini
[program:unichat]
command=/home/unichat/uni-chat/backend/venv/bin/gunicorn -c gunicorn_config.py "app:create_app()"
directory=/home/unichat/uni-chat/backend
user=unichat
autostart=true
autorestart=true
stopasgroup=true
killasgroup=true
stderr_logfile=/home/unichat/logs/unichat.err.log
stdout_logfile=/home/unichat/logs/unichat.out.log
```

```bash
# Create logs directory
sudo mkdir -p /home/unichat/logs
sudo chown unichat:unichat /home/unichat/logs

# Start service
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl start unichat
```

#### 5. Configure Nginx

Create `/etc/nginx/sites-available/unichat`:
```nginx
upstream backend {
    server 127.0.0.1:5000;
}

server {
    listen 80;
    server_name api.yourdomain.com;

    client_max_body_size 16M;

    location / {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_connect_timeout 120s;
    }

    location /socket.io {
        proxy_pass http://backend/socket.io;
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 120s;
        proxy_connect_timeout 120s;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/unichat /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## Frontend Deployment

### Option 1: Vercel (Recommended)

Vercel offers excellent React hosting with automatic deployments.

#### 1. Prepare Application

Update `frontend/.env.production`:
```bash
VITE_API_URL=https://api.yourdomain.com
VITE_WS_URL=wss://api.yourdomain.com
```

Create `vercel.json` in `frontend/`:
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

#### 2. Deploy

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
cd frontend
vercel

# Deploy to production
vercel --prod
```

#### 3. Configure Domain

```
1. Go to Vercel dashboard
2. Select your project
3. Go to Settings → Domains
4. Add your custom domain
5. Follow DNS configuration instructions
```

### Option 2: Netlify

#### 1. Prepare Application

Create `netlify.toml` in `frontend/`:
```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[build.environment]
  NODE_VERSION = "18"
```

#### 2. Deploy

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login
netlify login

# Deploy
cd frontend
netlify deploy

# Deploy to production
netlify deploy --prod
```

### Option 3: Nginx (VPS)

#### 1. Build Application

```bash
cd frontend
npm run build
# Build output in dist/
```

#### 2. Configure Nginx

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    root /var/www/unichat/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Enable gzip compression
    gzip on;
    gzip_vary on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

#### 3. Deploy Files

```bash
# Copy build files
sudo mkdir -p /var/www/unichat
sudo cp -r dist/* /var/www/unichat/
sudo chown -R www-data:www-data /var/www/unichat

# Enable site
sudo ln -s /etc/nginx/sites-available/unichat-frontend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## Environment Configuration

### Production Environment Variables

#### Backend

**Required:**
```bash
# Security
SECRET_KEY=<64-char-random-hex>
JWT_SECRET_KEY=<64-char-random-hex>

# Database
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/unichat

# OpenRouter
OPENROUTER_API_KEY=sk-or-...

# Admin
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=<strong-password>

# Environment
FLASK_ENV=production
FLASK_DEBUG=0

# CORS
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Uploads
MAX_UPLOAD_SIZE=16

# Rate Limiting
RATE_LIMIT_ENABLED=true
```

**Optional:**
```bash
# Monitoring
SENTRY_DSN=https://...
LOG_LEVEL=INFO

# Email (future)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@yourdomain.com
SMTP_PASSWORD=<app-password>
```

#### Frontend

```bash
VITE_API_URL=https://api.yourdomain.com
VITE_WS_URL=wss://api.yourdomain.com
VITE_APP_NAME=Uni-Chat
VITE_ENABLE_IMAGE_GENERATION=true
VITE_ENABLE_ARENA=true
```

### Generating Secure Secrets

```bash
# Python (for SECRET_KEY, JWT_SECRET_KEY)
python3 -c "import secrets; print(secrets.token_hex(32))"

# OpenSSL
openssl rand -hex 32

# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Security Hardening

### 1. SSL/TLS Certificate

#### Using Certbot (Let's Encrypt - Free)

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com -d api.yourdomain.com

# Auto-renewal
sudo certbot renew --dry-run
```

Certbot automatically updates Nginx configuration.

### 2. Firewall Configuration

```bash
# Enable UFW
sudo ufw enable

# Allow SSH
sudo ufw allow 22/tcp

# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Check status
sudo ufw status
```

### 3. Security Headers

Update Nginx configuration:

```nginx
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://api.yourdomain.com wss://api.yourdomain.com;" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

### 4. Rate Limiting (Nginx)

```nginx
# In nginx.conf http block
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

# In server block
location /api/ {
    limit_req zone=api burst=20 nodelay;
    proxy_pass http://backend;
}
```

### 5. MongoDB Security

```javascript
// Create app-specific user
use unichat
db.createUser({
  user: "unichat_app",
  pwd: "StrongPassword123!",
  roles: [
    { role: "readWrite", db: "unichat" }
  ]
})

// Connection string with user:
mongodb://unichat_app:StrongPassword123!@localhost:27017/unichat
```

### 6. Environment Variables Security

**Never commit `.env` files:**
```bash
# Ensure .gitignore includes:
.env
.env.local
.env.production
```

**Use secrets management:**
- Railway: Built-in environment variables
- AWS: AWS Secrets Manager
- Kubernetes: Kubernetes Secrets
- HashiCorp Vault (enterprise)

### 7. Dependency Security

```bash
# Backend: Check for vulnerabilities
pip-audit

# Frontend: Check for vulnerabilities
npm audit
npm audit fix
```

---

## SSL/TLS Setup

### Cloudflare (Recommended)

Cloudflare provides free SSL and DDoS protection.

#### 1. Add Site to Cloudflare

1. Sign up at https://cloudflare.com
2. Add your domain
3. Update nameservers at your domain registrar
4. Wait for activation (up to 24 hours)

#### 2. Configure SSL

```
1. Go to SSL/TLS
2. Choose "Full (strict)" mode
3. Enable "Always Use HTTPS"
4. Enable "Automatic HTTPS Rewrites"
```

#### 3. Configure DNS

```
Type  Name    Content                Proxy  TTL
A     @       YOUR_SERVER_IP         Yes    Auto
A     www     YOUR_SERVER_IP         Yes    Auto
A     api     YOUR_BACKEND_IP        Yes    Auto
```

#### 4. Page Rules (Optional)

Create page rules for optimization:
- Cache Everything for static assets
- Always Use HTTPS

### Without Cloudflare

Use Let's Encrypt with Certbot (see [Security Hardening](#1-ssltls-certificate)).

---

## Monitoring and Logging

### Application Monitoring

#### Sentry (Error Tracking)

**Backend:**
```bash
pip install sentry-sdk[flask]
```

```python
# app/__init__.py
import sentry_sdk
from sentry_sdk.integrations.flask import FlaskIntegration

sentry_sdk.init(
    dsn=os.environ.get('SENTRY_DSN'),
    integrations=[FlaskIntegration()],
    traces_sample_rate=0.1,
    environment='production'
)
```

**Frontend:**
```bash
npm install @sentry/react @sentry/tracing
```

```javascript
// main.jsx
import * as Sentry from "@sentry/react"

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  integrations: [new Sentry.BrowserTracing()],
  tracesSampleRate: 0.1,
  environment: 'production'
})
```

### Infrastructure Monitoring

#### Uptime Monitoring

**Services:**
- UptimeRobot (free)
- Pingdom
- StatusCake

**Setup:**
1. Sign up for service
2. Add monitors for:
   - Frontend: https://yourdomain.com
   - Backend: https://api.yourdomain.com/api/health
3. Configure alerts (email, SMS, Slack)

#### Server Monitoring (VPS)

**Netdata (Real-time):**
```bash
bash <(curl -Ss https://my-netdata.io/kickstart.sh)
```

Access at `http://your-server-ip:19999`

**Prometheus + Grafana (Advanced):**
```bash
# Install Prometheus
# Install Grafana
# Configure dashboards
```

### Log Management

#### Centralized Logging

**LogDNA/Mezmo:**
```bash
# Install agent
echo "deb https://repo.logdna.com stable main" | sudo tee /etc/apt/sources.list.d/logdna.list
wget -O- https://repo.logdna.com/logdna.gpg | sudo apt-key add -
sudo apt-get update
sudo apt-get install logdna-agent

# Configure
sudo logdna-agent -k YOUR_INGESTION_KEY
sudo logdna-agent -d /var/log
sudo logdna-agent -t production

# Start
sudo systemctl start logdna-agent
```

#### Application Logging

**Backend (Python):**
```python
import logging
from logging.handlers import RotatingFileHandler

# Configure logging
handler = RotatingFileHandler(
    'logs/app.log',
    maxBytes=10000000,
    backupCount=10
)
handler.setFormatter(logging.Formatter(
    '[%(asctime)s] %(levelname)s in %(module)s: %(message)s'
))
app.logger.addHandler(handler)
app.logger.setLevel(logging.INFO)
```

### Database Monitoring

**MongoDB Atlas:**
- Built-in monitoring dashboard
- Real-time metrics
- Performance advisor
- Alerts

**Self-hosted:**
```bash
# Enable MongoDB profiling
mongo
> use unichat
> db.setProfilingLevel(1, { slowms: 100 })

# View slow queries
> db.system.profile.find().sort({ts: -1}).limit(5)
```

---

## Backup and Recovery

### Database Backup

#### Automated Backups (MongoDB Atlas)

```
1. Go to cluster
2. Click "Backup" tab
3. Enable "Continuous Backup"
4. Configure retention policy
5. Schedule automatic backups
```

#### Manual Backups (Self-hosted)

**Backup Script:**
```bash
#!/bin/bash
# backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/mongodb"
DB_NAME="unichat"

# Create backup directory
mkdir -p $BACKUP_DIR

# Dump database
mongodump --db=$DB_NAME --out=$BACKUP_DIR/$DATE

# Compress
tar -czf $BACKUP_DIR/unichat_$DATE.tar.gz -C $BACKUP_DIR $DATE
rm -rf $BACKUP_DIR/$DATE

# Delete backups older than 30 days
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete

echo "Backup completed: $BACKUP_DIR/unichat_$DATE.tar.gz"
```

**Automate with Cron:**
```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * /home/unichat/backup.sh >> /home/unichat/logs/backup.log 2>&1
```

#### Restore Database

```bash
# Extract backup
tar -xzf unichat_20240115_020000.tar.gz

# Restore
mongorestore --db=unichat ./20240115_020000/unichat

# Or with authentication
mongorestore --db=unichat --username=admin --password=pass --authenticationDatabase=admin ./20240115_020000/unichat
```

### Application Backup

```bash
# Backup uploaded files
tar -czf uploads_backup_$(date +%Y%m%d).tar.gz /home/unichat/uni-chat/backend/uploads

# Backup environment files (store securely!)
cp /home/unichat/uni-chat/backend/.env /secure/location/.env.backup
```

### Disaster Recovery Plan

1. **Regular Backups:**
   - Database: Daily automated backups
   - Files: Weekly backups
   - Configuration: On every change

2. **Backup Storage:**
   - Primary: Local server
   - Secondary: Cloud storage (S3, Backblaze B2)
   - Off-site: Different geographic location

3. **Recovery Testing:**
   - Test restore procedure monthly
   - Document recovery steps
   - Measure RTO (Recovery Time Objective)

4. **Incident Response:**
   - Have runbook ready
   - Contact list for team
   - Communication plan for users

---

## Scaling

### Vertical Scaling

**Increase server resources:**
- More CPU cores
- More RAM
- Faster disk (SSD)

**When to scale vertically:**
- Single bottleneck (CPU or RAM)
- Quick fix needed
- Before horizontal scaling

### Horizontal Scaling

#### Load Balancer Setup (Nginx)

```nginx
upstream backend_cluster {
    least_conn;  # Load balancing method
    server backend1.yourdomain.com:5000;
    server backend2.yourdomain.com:5000;
    server backend3.yourdomain.com:5000;
}

server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://backend_cluster;
        # ... other proxy settings
    }
}
```

#### Session Management

**Issue:** WebSocket sticky sessions

**Solution 1: IP Hash (Nginx)**
```nginx
upstream backend_cluster {
    ip_hash;  # Same client → same backend
    server backend1:5000;
    server backend2:5000;
}
```

**Solution 2: Redis Session Store (Future)**
```python
# Use Redis for session storage
# All backends share same session data
```

### Database Scaling

#### Read Replicas

```javascript
// MongoDB replica set
rs.initiate({
  _id: "rs0",
  members: [
    { _id: 0, host: "mongodb0.yourdomain.com:27017" },
    { _id: 1, host: "mongodb1.yourdomain.com:27017" },
    { _id: 2, host: "mongodb2.yourdomain.com:27017" }
  ]
})
```

#### Sharding (For Very Large Datasets)

```javascript
// Enable sharding on database
sh.enableSharding("unichat")

// Shard collection
sh.shardCollection("unichat.messages", { "conversation_id": 1 })
```

### Caching Layer

**Redis for Caching:**
```bash
# Install Redis
sudo apt install redis-server

# Configure
sudo nano /etc/redis/redis.conf
# Set maxmemory-policy: allkeys-lru
```

**Backend Integration:**
```python
import redis
from functools import wraps

cache = redis.Redis(host='localhost', port=6379, db=0)

def cached(ttl=300):
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            key = f"cache:{f.__name__}:{str(args)}:{str(kwargs)}"
            cached_value = cache.get(key)
            if cached_value:
                return json.loads(cached_value)
            result = f(*args, **kwargs)
            cache.setex(key, ttl, json.dumps(result))
            return result
        return wrapper
    return decorator

@cached(ttl=3600)
def get_models():
    # Expensive operation
    return OpenRouterService.get_available_models()
```

### CDN for Static Assets

**Cloudflare CDN:**
- Already included with Cloudflare DNS
- Automatic caching of static assets
- Global distribution

**AWS CloudFront:**
```
1. Create CloudFront distribution
2. Origin: S3 bucket with static assets
3. Update frontend to use CDN URLs
```

---

## CI/CD Pipeline

### GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches:
      - main

jobs:
  test-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.10'
      - name: Install dependencies
        run: |
          cd backend
          pip install -r requirements.txt
      - name: Run tests
        run: |
          cd backend
          pytest

  test-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Set up Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Install dependencies
        run: |
          cd frontend
          npm ci
      - name: Run linter
        run: |
          cd frontend
          npm run lint
      - name: Build
        run: |
          cd frontend
          npm run build

  deploy-backend:
    needs: [test-backend, test-frontend]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to Railway
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
        run: |
          npm i -g @railway/cli
          cd backend
          railway up

  deploy-frontend:
    needs: [test-backend, test-frontend]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to Vercel
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
        run: |
          npm i -g vercel
          cd frontend
          vercel --prod --token=$VERCEL_TOKEN
```

### Deployment Rollback

**Railway:**
```bash
# List deployments
railway status

# Rollback to previous
railway rollback
```

**Vercel:**
```bash
# List deployments
vercel ls

# Promote specific deployment
vercel promote <deployment-url>
```

---

## Troubleshooting

### Common Production Issues

#### 1. 502 Bad Gateway

**Causes:**
- Backend not running
- Backend crashed
- Port mismatch

**Debug:**
```bash
# Check if backend is running
sudo supervisorctl status unichat

# Check logs
sudo tail -f /home/unichat/logs/unichat.err.log

# Check port
sudo netstat -tlnp | grep :5000
```

#### 2. WebSocket Connection Failed

**Causes:**
- Nginx not configured for WebSocket
- CORS issues
- SSL/WSS mismatch

**Debug:**
```bash
# Check Nginx configuration
sudo nginx -t

# Check backend logs
# Look for WebSocket handshake errors
```

**Fix:** Ensure Nginx has WebSocket upgrade headers (see Nginx config above)

#### 3. Database Connection Timeout

**Causes:**
- Firewall blocking MongoDB port
- Wrong connection string
- MongoDB Atlas IP whitelist

**Debug:**
```bash
# Test connection
mongosh "mongodb+srv://..."

# Check firewall
sudo ufw status

# For MongoDB Atlas, add current IP to whitelist
```

#### 4. High Memory Usage

**Causes:**
- Memory leak
- Too many concurrent connections
- Large file uploads

**Debug:**
```bash
# Check memory usage
free -h
htop

# Check process memory
ps aux --sort=-%mem | head

# Check Gunicorn workers
ps aux | grep gunicorn
```

**Fix:**
- Restart application
- Reduce number of workers
- Implement connection pooling
- Add memory limit in Gunicorn config

#### 5. Slow Response Times

**Causes:**
- Database not indexed
- N+1 query problem
- External API slowness (OpenRouter)

**Debug:**
```bash
# Check MongoDB slow queries
mongo
> db.setProfilingLevel(1, { slowms: 100 })
> db.system.profile.find().sort({ts: -1}).limit(5).pretty()

# Check application logs for timing
```

**Fix:**
- Add database indexes
- Implement caching
- Optimize queries
- Use CDN for static assets

### Monitoring Commands

```bash
# System resources
htop
df -h
free -h

# Network
netstat -tlnp
ss -tlnp

# Logs
tail -f /var/log/nginx/error.log
tail -f /home/unichat/logs/unichat.err.log
journalctl -u mongod -f

# Processes
ps aux | grep unichat
supervisorctl status
```

---

## Post-Deployment

### Final Checklist

- [ ] All services running and healthy
- [ ] SSL certificate valid and auto-renewing
- [ ] Monitoring and alerts configured
- [ ] Backups running successfully
- [ ] Load testing completed
- [ ] Security scan completed
- [ ] Documentation updated
- [ ] Team trained on operations
- [ ] Runbook created for common issues

### Maintenance Schedule

**Daily:**
- Check error logs
- Monitor uptime
- Review performance metrics

**Weekly:**
- Update dependencies (if needed)
- Review security advisories
- Check backup integrity

**Monthly:**
- Test disaster recovery
- Review and optimize costs
- Update documentation
- Security audit

**Quarterly:**
- Performance optimization review
- Capacity planning
- User feedback review
- Technology stack review

---

## Conclusion

You now have a comprehensive guide to deploying Uni-Chat in production. Remember:

1. **Start simple:** Use PaaS solutions (Railway, Vercel) for quick deployment
2. **Monitor everything:** Set up monitoring before you need it
3. **Automate backups:** Data loss is not an option
4. **Plan for scale:** Design with future growth in mind
5. **Document everything:** Your future self will thank you

For questions or issues, refer to:
- [Setup Guide](./SETUP.md)
- [API Documentation](./API.md)
- [Architecture Documentation](./ARCHITECTURE.md)

Happy deploying!
