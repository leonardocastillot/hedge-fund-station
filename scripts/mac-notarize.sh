#!/usr/bin/env bash
set -euo pipefail

ARTIFACT_PATH="${1:-}"

if [[ -z "$ARTIFACT_PATH" || ! -e "$ARTIFACT_PATH" ]]; then
  echo "Usage: scripts/mac-notarize.sh <path-to-dmg-or-zip>" >&2
  exit 1
fi

if [[ -z "${APPLE_ID:-}" || -z "${APPLE_TEAM_ID:-}" || -z "${APPLE_APP_SPECIFIC_PASSWORD:-}" ]]; then
  echo "Missing APPLE_ID, APPLE_TEAM_ID, or APPLE_APP_SPECIFIC_PASSWORD." >&2
  echo "Use an app-specific password, not your Apple ID password." >&2
  exit 1
fi

xcrun notarytool submit "$ARTIFACT_PATH" \
  --apple-id "$APPLE_ID" \
  --team-id "$APPLE_TEAM_ID" \
  --password "$APPLE_APP_SPECIFIC_PASSWORD" \
  --wait

if [[ "$ARTIFACT_PATH" == *.dmg ]]; then
  xcrun stapler staple "$ARTIFACT_PATH"
  xcrun stapler validate "$ARTIFACT_PATH"
fi
