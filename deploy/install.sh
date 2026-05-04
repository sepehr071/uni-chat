#!/usr/bin/env bash
# uni-chat single-host installer for Ubuntu/Debian.
# Idempotent. Run twice:
#   1. ./install.sh          -> installs prereqs, creates user, builds venvs+frontend, creates env templates
#   2. ./install.sh --continue -> runs migrations, installs systemd units, starts services
set -euo pipefail

readonly REPO_ROOT="/opt/unichat"
readonly ETC_DIR="/etc/unichat"
readonly SERVICE_USER="unichat"
readonly SERVICE_GROUP="unichat"

CONTINUE=0
if [[ "${1:-}" == "--continue" ]]; then
    CONTINUE=1
fi

log()  { printf '\n[install] %s\n' "$*"; }
warn() { printf '\n[install][WARN] %s\n' "$*" >&2; }
die()  { printf '\n[install][ERROR] %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run as root (sudo ./install.sh)."

# ---------------------------------------------------------------------------
# OS detection
# ---------------------------------------------------------------------------
. /etc/os-release 2>/dev/null || die "Cannot read /etc/os-release."
case "${ID:-}" in
    ubuntu|debian) ;;
    *) die "Only Ubuntu/Debian supported. Got: ${ID:-unknown}" ;;
esac
log "Detected ${PRETTY_NAME}."

export DEBIAN_FRONTEND=noninteractive

# ---------------------------------------------------------------------------
# Phase 1: prereqs
# ---------------------------------------------------------------------------
install_prereqs() {
    log "Updating apt cache..."
    apt-get update -y

    log "Installing base packages..."
    apt-get install -y \
        ca-certificates curl gnupg git ufw build-essential \
        software-properties-common lsb-release

    # Python 3.12 (deadsnakes on 22.04, native on 24.04+)
    if ! command -v python3.12 >/dev/null 2>&1; then
        if [[ "${ID}" == "ubuntu" && "${VERSION_ID%%.*}" == "22" ]]; then
            log "Adding deadsnakes PPA for Python 3.12..."
            add-apt-repository -y ppa:deadsnakes/ppa
            apt-get update -y
        fi
        apt-get install -y python3.12 python3.12-venv python3.12-dev
    else
        apt-get install -y python3.12-venv python3.12-dev || true
    fi

    # Node.js 20.x
    if ! command -v node >/dev/null 2>&1 || [[ "$(node -v 2>/dev/null | cut -c2-3)" -lt 20 ]]; then
        log "Installing Node.js 20.x via NodeSource..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
    fi

    # MongoDB 7.0 official
    if ! command -v mongod >/dev/null 2>&1; then
        log "Installing MongoDB 7.0..."
        curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc \
            | gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg
        local codename
        codename="$(lsb_release -cs)"
        # Mongo doesn't yet publish for every Ubuntu codename; fall back to jammy.
        case "${codename}" in
            jammy|focal) ;;
            *) codename="jammy" ;;
        esac
        echo "deb [arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg] https://repo.mongodb.org/apt/${ID} ${codename}/mongodb-org/7.0 multiverse" \
            > /etc/apt/sources.list.d/mongodb-org-7.0.list
        apt-get update -y
        apt-get install -y mongodb-org
        systemctl enable --now mongod
    fi

    # uv
    if ! command -v uv >/dev/null 2>&1; then
        log "Installing uv..."
        curl -LsSf https://astral.sh/uv/install.sh | sh
        # uv installs to /root/.local/bin under sudo; symlink for all users.
        local uv_bin
        for uv_bin in /root/.local/bin/uv "${HOME}/.local/bin/uv" /root/.cargo/bin/uv; do
            if [[ -x "${uv_bin}" ]]; then
                ln -sf "${uv_bin}" /usr/local/bin/uv
                break
            fi
        done
        command -v uv >/dev/null 2>&1 || die "uv install failed."
    fi
    log "uv: $(uv --version)"
}

