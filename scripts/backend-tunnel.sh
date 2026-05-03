#!/bin/zsh
set -euo pipefail

LABEL="com.hedgefund.backend-tunnel"
PROJECT="leonard-489819"
ZONE="us-central1-a"
INSTANCE="hf-backend-01"
LOCAL_PORT="18500"
REMOTE_HOST="127.0.0.1"
REMOTE_PORT="18500"
SSH_ALIAS="$INSTANCE.$ZONE.$PROJECT"
LOG_DIR="$HOME/.hedge-station"
INSTALL_DIR="$LOG_DIR/bin"
STDOUT_LOG="$LOG_DIR/backend-tunnel.log"
STDERR_LOG="$LOG_DIR/backend-tunnel.err.log"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"
SCRIPT_PATH="$(cd "$(dirname "$0")" && pwd)/backend-tunnel.sh"
SERVICE_SCRIPT_PATH="$INSTALL_DIR/backend-tunnel.sh"

mkdir -p "$LOG_DIR" "$INSTALL_DIR" "$HOME/Library/LaunchAgents"

find_gcloud() {
  if [ -n "${GCLOUD_BIN:-}" ] && [ -x "$GCLOUD_BIN" ]; then
    echo "$GCLOUD_BIN"
    return
  fi

  if [ -x "/opt/homebrew/bin/gcloud" ]; then
    echo "/opt/homebrew/bin/gcloud"
    return
  fi

  if [ -x "/usr/local/bin/gcloud" ]; then
    echo "/usr/local/bin/gcloud"
    return
  fi

  command -v gcloud
}

port_is_listening() {
  /usr/sbin/lsof -nP -iTCP:"$LOCAL_PORT" -sTCP:LISTEN >/dev/null 2>&1
}

health_check() {
  /usr/bin/curl -fsS --max-time 4 "http://127.0.0.1:$LOCAL_PORT/health" >/dev/null
}

ensure_ssh_config() {
  if /usr/bin/grep -q "Host $SSH_ALIAS" "$HOME/.ssh/config" 2>/dev/null; then
    return
  fi

  local gcloud_bin
  gcloud_bin="$(find_gcloud)"
  "$gcloud_bin" compute config-ssh --project="$PROJECT" --quiet >/dev/null
}

sync_service_script() {
  if [ "$SCRIPT_PATH" != "$SERVICE_SCRIPT_PATH" ]; then
    /usr/bin/install -m 755 "$SCRIPT_PATH" "$SERVICE_SCRIPT_PATH"
  fi
}

write_plist() {
  local gcloud_bin
  gcloud_bin="$(find_gcloud)"
  sync_service_script

  cat >"$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$SERVICE_SCRIPT_PATH</string>
    <string>run</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>GCLOUD_BIN</key>
    <string>$gcloud_bin</string>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>$STDOUT_LOG</string>
  <key>StandardErrorPath</key>
  <string>$STDERR_LOG</string>
  <key>WorkingDirectory</key>
  <string>$(cd "$(dirname "$SCRIPT_PATH")/.." && pwd)</string>
</dict>
</plist>
PLIST
}

run_tunnel() {
  echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') starting tunnel $LOCAL_PORT -> $INSTANCE:$REMOTE_HOST:$REMOTE_PORT"

  while port_is_listening; do
    if health_check; then
      echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') local backend tunnel already healthy on 127.0.0.1:$LOCAL_PORT"
    else
      echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') port $LOCAL_PORT is busy but health check failed"
    fi
    sleep 30
  done

  ensure_ssh_config

  exec /usr/bin/ssh "$SSH_ALIAS" \
    -N \
    -o ExitOnForwardFailure=yes \
    -o ServerAliveInterval=30 \
    -o ServerAliveCountMax=3 \
    -L "$LOCAL_PORT:$REMOTE_HOST:$REMOTE_PORT"
}

install_service() {
  sync_service_script
  write_plist
  /bin/launchctl bootout "gui/$(id -u)" "$PLIST_PATH" >/dev/null 2>&1 || true
  /bin/launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH"
  /bin/launchctl enable "gui/$(id -u)/$LABEL"
  /bin/launchctl kickstart -k "gui/$(id -u)/$LABEL"
  echo "Installed and started $LABEL"
  echo "Logs: $STDOUT_LOG"
}

start_service() {
  sync_service_script
  if [ ! -f "$PLIST_PATH" ]; then
    write_plist
  fi
  if ! /bin/launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1; then
    /bin/launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH"
    /bin/launchctl enable "gui/$(id -u)/$LABEL"
  fi
  /bin/launchctl kickstart -k "gui/$(id -u)/$LABEL"
  echo "Started $LABEL"
}

stop_service() {
  /bin/launchctl bootout "gui/$(id -u)" "$PLIST_PATH" >/dev/null 2>&1 || true
  echo "Stopped $LABEL"
}

status_service() {
  echo "LaunchAgent:"
  /bin/launchctl print "gui/$(id -u)/$LABEL" 2>/dev/null || echo "  not loaded"
  echo
  echo "Local port:"
  /usr/sbin/lsof -nP -iTCP:"$LOCAL_PORT" -sTCP:LISTEN || echo "  not listening"
  echo
  echo "Health:"
  /usr/bin/curl -fsS --max-time 4 "http://127.0.0.1:$LOCAL_PORT/health" && echo || echo "  health check failed"
}

case "${1:-run}" in
  run)
    run_tunnel
    ;;
  install)
    install_service
    ;;
  start)
    start_service
    ;;
  stop)
    stop_service
    ;;
  status)
    status_service
    ;;
  plist)
    write_plist
    echo "$PLIST_PATH"
    ;;
  *)
    echo "Usage: $0 {run|install|start|stop|status|plist}" >&2
    exit 2
    ;;
esac
