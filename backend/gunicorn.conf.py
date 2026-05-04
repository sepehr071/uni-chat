import os, multiprocessing

worker_class = "gthread"  # required for SSE
workers = int(os.environ.get('GUNICORN_WORKERS', '4'))
threads = int(os.environ.get('GUNICORN_THREADS', '16'))
bind = f"{os.environ.get('BACKEND_BIND_HOST', '0.0.0.0')}:{os.environ.get('BACKEND_PORT', '5000')}"
accesslog = "-"
errorlog = "-"
loglevel = os.environ.get('GUNICORN_LOG_LEVEL', 'info')
timeout = 120
graceful_timeout = 30
keepalive = 5
proc_name = "unichat"
limit_request_line = 4094
limit_request_fields = 100
limit_request_field_size = 8190
daemon = False
pidfile = None
umask = 0o027
user = None
group = None
tmp_upload_dir = None
keyfile = None
certfile = None
