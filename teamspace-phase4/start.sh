#!/usr/bin/env bash
# Starts the whole TeamSpace application:
#   Postgres (docker) -> video services (docker: LiveKit, Redis, recorder)
#   -> database migrations -> backend (port 8000) -> frontend (port 5173)
#   -> AI-agent (MCP) server setup (one-time; the AI client launches it itself)
#
# Usage:   ./start.sh              start everything
#          ./start.sh --no-media   skip the video/recording containers
# Stop:    press Ctrl+C here, or run ./stop.sh from another terminal.

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

BACKEND_PORT=8000
FRONTEND_PORT=5173
PG_CONTAINER=teamspace-pg
PG_PORT=5434
LOG_DIR="$ROOT/logs"
PID_FILE="$LOG_DIR/pids"
WITH_MEDIA=1
[[ "${1:-}" == "--no-media" ]] && WITH_MEDIA=0

c_ok()   { printf '\033[32m✔\033[0m %s\n' "$*"; }
c_info() { printf '\033[36m➜\033[0m %s\n' "$*"; }
c_warn() { printf '\033[33m!\033[0m %s\n' "$*"; }
c_err()  { printf '\033[31m✘ %s\033[0m\n' "$*" >&2; }

port_pid() { ss -ltnp "sport = :$1" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2; }

wait_for() { # wait_for <description> <seconds> <command...>
  local what="$1" secs="$2"; shift 2
  for ((i = 0; i < secs; i++)); do
    if "$@" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  c_err "Timed out waiting for $what."
  return 1
}

# ---------------------------------------------------------------- checks
command -v docker >/dev/null || { c_err "Docker is not installed."; exit 1; }
docker info >/dev/null 2>&1 || { c_err "Docker is not running (try: sudo systemctl start docker)."; exit 1; }
[[ -x backend/venv/bin/uvicorn ]] || { c_err "backend/venv is missing. Create it with: cd backend && python3 -m venv venv && venv/bin/pip install -r requirements.txt"; exit 1; }
command -v npm >/dev/null || { c_err "Node.js / npm is not installed."; exit 1; }

for entry in "$BACKEND_PORT:backend" "$FRONTEND_PORT:frontend"; do
  port="${entry%%:*}"; name="${entry##*:}"
  if [[ -n "$(port_pid "$port")" ]]; then
    c_err "Port $port ($name) is already in use. Run ./stop.sh first, then start again."
    exit 1
  fi
done

mkdir -p "$LOG_DIR"
: > "$PID_FILE"

# ---------------------------------------------------------------- database
c_info "Starting the database..."
if docker ps -a --format '{{.Names}}' | grep -qx "$PG_CONTAINER"; then
  docker start "$PG_CONTAINER" >/dev/null
else
  docker run -d --name "$PG_CONTAINER" \
    -e POSTGRES_USER=teamspace -e POSTGRES_PASSWORD=teamspace_dev_pw -e POSTGRES_DB=teamspace \
    -p "$PG_PORT:5432" postgres:16-alpine >/dev/null
fi
wait_for "the database" 40 docker exec "$PG_CONTAINER" pg_isready -U teamspace || exit 1
c_ok "Database ready (port $PG_PORT)"

# ---------------------------------------------------------------- video services
if [[ $WITH_MEDIA -eq 1 ]]; then
  c_info "Starting video services (LiveKit, Redis, recorder)..."
  mkdir -p backend/uploads/egress && chmod 777 backend/uploads/egress 2>/dev/null || true
  if (cd backend && docker compose -f docker-compose.media.yml up -d) >"$LOG_DIR/media.log" 2>&1; then
    c_ok "Video services started (calls and meeting recording available)"
  else
    c_warn "Could not start the video services - chat works, but calls/recording won't. See logs/media.log"
  fi
else
  c_warn "Skipping video services (--no-media): calls and recording are unavailable."
fi

# ---------------------------------------------------------------- backend
c_info "Applying database migrations..."
if ! (cd backend && source venv/bin/activate && alembic upgrade head) >"$LOG_DIR/migrate.log" 2>&1; then
  c_err "Database migration failed. See logs/migrate.log"
  tail -n 15 "$LOG_DIR/migrate.log" >&2
  exit 1
