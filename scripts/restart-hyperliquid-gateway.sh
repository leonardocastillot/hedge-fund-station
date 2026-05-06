#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GATEWAY_DIR="$ROOT_DIR/backend/hyperliquid_gateway"
PORT="${HYPERLIQUID_GATEWAY_PORT:-18001}"
HOST="${HYPERLIQUID_GATEWAY_HOST:-0.0.0.0}"
LOG_DIR="$ROOT_DIR/.tmp"
LOG_FILE="$LOG_DIR/hyperliquid-gateway.log"
RUNNER_FILE="$LOG_DIR/run-hyperliquid-gateway.sh"
SCREEN_SESSION="${HYPERLIQUID_GATEWAY_SCREEN_SESSION:-hyperliquid-gateway-dev}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
LOCAL_DATA_ROOT="${HYPERLIQUID_DATA_ROOT:-$GATEWAY_DIR/data}"

mkdir -p "$LOG_DIR"
mkdir -p "$LOCAL_DATA_ROOT"
export HYPERLIQUID_DATA_ROOT="$LOCAL_DATA_ROOT"
export HYPERLIQUID_DB_PATH="${HYPERLIQUID_DB_PATH:-$LOCAL_DATA_ROOT/hyperliquid.db}"

existing_pids="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN || true)"
if [[ -n "$existing_pids" ]]; then
  echo "Stopping Hyperliquid gateway on port $PORT: $existing_pids"
  # shellcheck disable=SC2086
  kill $existing_pids || true
  for _ in {1..20}; do
    if ! lsof -tiTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
      break
    fi
    sleep 0.25
  done
fi

remaining_pids="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN || true)"
if [[ -n "$remaining_pids" ]]; then
  echo "Force stopping Hyperliquid gateway on port $PORT: $remaining_pids"
  # shellcheck disable=SC2086
  kill -9 $remaining_pids || true
fi

cat >"$RUNNER_FILE" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "$GATEWAY_DIR"
export HYPERLIQUID_DATA_ROOT="$HYPERLIQUID_DATA_ROOT"
export HYPERLIQUID_DB_PATH="$HYPERLIQUID_DB_PATH"
exec "$PYTHON_BIN" -m uvicorn app:app --host "$HOST" --port "$PORT" >>"$LOG_FILE" 2>&1
EOF
chmod +x "$RUNNER_FILE"
: >"$LOG_FILE"

echo "Starting Hyperliquid gateway from $GATEWAY_DIR on $HOST:$PORT"
echo "Using HYPERLIQUID_DATA_ROOT=$HYPERLIQUID_DATA_ROOT"
if command -v screen >/dev/null 2>&1; then
  screen -S "$SCREEN_SESSION" -X quit >/dev/null 2>&1 || true
  screen -dmS "$SCREEN_SESSION" "$RUNNER_FILE"
else
  nohup "$RUNNER_FILE" >/dev/null 2>&1 &
fi

for _ in {1..40}; do
  if curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
    lsof -tiTCP:"$PORT" -sTCP:LISTEN >"$LOG_DIR/hyperliquid-gateway.pid" || true
    echo "Hyperliquid gateway is healthy on http://127.0.0.1:$PORT"
    echo "Log: $LOG_FILE"
    exit 0
  fi
  sleep 0.25
done

echo "Hyperliquid gateway did not become healthy. Last log lines:"
tail -n 40 "$LOG_FILE" || true
exit 1
