#!/bin/bash
# Popup Book.app 的入口。不签名。双击时没有终端，日志写到 ~/Library/Logs。
set -euo pipefail
RES="$(cd "$(dirname "$0")/../Resources" && pwd)"
export POPUP_BRIDGE_BIN="$RES/popup-book-bridge"
export POPUP_FOREGROUND=1
cd "$RES"
if [[ -t 1 ]]; then
  exec "$RES/start.sh" --no-docker "$@"
fi
export POPUP_OPEN_BROWSER=1
mkdir -p "${HOME}/Library/Logs"
LOG="${HOME}/Library/Logs/popup-book.log"
exec >>"$LOG" 2>&1
printf '\n---- %s ----\n' "$(date)"
exec "$RES/start.sh" --no-docker --yes "$@"
