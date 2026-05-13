#!/usr/bin/env bash
# uni-chat update: git pull -> reinstall deps -> rebuild frontend -> migrate -> restart services.
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "Run as root (sudo ./update.sh)"; exit 1; }

readonly REPO_ROOT="/opt/unichat"
readonly SERVICE_USER="unichat"

cd "${REPO_ROOT}"

echo "[update] git pull..."
sudo -u "${SERVICE_USER}" git -C "${REPO_ROOT}" pull --ff-only

echo "[update] backend deps..."
sudo -u "${SERVICE_USER}" "${REPO_ROOT}/backend/.venv-uv/bin/uv" pip install --quiet -r "${REPO_ROOT}/backend/requirements.txt"

echo "[update] bot deps..."
sudo -u "${SERVICE_USER}" bash -c "cd ${REPO_ROOT}/bot && ${REPO_ROOT}/bot/.venv-uv/bin/uv pip install --quiet -e . -e ../backend -r ../backend/requirements.txt"

echo "[update] scheduler deps..."
sudo -u "${SERVICE_USER}" bash -c "cd ${REPO_ROOT}/scheduler && ${REPO_ROOT}/scheduler/.venv-uv/bin/uv pip install --quiet -e . -e ../backend -r ../backend/requirements.txt"

echo "[update] frontend build..."
sudo -u "${SERVICE_USER}" bash -c "cd ${REPO_ROOT}/frontend && npm ci --silent && npm run build"

echo "[update] migrations..."
PY="${REPO_ROOT}/backend/.venv-uv/bin/python"
sudo -u "${SERVICE_USER}" "${PY}" "${REPO_ROOT}/backend/scripts/migrate_workspaces.py"
sudo -u "${SERVICE_USER}" "${PY}" "${REPO_ROOT}/backend/scripts/migrate_projects.py"
sudo -u "${SERVICE_USER}" "${PY}" "${REPO_ROOT}/backend/scripts/migrate_resource_scoping.py"
sudo -u "${SERVICE_USER}" "${PY}" "${REPO_ROOT}/backend/scripts/migrate_platform_admin.py" --apply

echo "[update] restarting services..."
systemctl restart unichat unichat-bot unichat-scheduler
sleep 3
systemctl is-active unichat unichat-bot unichat-scheduler

# shellcheck disable=SC1091
. /etc/unichat/backend.env
PORT="${BACKEND_PORT:-5000}"
curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null && echo "[update] Update complete. Health OK on port ${PORT}."
