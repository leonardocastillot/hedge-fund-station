#!/usr/bin/env bash
set -euo pipefail

BACKEND_URL="${ALPHA_ENGINE_API_URL:-${VITE_ALPHA_ENGINE_API_URL:-http://127.0.0.1:18500}}"
INTERVAL_SECONDS="${MACRO_CALENDAR_REFRESH_SECONDS:-900}"
DAYS="${MACRO_CALENDAR_DAYS:-7}"

echo "Starting macro calendar refresh loop against ${BACKEND_URL} every ${INTERVAL_SECONDS}s"

while true; do
  started_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  if curl -fsS -X POST "${BACKEND_URL}/calendar/refresh?days=${DAYS}" >/dev/null; then
    echo "${started_at} macro calendar refresh ok"
  else
    echo "${started_at} macro calendar refresh failed" >&2
  fi
  sleep "${INTERVAL_SECONDS}"
done
