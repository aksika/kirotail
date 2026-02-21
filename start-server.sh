#!/usr/bin/env bash
set -euo pipefail

MOUNT_POINT="$HOME/mac-remote"
REMOTE="mac-remote"
REMOTE_PATH="/Users/akos"
export KT_TOKEN="${KT_TOKEN:-mysecret}"

# Cleanup on exit
cleanup() {
  echo "Shutting down..."
  fusermount -u "$MOUNT_POINT" 2>/dev/null || true
  kill "$TUNNEL_PID" 2>/dev/null || true
}
trap cleanup EXIT

# 1. Start reverse tunnel
ssh "$REMOTE" -N &
TUNNEL_PID=$!
sleep 1

# 2. Mount remote filesystem
mkdir -p "$MOUNT_POINT"
sshfs "${REMOTE}:${REMOTE_PATH}" "$MOUNT_POINT"
echo "Mounted ${REMOTE}:${REMOTE_PATH} → ${MOUNT_POINT}"

# 3. Start server (foreground — Ctrl+C to stop everything)
echo "Starting kt-server..."
node ~/workspace/agent/kiro-tailscale/dist/server.js --working-dir "$MOUNT_POINT"
