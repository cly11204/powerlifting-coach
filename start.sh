#!/usr/bin/env bash
# Starts the backend (port 8000) and frontend (port 5173) in ONE terminal.
# Ctrl+C stops both.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"

fail() { echo; echo "❌ $*"; exit 1; }

# ---- 1. Python check (needs 3.11+) ----
PY="${PYTHON:-python3}"
command -v "$PY" >/dev/null || fail "python3 not found. Install Python 3.11+ from https://www.python.org/downloads/"
"$PY" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)' \
  || fail "Python 3.11+ is required (found $("$PY" --version)). Install a newer one, or run: PYTHON=python3.12 ./start.sh"
command -v npm >/dev/null || fail "npm not found. Install Node.js 20+ from https://nodejs.org/"

# ---- 2. Backend packages (reinstalls whenever requirements change or a past install failed) ----
cd "$ROOT/backend"
STAMP=.venv/.installed-$(cat requirements.txt requirements-dev.txt | cksum | cut -d' ' -f1)
if [ ! -f "$STAMP" ]; then
  echo "▶ Installing backend packages (first run takes a minute)…"
  [ -d .venv ] || "$PY" -m venv .venv
  .venv/bin/python -m pip install -q --upgrade pip
  .venv/bin/python -m pip install -q -r requirements-dev.txt \
    || fail "Backend install failed (see the error above). Delete backend/.venv and try again, or paste the error to get help."
  rm -f .venv/.installed-* && touch "$STAMP"
fi

# ---- 3. Start backend and wait until it answers ----
echo "▶ Starting backend on http://127.0.0.1:8000"
.venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!
trap 'kill $BACKEND_PID 2>/dev/null || true' EXIT INT TERM

for _ in $(seq 1 60); do
  kill -0 "$BACKEND_PID" 2>/dev/null || fail "Backend crashed while starting (see the error above). Is port 8000 already in use?"
  .venv/bin/python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=1)" 2>/dev/null && break
  sleep 0.5
done
.venv/bin/python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=1)" 2>/dev/null \
  || fail "Backend didn't respond within 30 seconds."
echo "✅ Backend is up"

# ---- 4. Frontend ----
cd "$ROOT/frontend"
[ -d node_modules ] || { echo "▶ Installing frontend packages…"; npm install --no-audit --no-fund; }
echo "✅ Open http://localhost:5173 in your browser (Ctrl+C to stop)"
npm run dev
