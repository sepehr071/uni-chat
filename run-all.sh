#!/usr/bin/env bash
# uni-chat Ubuntu launcher — runs the stack under PM2.
#
# Usage:
#   ./run-all.sh                    # interactive menu (full/minimal)
#   ./run-all.sh --mode full        # backend + frontend + bot + scheduler
#   ./run-all.sh --mode minimal     # backend + frontend only
#   ./run-all.sh --skip-install     # skip the apt/npm/uv install step
#   ./run-all.sh --stop             # stop + delete all unichat-* PM2 apps
#   ./run-all.sh --status           # pm2 status filtered to unichat-*
#
# Picks free ports, syncs them across backend/bot/scheduler/frontend, then
# starts every service under PM2 with autorestart. Re-run any time — the
# script is idempotent (PM2 apps with the same name are reloaded, not
# duplicated; sed patches use placeholders so they don't drift).

set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "${ROOT}"

MODE=""
SKIP_INSTALL=0
STOP=0
STATUS=0

while [[ $# -gt 0 ]]; do
    case "$1" in
        --mode) MODE="${2:-}"; shift 2 ;;
        --mode=*) MODE="${1#*=}"; shift ;;
        --skip-install) SKIP_INSTALL=1; shift ;;
        --stop) STOP=1; shift ;;
        --status) STATUS=1; shift ;;
        -h|--help)
            sed -n '2,15p' "$0"; exit 0 ;;
        *)
            echo "[!] Unknown arg: $1" >&2; exit 2 ;;
    esac
done

log()  { printf '\033[1;36m[run-all]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m[ ok ]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[err ]\033[0m %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Stop / status short-circuits
# ---------------------------------------------------------------------------
pm2_apps=(unichat-backend unichat-frontend unichat-bot unichat-scheduler)

if [[ ${STOP} -eq 1 ]]; then
    command -v pm2 >/dev/null 2>&1 || die "pm2 is not installed."
    for app in "${pm2_apps[@]}"; do
        pm2 delete "${app}" >/dev/null 2>&1 || true
    done
    pm2 save >/dev/null 2>&1 || true
    ok "Stopped all unichat-* PM2 apps."
    exit 0
fi

if [[ ${STATUS} -eq 1 ]]; then
    command -v pm2 >/dev/null 2>&1 || die "pm2 is not installed."
    pm2 status | awk 'NR==1 || /unichat-/'
    exit 0
fi

# ---------------------------------------------------------------------------
# Sanity
# ---------------------------------------------------------------------------
[[ -d backend && -d frontend && -d bot && -d scheduler ]] \
    || die "Run from repo root. Missing one of: backend/ frontend/ bot/ scheduler/."

if [[ -r /etc/os-release ]]; then
    . /etc/os-release
    case "${ID:-}" in
        ubuntu|debian) ;;
        *) warn "Tested on Ubuntu/Debian; detected: ${ID:-unknown}. Continuing anyway." ;;
    esac
fi

# ---------------------------------------------------------------------------
# Mode menu
# ---------------------------------------------------------------------------
if [[ -z "${MODE}" ]]; then
    echo
    echo "== uni-chat Ubuntu launcher =="
    echo
    echo "  [1] Full stack    - backend + frontend + bot + scheduler"
    echo "  [2] Minimal       - backend + frontend only (no bot, no scheduler)"
    echo
    while :; do
        read -rp "Enter 1 or 2: " choice
        case "${choice}" in
            1) MODE=full;    break ;;
            2) MODE=minimal; break ;;
            *) echo "Invalid choice." ;;
        esac
    done
fi
[[ "${MODE}" == "full" || "${MODE}" == "minimal" ]] || die "Bad mode: ${MODE}"
log "Mode: ${MODE}"

# ---------------------------------------------------------------------------
# Dependency install (apt, node, uv, pm2, mongodb)
# ---------------------------------------------------------------------------
SUDO=""
if [[ ${EUID} -ne 0 ]]; then
    command -v sudo >/dev/null 2>&1 && SUDO=sudo || warn "No sudo; apt steps will be skipped."
