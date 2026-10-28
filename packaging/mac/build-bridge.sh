#!/usr/bin/env bash
# 用 PyInstaller 把 backend/bridge.py 打成单个可执行文件，并做一次假角度冒烟。
# Linux CI 产出 ELF；macOS 上产出 Mach-O，给 .app 用。两边都不要签名。
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

VENV="$ROOT/build/bridge-venv"
DIST="$ROOT/dist/pyinstaller"
WORK="$ROOT/build/pyinstaller"
BIN="$DIST/popup-book-bridge"

python3 -m venv "$VENV"
"$VENV/bin/pip" install -q -r "$ROOT/backend/requirements.txt" pyinstaller
"$VENV/bin/pyinstaller" \
  --noconfirm \
  --clean \
  --onefile \
  --name popup-book-bridge \
  --paths "$ROOT/backend" \
  --exclude-module pybooklid \
  --collect-submodules websockets \
  --hidden-import websockets.asyncio.server \
  --hidden-import broadcast \
  --hidden-import health \
  --hidden-import protocol \
  --hidden-import sensors \
  --hidden-import sensors.fake \
  --hidden-import sensors.lid \
  --hidden-import sensors.replay \
  --hidden-import sensors.base \
  --hidden-import netbind \
  --distpath "$DIST" \
  --workpath "$WORK" \
  --specpath "$WORK" \
  "$ROOT/backend/bridge.py"

[[ -x "$BIN" ]] || {
  printf '[pack] 没有生成 %s\n' "$BIN" >&2
  exit 1
}

WS_PORT="${POPUP_BRIDGE_SMOKE_WS:-18791}"
HTTP_PORT="${POPUP_BRIDGE_SMOKE_HTTP:-18792}"
LOG="$ROOT/build/bridge-smoke.log"
"$BIN" --fake --host 127.0.0.1 --port "$WS_PORT" --http-port "$HTTP_PORT" >"$LOG" 2>&1 &
pid=$!
cleanup() { kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; }
trap cleanup EXIT

ok=0
for _ in $(seq 1 80); do
  body="$(curl -fsS --max-time 1 "http://127.0.0.1:${HTTP_PORT}/health" 2>/dev/null || true)"
  if [[ "$body" == *'"ok": true'* && "$body" == *'"mode": "fake"'* ]]; then
    ok=1
    break
  fi
  if ! kill -0 "$pid" 2>/dev/null; then
    break
  fi
  sleep 0.25
done

if [[ "$ok" != 1 ]]; then
  printf '[pack] 打包出的桥没有通过 /health 冒烟\n' >&2
  tail -n 40 "$LOG" >&2 || true
  exit 1
fi

printf '[pack] OK  %s 假角度 /health mode=fake\n' "$BIN"
trap - EXIT
cleanup
