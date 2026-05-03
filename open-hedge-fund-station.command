#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_PATH="$ROOT_DIR/release/1.0.0/mac-arm64/Hedge Fund Station.app"

if ! lsof -nP -iTCP:18500 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Starting secure backend tunnel service..."
  "$ROOT_DIR/scripts/backend-tunnel.sh" start
  sleep 2
else
  echo "Secure backend tunnel already active."
fi

if [ ! -d "$APP_PATH" ]; then
  echo "App not found: $APP_PATH"
  echo "Run npm run dist:mac first."
  read -k 1 "?Press any key to close..."
  exit 1
fi

pkill -x "Hedge Fund Station" >/dev/null 2>&1 || true
sleep 1
open -n -F "$APP_PATH"
echo "Hedge Fund Station opened."
