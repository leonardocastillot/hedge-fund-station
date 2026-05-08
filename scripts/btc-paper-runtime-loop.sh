#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/.tmp"
PID_FILE="$LOG_DIR/btc-paper-runtime-loop.pid"
LOG_FILE="$LOG_DIR/btc-paper-runtime-loop.log"
META_FILE="$LOG_DIR/btc-paper-runtime-loop.meta"
RUNNER_FILE="$LOG_DIR/run-btc-paper-runtime-loop.sh"
SCREEN_SESSION="${BTC_PAPER_LOOP_SCREEN_SESSION:-btc-paper-runtime-loop}"
DEFAULT_STRATEGY="btc_failed_impulse_reversal"
DEFAULT_GATEWAY_URL="${HYPERLIQUID_GATEWAY_HTTP_URL:-http://127.0.0.1:18001}"
DEFAULT_INTERVAL_SECONDS="${BTC_PAPER_LOOP_INTERVAL_SECONDS:-300}"
NPM_BIN="${NPM_BIN:-$(command -v npm || true)}"

mkdir -p "$LOG_DIR"

screen_session_pid() {
  if ! command -v screen >/dev/null 2>&1; then
    return 0
  fi
  screen -ls 2>/dev/null | awk -v session=".$SCREEN_SESSION" '$1 ~ session { split($1, parts, "."); print parts[1]; exit }' || true
}

is_screen_running() {
  [[ -n "$(screen_session_pid)" ]]
}

is_running() {
  if is_screen_running; then
    return 0
  fi
  if [[ ! -f "$PID_FILE" ]]; then
    return 1
  fi
  local pid
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -z "$pid" ]]; then
    return 1
  fi
  kill -0 "$pid" >/dev/null 2>&1
}

print_status() {
  local screen_pid
  screen_pid="$(screen_session_pid)"
  if [[ -n "$screen_pid" ]]; then
    echo "running screen_session=$SCREEN_SESSION pid=$screen_pid"
  elif is_running; then
    echo "running pid=$(cat "$PID_FILE")"
  else
    rm -f "$PID_FILE"
    echo "stopped"
  fi
  [[ -f "$META_FILE" ]] && cat "$META_FILE"
  echo "log=$LOG_FILE"
}

stop_loop() {
  if is_screen_running; then
    echo "Stopping BTC paper runtime loop screen_session=$SCREEN_SESSION"
    screen -S "$SCREEN_SESSION" -X quit >/dev/null 2>&1 || true
    rm -f "$PID_FILE"
    return 0
  fi
  if ! is_running; then
    rm -f "$PID_FILE"
    echo "BTC paper runtime loop is not running."
    return 0
  fi
  local pid
  pid="$(cat "$PID_FILE")"
  echo "Stopping BTC paper runtime loop pid=$pid"
  kill "$pid" || true
  for _ in {1..20}; do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      break
    fi
    sleep 0.25
  done
  if kill -0 "$pid" >/dev/null 2>&1; then
    echo "Force stopping BTC paper runtime loop pid=$pid"
    kill -9 "$pid" || true
  fi
  rm -f "$PID_FILE"
}

start_loop() {
  local strategy="$DEFAULT_STRATEGY"
  local gateway_url="$DEFAULT_GATEWAY_URL"
  local interval_seconds="$DEFAULT_INTERVAL_SECONDS"
  local max_ticks="0"
  local dry_run="false"
  local fail_fast="false"
  local portfolio_value="100000"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --strategy)
        strategy="$2"
        shift 2
        ;;
      --gateway-url)
        gateway_url="$2"
        shift 2
        ;;
      --interval-seconds)
        interval_seconds="$2"
        shift 2
        ;;
      --max-ticks)
        max_ticks="$2"
        shift 2
        ;;
      --portfolio-value)
        portfolio_value="$2"
        shift 2
        ;;
      --dry-run)
        dry_run="true"
        shift
        ;;
      --fail-fast)
        fail_fast="true"
        shift
        ;;
      *)
        echo "Unknown start option: $1" >&2
        return 2
        ;;
    esac
  done

  if is_running; then
    echo "BTC paper runtime loop is already running pid=$(cat "$PID_FILE")."
    return 1
  fi
  if [[ -z "$NPM_BIN" ]]; then
    echo "npm was not found in PATH; set NPM_BIN to the absolute npm path." >&2
    return 1
  fi

  local args=(
    "run"
    "--silent"
    "hf:paper:loop"
    "--"
    "--strategy" "$strategy"
    "--gateway-url" "$gateway_url"
    "--portfolio-value" "$portfolio_value"
    "--interval-seconds" "$interval_seconds"
  )
  if [[ "$max_ticks" != "0" ]]; then
    args+=("--max-ticks" "$max_ticks")
  fi
  if [[ "$dry_run" == "true" ]]; then
    args+=("--dry-run")
  fi
  if [[ "$fail_fast" == "true" ]]; then
    args+=("--fail-fast")
  fi

  local command_line
  printf -v command_line "%q " "$NPM_BIN" "${args[@]}"

  cat >"$RUNNER_FILE" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "$ROOT_DIR"
echo '{"event":"paper_supervisor_runner_started","strategy":"$strategy","gatewayUrl":"$gateway_url","intervalSeconds":$interval_seconds,"maxTicks":$max_ticks,"dryRun":$dry_run}' >>"$LOG_FILE"
exec $command_line>>"$LOG_FILE" 2>&1
EOF
  chmod +x "$RUNNER_FILE"
  : >"$LOG_FILE"
  cat >"$META_FILE" <<EOF
strategy=$strategy
gateway_url=$gateway_url
interval_seconds=$interval_seconds
max_ticks=$max_ticks
dry_run=$dry_run
fail_fast=$fail_fast
portfolio_value=$portfolio_value
started_at=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
EOF

  local pid=""
  if command -v screen >/dev/null 2>&1; then
    screen -S "$SCREEN_SESSION" -X quit >/dev/null 2>&1 || true
    screen -dmS "$SCREEN_SESSION" bash "$RUNNER_FILE"
    sleep 0.25
    pid="$(screen_session_pid)"
  else
    nohup bash "$RUNNER_FILE" >/dev/null 2>&1 &
    pid="$!"
  fi
  echo "$pid" >"$PID_FILE"
  if [[ -n "$pid" ]]; then
    echo "Started BTC paper runtime loop pid=$pid"
  else
    echo "Started BTC paper runtime loop"
  fi
  echo "Log: $LOG_FILE"
}

tail_loop() {
  local lines="${1:-80}"
  if [[ -f "$LOG_FILE" ]]; then
    tail -n "$lines" "$LOG_FILE"
  else
    echo "No log file yet: $LOG_FILE" >&2
    return 1
  fi
}

command="${1:-status}"
shift || true

case "$command" in
  start)
    start_loop "$@"
    ;;
  stop)
    stop_loop
    ;;
  restart)
    stop_loop
    start_loop "$@"
    ;;
  status)
    print_status
    ;;
  tail)
    tail_loop "${1:-80}"
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|tail} [start-options]" >&2
    echo "Start options: --strategy ID --gateway-url URL --interval-seconds N --max-ticks N --portfolio-value USD --dry-run --fail-fast" >&2
    exit 2
    ;;
esac