fi

apt_install() {
    local pkgs=("$@")
    [[ -n "${SUDO}" || ${EUID} -eq 0 ]] || { warn "Skipping apt install (no sudo): ${pkgs[*]}"; return 0; }
    DEBIAN_FRONTEND=noninteractive ${SUDO} apt-get install -y "${pkgs[@]}"
}

install_prereqs() {
    log "Installing prerequisites..."
    if [[ -n "${SUDO}" || ${EUID} -eq 0 ]]; then
        ${SUDO} apt-get update -y
        apt_install ca-certificates curl gnupg git build-essential \
                    software-properties-common lsb-release jq iproute2
    fi

    # Python 3.12 (deadsnakes on 22.04, native on 24.04+)
    if ! command -v python3.12 >/dev/null 2>&1; then
        if [[ -n "${SUDO}" || ${EUID} -eq 0 ]]; then
            if [[ "${ID:-}" == "ubuntu" && "${VERSION_ID%%.*}" == "22" ]]; then
                ${SUDO} add-apt-repository -y ppa:deadsnakes/ppa
                ${SUDO} apt-get update -y
            fi
            apt_install python3.12 python3.12-venv python3.12-dev
        else
            warn "python3.12 missing and no sudo; uv venv may fail."
        fi
    else
        apt_install python3.12-venv python3.12-dev || true
    fi

    # Node 20+
    if ! command -v node >/dev/null 2>&1 || [[ "$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/')" -lt 20 ]]; then
        if [[ -n "${SUDO}" || ${EUID} -eq 0 ]]; then
            log "Installing Node.js 20 via NodeSource..."
            curl -fsSL https://deb.nodesource.com/setup_20.x | ${SUDO} bash -
            apt_install nodejs
        else
            warn "Node 20+ missing and no sudo."
        fi
    fi

    # uv
    if ! command -v uv >/dev/null 2>&1; then
        log "Installing uv..."
        curl -LsSf https://astral.sh/uv/install.sh | sh
        export PATH="${HOME}/.local/bin:${HOME}/.cargo/bin:${PATH}"
        command -v uv >/dev/null 2>&1 || die "uv install failed."
    fi

    # PM2
    if ! command -v pm2 >/dev/null 2>&1; then
        log "Installing PM2 (global npm)..."
        if [[ -n "${SUDO}" || ${EUID} -eq 0 ]]; then
            ${SUDO} npm install -g pm2
        else
            npm install -g pm2 || die "pm2 install failed (no sudo, no npm prefix)."
        fi
    fi

    # MongoDB (local)
    if ! command -v mongod >/dev/null 2>&1; then
        if [[ -n "${SUDO}" || ${EUID} -eq 0 ]]; then
            log "Installing MongoDB 7.0..."
            curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc \
                | ${SUDO} gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg
            local codename
            codename="$(lsb_release -cs 2>/dev/null || echo jammy)"
            case "${codename}" in jammy|focal) ;; *) codename=jammy ;; esac
            echo "deb [arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg] https://repo.mongodb.org/apt/${ID:-ubuntu} ${codename}/mongodb-org/7.0 multiverse" \
                | ${SUDO} tee /etc/apt/sources.list.d/mongodb-org-7.0.list >/dev/null
            ${SUDO} apt-get update -y
            apt_install mongodb-org
            ${SUDO} systemctl enable --now mongod
        else
            warn "mongod missing and no sudo. Point MONGO_URI at a remote cluster or install manually."
        fi
    fi

    # Per-service venvs
    log "Backend venv..."
    ( cd backend && [[ -d .venv-uv ]] || uv venv .venv-uv --python 3.12 )
    ( cd backend && uv pip install -r requirements.txt -p .venv-uv/bin/python )

    if [[ "${MODE}" == "full" ]]; then
        log "Bot venv..."
        ( cd bot && [[ -d .venv-uv ]] || uv venv .venv-uv --python 3.12 )
        ( cd bot && uv pip install -e . -e ../backend -r ../backend/requirements.txt -p .venv-uv/bin/python )

        log "Scheduler venv..."
        ( cd scheduler && [[ -d .venv-uv ]] || uv venv .venv-uv --python 3.12 )
        ( cd scheduler && uv pip install -e . -e ../backend -r ../backend/requirements.txt -p .venv-uv/bin/python )
        ( cd scheduler && uv pip install "setuptools<81" -p .venv-uv/bin/python )
    fi

    log "Frontend npm deps..."
    ( cd frontend && npm install --no-audit --no-fund )
}

