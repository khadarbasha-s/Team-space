#!/usr/bin/env bash
# Stops the TeamSpace app and its docker services.
# Usage:  ./stop.sh            stop app + video services + database
#         ./stop.sh --app      stop only the backend and frontend

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

port_pid() { ss -ltnp "sport = :$1" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2; }

for port in 8000 5173; do
  pid="$(port_pid "$port")"
  if [[ -n "$pid" ]]; then
    kill "$pid" 2>/dev/null && echo "Stopped process on port $port"
  fi
done
pkill -f "vite.*--port 5173" 2>/dev/null || true

if [[ "${1:-}" != "--app" ]]; then
  (cd backend && docker compose -f docker-compose.media.yml down 2>/dev/null) && echo "Stopped video services"
  docker stop teamspace-pg >/dev/null 2>&1 && echo "Stopped database"
fi
echo "Done."