# ---------------------------------------------------------------------------
# Service user
# ---------------------------------------------------------------------------
ensure_user() {
    if id "${SERVICE_USER}" >/dev/null 2>&1; then
        log "User ${SERVICE_USER} exists."
    else
        log "Creating system user ${SERVICE_USER}..."
        useradd --system --create-home --home-dir "${REPO_ROOT}" --shell /bin/bash "${SERVICE_USER}"
    fi
}

# ---------------------------------------------------------------------------
# Repo verification
# ---------------------------------------------------------------------------
verify_repo() {
    [[ -d "${REPO_ROOT}/.git" ]] \
        || die "${REPO_ROOT} is not a git checkout. Clone the repo first: git clone <url> ${REPO_ROOT}"
    [[ -d "${REPO_ROOT}/backend" && -d "${REPO_ROOT}/frontend" && -d "${REPO_ROOT}/bot" && -d "${REPO_ROOT}/scheduler" ]] \
        || die "Repo at ${REPO_ROOT} is missing expected subdirs (backend/frontend/bot/scheduler)."
    chown -R "${SERVICE_USER}:${SERVICE_GROUP}" "${REPO_ROOT}"
}

# ---------------------------------------------------------------------------
# Per-service venvs
# ---------------------------------------------------------------------------
build_venvs() {
    log "Building backend venv..."
    sudo -u "${SERVICE_USER}" bash -c "cd ${REPO_ROOT}/backend && uv venv .venv-uv --python 3.12 && uv pip install -r requirements.txt"

    log "Building bot venv..."
    sudo -u "${SERVICE_USER}" bash -c "cd ${REPO_ROOT}/bot && uv venv .venv-uv --python 3.12 && uv pip install -e . -e ../backend -r ../backend/requirements.txt"

    log "Building scheduler venv..."
    sudo -u "${SERVICE_USER}" bash -c "cd ${REPO_ROOT}/scheduler && uv venv .venv-uv --python 3.12 && uv pip install -e . -e ../backend -r ../backend/requirements.txt && uv pip install 'setuptools<81'"
}

# ---------------------------------------------------------------------------
# Frontend build
# ---------------------------------------------------------------------------
build_frontend() {
    log "Building frontend..."
    sudo -u "${SERVICE_USER}" bash -c "cd ${REPO_ROOT}/frontend && npm ci && npm run build"
    [[ -f "${REPO_ROOT}/frontend/dist/index.html" ]] \
        || die "Frontend build did not produce dist/index.html."
}

# ---------------------------------------------------------------------------
# Env templates in /etc/unichat
# ---------------------------------------------------------------------------
ensure_env_files() {
    install -d -m 0750 -o "${SERVICE_USER}" -g "${SERVICE_GROUP}" "${ETC_DIR}"
    local target src
    for name in backend bot scheduler; do
        target="${ETC_DIR}/${name}.env"
        src="${REPO_ROOT}/${name}/.env.example"
        if [[ ! -f "${target}" ]]; then
            if [[ -f "${src}" ]]; then
                install -m 0600 -o "${SERVICE_USER}" -g "${SERVICE_GROUP}" "${src}" "${target}"
            else
                install -m 0600 -o "${SERVICE_USER}" -g "${SERVICE_GROUP}" /dev/null "${target}"
            fi
            log "Created template ${target}."
        fi
        chmod 0600 "${target}"
        chown "${SERVICE_USER}:${SERVICE_GROUP}" "${target}"
    done
}

env_files_filled() {
    # Heuristic: backend.env must contain SECRET_KEY=<non-empty> and MONGO_URI.
    local f="${ETC_DIR}/backend.env"
    [[ -s "${f}" ]] || return 1
    grep -Eq '^SECRET_KEY=.+' "${f}" || return 1
    grep -Eq '^JWT_SECRET_KEY=.+' "${f}" || return 1
    grep -Eq '^MONGO_URI=.+' "${f}" || return 1
    grep -Eq '^OPENROUTER_API_KEY=.+' "${f}" || return 1
    return 0
}

