#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "======================================================================="
echo "  🚀 LaunchGate: Enterprise Production Readiness Command Center"
echo "======================================================================="

# 1. Verify Node.js is installed
if ! command -v node >/dev/null 2>&1; then
    echo "[ERROR] Node.js is not installed or not in PATH."
    echo "Please install Node.js 18+ from https://nodejs.org/ and try again."
    exit 1
fi

# 2. Check dependencies
if [ ! -d "node_modules" ]; then
    echo "[*] First-time setup: Installing dependencies..."
    npm install --no-audit --no-fund
    echo "[OK] Dependencies installed successfully!"
fi

# 3. Open browser after short delay in background
PORT="${PORT:-4545}"
URL="http://localhost:${PORT}"

(
  sleep 1.5
  if command -v open >/dev/null 2>&1; then
    open "$URL"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1
  fi
) &

# 4. Start Server
echo "[*] Starting LaunchGate server at $URL ..."
node server.js
