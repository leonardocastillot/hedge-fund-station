#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$HOME/Library/Logs"
LOG_FILE="$LOG_DIR/hedge-fund-station-dev.log"
SCREEN_SESSION="hedge-fund-station-dev"

mkdir -p "$LOG_DIR"

focus_app() {
  /usr/bin/osascript <<'APPLESCRIPT' >/dev/null 2>&1 &
tell application "System Events"
  repeat with processName in {"Hedge Fund Station", "Electron"}
    if exists process processName then
      set frontmost of process processName to true
      return
    end if
  end repeat
end tell
APPLESCRIPT
  local focus_pid=$!
  local waited=0
  while kill -0 "$focus_pid" >/dev/null 2>&1; do
    if [ "$waited" -ge 15 ]; then
      kill "$focus_pid" >/dev/null 2>&1 || true
      wait "$focus_pid" >/dev/null 2>&1 || true
      return
    fi
    sleep 0.2
    waited=$((waited + 1))
  done
  wait "$focus_pid" >/dev/null 2>&1 || true
}

is_dev_running() {
  /usr/bin/pgrep -f "[e]lectron-vite dev" >/dev/null 2>&1
}

if ! /usr/sbin/lsof -nP -iTCP:18500 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Starting secure backend tunnel service..."
  "$ROOT_DIR/scripts/backend-tunnel.sh" start || true
  sleep 2
else
  echo "Secure backend tunnel already active."
fi

if [ -z "${HEDGE_STATION_BACKEND_MODE:-}" ]; then
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    export HEDGE_STATION_BACKEND_MODE="docker"
  else
    export HEDGE_STATION_BACKEND_MODE="process"
    echo "Docker is unavailable; using local Hyperliquid gateway process mode on 127.0.0.1:18001."
  fi
fi

export HEDGE_STATION_AUTOSTART_BACKEND="${HEDGE_STATION_AUTOSTART_BACKEND:-1}"

if is_dev_running; then
  echo "Hedge Fund Station dev session is already running. Focusing it."
  focus_app
  exit 0
fi

if /usr/sbin/lsof -nP -iTCP:5173 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Vite dev port is already active. Focusing the existing app if available."
  focus_app
  exit 0
fi

echo "Starting Hedge Fund Station dev session..."
if command -v screen >/dev/null 2>&1; then
  screen -S "$SCREEN_SESSION" -X quit >/dev/null 2>&1 || true
  screen -dmS "$SCREEN_SESSION" /bin/zsh -lc "cd '$ROOT_DIR' && HEDGE_STATION_BACKEND_MODE='$HEDGE_STATION_BACKEND_MODE' HEDGE_STATION_AUTOSTART_BACKEND='$HEDGE_STATION_AUTOSTART_BACKEND' npm run dev > '$LOG_FILE' 2>&1"
else
  cd "$ROOT_DIR"
  nohup env HEDGE_STATION_BACKEND_MODE="$HEDGE_STATION_BACKEND_MODE" HEDGE_STATION_AUTOSTART_BACKEND="$HEDGE_STATION_AUTOSTART_BACKEND" npm run dev > "$LOG_FILE" 2>&1 &
fi

sleep 4
focus_app

echo "Hedge Fund Station dev is running."
echo "Logs: $LOG_FILE"