fi
c_ok "Database is up to date"

c_info "Starting the backend..."
(cd backend && source venv/bin/activate && exec setsid uvicorn app.main:app --port "$BACKEND_PORT" >"$LOG_DIR/backend.log" 2>&1) &
echo "backend $!" >> "$PID_FILE"
wait_for "the backend" 40 curl -sf "http://localhost:$BACKEND_PORT/health" || { tail -n 20 "$LOG_DIR/backend.log" >&2; exit 1; }
c_ok "Backend running (port $BACKEND_PORT)"

# ---------------------------------------------------------------- frontend
if [[ ! -d frontend/node_modules ]]; then
  c_info "Installing frontend packages (first run only)..."
  (cd frontend && npm install) >"$LOG_DIR/npm-install.log" 2>&1 || { c_err "npm install failed. See logs/npm-install.log"; exit 1; }
fi
c_info "Starting the frontend..."
(cd frontend && exec setsid npm run dev -- --port "$FRONTEND_PORT" --strictPort >"$LOG_DIR/frontend.log" 2>&1) &
echo "frontend $!" >> "$PID_FILE"
wait_for "the frontend" 40 curl -sf -o /dev/null "http://localhost:$FRONTEND_PORT" || { tail -n 20 "$LOG_DIR/frontend.log" >&2; exit 1; }
c_ok "Frontend running (port $FRONTEND_PORT)"

# ---------------------------------------------------------------- AI agent (MCP)
# The MCP server (mcp_server/) lets an AI assistant such as Claude Code operate
# TeamSpace using an API key. It is NOT a long-running service here: the AI
# client starts it on demand over stdio. All we do is make sure its Python
# environment exists, so the command shown in the API-keys panel just works.
# Failure here is non-fatal -- the app itself doesn't depend on it.
MCP_STATUS="not set up"
MCP_PY="$ROOT/mcp_server/.venv/bin/python"
if [[ -f mcp_server/server.py ]]; then
  if [[ ! -x "$MCP_PY" ]]; then
    c_info "Setting up the AI-agent (MCP) server (first run only)..."
    if (cd mcp_server && python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt) >"$LOG_DIR/mcp-setup.log" 2>&1; then
      c_ok "AI-agent (MCP) server ready"
      MCP_STATUS="ready"
    else
      c_warn "Could not set up the AI-agent (MCP) server - the app works fine without it. See logs/mcp-setup.log"
      rm -rf mcp_server/.venv
    fi
  else
    MCP_STATUS="ready"
  fi
fi

# ---------------------------------------------------------------- done
cat <<EOF

  ┌──────────────────────────────────────────────────────────┐
  │  TeamSpace is running                                    │
  │                                                          │
  │  App:       http://localhost:$FRONTEND_PORT                        │
  │  API docs:  http://localhost:$BACKEND_PORT/docs                    │
  │  Logs:      $LOG_DIR/                         │
  │                                                          │
  │  Press Ctrl+C to stop the app  (./stop.sh stops it all)  │
  └──────────────────────────────────────────────────────────┘

EOF

if [[ "$MCP_STATUS" == "ready" ]]; then
  cat <<EOF
  AI agent (MCP): ready. Admins/managers: open the app > Account >
  "API keys", create a key, and paste the command shown there into your
  AI client (Claude Code, Claude Desktop, Cursor...). Use these paths:
    command: $MCP_PY
    script:  $ROOT/mcp_server/server.py
  Revoke a key from the same page at any time.

EOF
fi

cleanup() {
  echo
  c_info "Stopping the app..."
  for p in "$BACKEND_PORT" "$FRONTEND_PORT"; do
    pid="$(port_pid "$p")"
    [[ -n "$pid" ]] && kill "$pid" 2>/dev/null
  done
  pkill -f "vite.*--port $FRONTEND_PORT" 2>/dev/null || true
  c_ok "Stopped. Database and video containers are still running (./stop.sh stops those too)."
  exit 0
}
trap cleanup INT TERM

# Keep running in the foreground, showing live logs.
tail -n 0 -f "$LOG_DIR/backend.log" "$LOG_DIR/frontend.log" &
wait
