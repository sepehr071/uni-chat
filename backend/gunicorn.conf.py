# Gunicorn configuration for Uni-Chat production deployment
# Usage: gunicorn --config gunicorn.conf.py wsgi:app

import multiprocessing

# Worker configuration
# gthread is REQUIRED for SSE (Server-Sent Events) streaming
worker_class = "gthread"
workers = 2
threads = 4

# Binding - Nginx will proxy to this
bind = "127.0.0.1:5000"

# Logging
accesslog = "/var/log/unichat/access.log"
errorlog = "/var/log/unichat/error.log"
loglevel = "info"

# Timeouts - longer for SSE streaming connections
timeout = 120
graceful_timeout = 30
keepalive = 5

# Process naming
proc_name = "unichat"

# Security limits
limit_request_line = 4094
limit_request_fields = 100
limit_request_field_size = 8190

# Server mechanics
daemon = False
pidfile = None
umask = 0
user = None
group = None
tmp_upload_dir = None

# SSL (handled by Nginx, not Gunicorn)
keyfile = None
certfile = None