if [[ ${SKIP_INSTALL} -eq 0 ]]; then
    install_prereqs
else
    log "Skipping install (--skip-install)."
fi

# MongoDB up?
if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files 2>/dev/null | grep -q '^mongod\.service'; then
    if ! systemctl is-active --quiet mongod; then
        log "Starting mongod..."
        ${SUDO} systemctl start mongod || warn "Failed to start mongod."
    fi
fi

# ---------------------------------------------------------------------------
# Port scan — pick free ports starting at defaults
# ---------------------------------------------------------------------------
port_in_use() {
    local p="$1"
    if command -v ss >/dev/null 2>&1; then
        ss -tlnH 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]${p}\$"
    else
        (echo >/dev/tcp/127.0.0.1/"${p}") >/dev/null 2>&1
    fi
}

find_free_port() {
    local start="$1" max=$((start + 200)) p
    for (( p=start; p<max; p++ )); do
        port_in_use "${p}" || { echo "${p}"; return 0; }
    done
    die "No free port in range ${start}-${max}."
}

BACKEND_PORT="$(find_free_port 5000)"
FRONTEND_PORT="$(find_free_port 3000)"
SCHEDULER_PORT=""
BOT_PORT=""
if [[ "${MODE}" == "full" ]]; then
    SCHEDULER_PORT="$(find_free_port 8082)"
    BOT_PORT="$(find_free_port 8081)"
fi

log "Ports: backend=${BACKEND_PORT} frontend=${FRONTEND_PORT}${SCHEDULER_PORT:+ scheduler=${SCHEDULER_PORT}}${BOT_PORT:+ bot=${BOT_PORT}}"

# ---------------------------------------------------------------------------
# Sync ports into .env files (create from .env.example if missing)
# ---------------------------------------------------------------------------
ensure_env() {
    local dir="$1"
    if [[ ! -f "${dir}/.env" ]]; then
        if [[ -f "${dir}/.env.example" ]]; then
            cp "${dir}/.env.example" "${dir}/.env"
            warn "Created ${dir}/.env from .env.example — fill in secrets before relying on it."
        else
            : > "${dir}/.env"
            warn "Created empty ${dir}/.env (no example present)."
        fi
    fi
}

# upsert KEY=VAL in a .env file
upsert_env() {
    local file="$1" key="$2" val="$3"
    if grep -Eq "^${key}=" "${file}"; then
        # Use ~ as sed delimiter (val may contain :// etc.)
        sed -i.bak -E "s~^${key}=.*\$~${key}=${val}~" "${file}"
    else
        printf '%s=%s\n' "${key}" "${val}" >> "${file}"
    fi
    rm -f "${file}.bak"
}

ensure_env backend
upsert_env backend/.env BACKEND_PORT       "${BACKEND_PORT}"
upsert_env backend/.env PORT               "${BACKEND_PORT}"
upsert_env backend/.env FLASK_RUN_HOST     "0.0.0.0"
upsert_env backend/.env CORS_ORIGINS       "http://localhost:${FRONTEND_PORT},http://127.0.0.1:${FRONTEND_PORT}"
if [[ "${MODE}" == "full" && -n "${SCHEDULER_PORT}" ]]; then
    upsert_env backend/.env SCHEDULER_BASE_URL "http://127.0.0.1:${SCHEDULER_PORT}"
fi