# ---------------------------------------------------------------------------
# Phase 2: --continue (migrations + units + start)
# ---------------------------------------------------------------------------
phase_continue() {
    env_files_filled || die "/etc/unichat/backend.env is incomplete. Required vars: SECRET_KEY, JWT_SECRET_KEY, MONGO_URI, OPENROUTER_API_KEY."

    # Source backend.env to read BACKEND_PORT.
    set -a
    # shellcheck disable=SC1091
    . "${ETC_DIR}/backend.env"
    set +a
    local port="${BACKEND_PORT:-5000}"

    log "Checking port ${port}..."
    if ss -tlnp 2>/dev/null | grep -E ":${port}\b" | grep -vq 'unichat\|gunicorn'; then
        die "Port ${port} is already bound by another process. Edit BACKEND_PORT in ${ETC_DIR}/backend.env then re-run --continue."
    fi

    log "Running migrations..."
    local py="${REPO_ROOT}/backend/.venv-uv/bin/python"
    local script
    for script in migrate_workspaces.py migrate_projects.py migrate_resource_scoping.py; do
        if [[ -f "${REPO_ROOT}/backend/scripts/${script}" ]]; then
            log "  -> ${script}"
            sudo -u "${SERVICE_USER}" "${py}" "${REPO_ROOT}/backend/scripts/${script}"
        else
            warn "Migration ${script} not found; skipping."
        fi
    done
    if [[ -f "${REPO_ROOT}/backend/scripts/setup_indexes.py" ]]; then
        log "  -> setup_indexes.py"
        sudo -u "${SERVICE_USER}" "${py}" "${REPO_ROOT}/backend/scripts/setup_indexes.py" || warn "setup_indexes.py failed; continuing."
    fi

    log "Installing systemd units..."
    install -m 0644 "${REPO_ROOT}/deploy/unichat.service"           /etc/systemd/system/unichat.service
    install -m 0644 "${REPO_ROOT}/deploy/unichat-bot.service"       /etc/systemd/system/unichat-bot.service
    install -m 0644 "${REPO_ROOT}/deploy/unichat-scheduler.service" /etc/systemd/system/unichat-scheduler.service
    systemctl daemon-reload

    log "Enabling + starting services..."
    systemctl enable --now unichat unichat-bot unichat-scheduler

    log "Configuring UFW..."
    if command -v ufw >/dev/null 2>&1; then
        if ! ufw status | grep -qE '^22(/tcp)?\s+ALLOW'; then
            warn "SSH (22/tcp) is NOT in UFW allow list. If you enable UFW now you may lock yourself out."
        fi
        ufw allow "${port}/tcp" || true
    fi

    log "Smoke test..."
    sleep 3
    if curl -fsS "http://127.0.0.1:${port}/api/health" >/dev/null; then
        log "Health check OK."
    else
        warn "Health check on http://127.0.0.1:${port}/api/health failed. Check 'journalctl -u unichat -f'."
    fi

    local server_ip
    server_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
    server_ip="${server_ip:-<server-ip>}"
    cat <<EOF

============================================================
uni-chat is up.

  Frontend + API: http://${server_ip}:${port}
  Backend logs:   journalctl -u unichat -f
  Bot logs:       journalctl -u unichat-bot -f
  Scheduler logs: journalctl -u unichat-scheduler -f

  Update:   sudo /opt/unichat/deploy/update.sh
============================================================
EOF
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
install_prereqs
ensure_user
verify_repo
build_venvs
build_frontend
ensure_env_files

if [[ ${CONTINUE} -eq 1 ]]; then
    phase_continue
    exit 0
fi

if env_files_filled; then
    log "Env files already populated; running phase 2 automatically."
    phase_continue
    exit 0
fi

cat <<EOF

============================================================
Bootstrap phase 1 complete.

Edit the env files (templates copied from each service's .env.example):
  ${ETC_DIR}/backend.env
  ${ETC_DIR}/bot.env
  ${ETC_DIR}/scheduler.env

Required in backend.env:
  SECRET_KEY        (>=32 random bytes)
  JWT_SECRET_KEY    (>=32 random bytes)
  MONGO_URI         (e.g. mongodb://127.0.0.1:27017/unichat)
  OPENROUTER_API_KEY
  CORS_ORIGINS      (e.g. http://<server-ip>:5000)
  BACKEND_PORT      (default 5000)

Then re-run:
  sudo /opt/unichat/deploy/install.sh --continue
============================================================
EOF
