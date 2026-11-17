#!/usr/bin/env bash
# Starts backend (port 8000) and frontend (port 5173) in ONE terminal. Ctrl+C stops both.
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

cd "$ROOT/backend"
if [ ! -d .venv ]; then
  python3 -m venv .venv
  .venv/bin/pip install -q -r requirements-dev.txt
fi
.venv/bin/uvicorn app.main:app --reload --port 8000 &
BACKEND_PID=$!
trap 'kill $BACKEND_PID 2>/dev/null' EXIT INT TERM

cd "$ROOT/frontend"
[ -d node_modules ] || npm install
echo "Open http://localhost:5173"
npm run dev