if [[ "${MODE}" == "full" ]]; then
    ensure_env scheduler
    upsert_env scheduler/.env RELOAD_PORT  "${SCHEDULER_PORT}"

    ensure_env bot
    upsert_env bot/.env BOT_PORT           "${BOT_PORT}"
    upsert_env bot/.env POLLING            "1"
fi

# ---------------------------------------------------------------------------
# Vite proxy sync — vite.config.js hardcodes the backend target + frontend port.
# Rewrite via sed so dev mode proxies /api + /socket.io to the chosen ports.
# Backup the pristine config once into .vite.config.js.original.
# ---------------------------------------------------------------------------
VITE_CFG="frontend/vite.config.js"
if [[ -f "${VITE_CFG}" ]]; then
    [[ -f "${VITE_CFG}.original" ]] || cp "${VITE_CFG}" "${VITE_CFG}.original"
    sed -i -E \
        -e "s~port:[[:space:]]*[0-9]+,~port: ${FRONTEND_PORT},~" \
        -e "s~target:[[:space:]]*'http://localhost:[0-9]+'~target: 'http://localhost:${BACKEND_PORT}'~g" \
        "${VITE_CFG}"
else
    warn "frontend/vite.config.js not found — skipping proxy sync."
fi

# ---------------------------------------------------------------------------
# Start services under PM2
# ---------------------------------------------------------------------------
BACKEND_PY="${ROOT}/backend/.venv-uv/bin/python"
[[ -x "${BACKEND_PY}" ]] || die "Backend venv missing python at ${BACKEND_PY}. Re-run without --skip-install."

pm2_replace() {
    local name="$1"; shift
    pm2 delete "${name}" >/dev/null 2>&1 || true
    pm2 start "$@" --name "${name}" --time
}

log "Starting services under PM2..."

pm2_replace unichat-backend \
    "${BACKEND_PY}" --interpreter none --cwd "${ROOT}/backend" -- run.py

pm2_replace unichat-frontend \
    npm --cwd "${ROOT}/frontend" -- run dev -- --host 0.0.0.0 --port "${FRONTEND_PORT}"

if [[ "${MODE}" == "full" ]]; then
    BOT_PY="${ROOT}/bot/.venv-uv/bin/python"
    SCHED_PY="${ROOT}/scheduler/.venv-uv/bin/python"
    [[ -x "${BOT_PY}"   ]] || die "Bot venv missing python at ${BOT_PY}."
    [[ -x "${SCHED_PY}" ]] || die "Scheduler venv missing python at ${SCHED_PY}."

    pm2_replace unichat-bot \
        "${BOT_PY}" --interpreter none --cwd "${ROOT}/bot" -- -m bot.main
    pm2_replace unichat-scheduler \
        "${SCHED_PY}" --interpreter none --cwd "${ROOT}/scheduler" -- -m scheduler.main
else
    pm2 delete unichat-bot       >/dev/null 2>&1 || true
    pm2 delete unichat-scheduler >/dev/null 2>&1 || true
fi

pm2 save >/dev/null 2>&1 || true

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
SERVER_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
SERVER_IP="${SERVER_IP:-<server-ip>}"

cat <<EOF

============================================================
uni-chat is up under PM2 (mode: ${MODE}).

  Frontend (dev):  http://${SERVER_IP}:${FRONTEND_PORT}
  Backend API:     http://${SERVER_IP}:${BACKEND_PORT}
EOF
[[ "${MODE}" == "full" ]] && cat <<EOF
  Bot internal:    127.0.0.1:${BOT_PORT}
  Scheduler:       127.0.0.1:${SCHEDULER_PORT}
EOF
cat <<EOF

  Status:   pm2 status
  Logs:     pm2 logs unichat-backend     (or unichat-frontend / -bot / -scheduler)
  Stop:     ./run-all.sh --stop
  Reload:   ./run-all.sh --mode ${MODE} --skip-install
  Persist:  pm2 startup   (run the printed command once, then 'pm2 save')
============================================================
EOF

pm2 status | awk 'NR==1 || /unichat-/'
