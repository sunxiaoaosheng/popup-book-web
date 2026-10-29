#!/usr/bin/env bash
# 一条命令拉起林间小屋：静态页，以及（按模式）合页角度桥。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

MODE="fake"
YES=0
DOCKER_MODE="auto"
RESTART=0
PORT="${POPUP_PORT:-19081}"
WS_PORT="${POPUP_WS_PORT:-19876}"
HTTP_PORT="${POPUP_HTTP_PORT:-}"
CHECK_V6=0
HZ=45
SMOOTH=0
OFFSET=0

RUN_DIR="$ROOT/.run"
SESSION="$RUN_DIR/session.env"
OWNED=0
TRANSPORT="host"
WEB_PID=""
BRIDGE_PID=""
WEB_CID=""
BRIDGE_CID=""
PY=""

usage() {
  cat <<'EOF'
用法: ./start.sh [模式] [选项]

一条命令打开「林间小屋」。默认是假角度桥 + 静态网页。

模式（只能选一个，默认 --fake）:
  --slider     只开静态页。用页面底部滑块，不启动角度桥。
  --fake       静态页 + 假角度（0→130→0 来回扫）。默认。
  --sensor     静态页 + 真实 MacBook 合页。仅 macOS。
               传感器是本机 HID，读不到 Docker 里面，桥一定跑在宿主机。

选项:
  --yes        缺少的依赖直接安装，不再询问 [y/n]
  --no-docker  用本机 python 提供静态页和假桥
  --docker     静态页（以及假桥）必须用 Docker；Docker 不可用就退出
  --restart    先停掉本脚本上次拉起的进程/容器，再启动
  --port N     静态页端口，默认 19081（也可用环境变量 POPUP_PORT）
  --ws-port N  角度桥端口，默认 19876（POPUP_WS_PORT）
  --http-port N  桥的 HTTP 健康检查端口，默认是 ws 端口 + 1（POPUP_HTTP_PORT）
  --hz N       桥的广播频率，默认 45
  --smooth N   桥的低通系数 0~0.95，默认 0
  --offset N   角度偏移（度），默认 0
  -h, --help   显示本说明

环境变量:
  POPUP_PORT / POPUP_WS_PORT / POPUP_HTTP_PORT
                    覆盖上面的默认端口。命令行 --port / --ws-port / --http-port 优先。
  POPUP_BRIDGE_BIN      可执行的桥。设置后本机桥用它，不再创建 backend/.venv。
  POPUP_OPEN_BROWSER=1  健康之后打开静态页（macOS 用 open，Linux 用 xdg-open）。

没有写 --docker / --no-docker 时：Docker 守护进程可用就用容器，否则用本机 python。
./start.sh 和 ./start.sh --sensor 会转到后台，不占当前终端。
日志在 logs/popup-book.log，进程号在 logs/popup-book.pid。
再执行一次相同模式：服务还健康就只打印地址并退出，不会占第二个端口。
后台进程不询问 [y/n]，缺依赖会直接安装。

命令:
  ./start.sh stop            按 pid 文件停掉后台的页面和桥
  ./start.sh test [--yes]    ESLint、tsc、单元测试、无头浏览器冒烟

示例:
  ./start.sh
  ./start.sh --slider --no-docker
  ./start.sh --fake --no-docker
  ./start.sh --sensor --smooth 0.5
  ./start.sh stop
  ./start.sh test --yes
EOF
}

log() { printf '[start] %s\n' "$*"; }
ok() { printf '[start] OK  %s\n' "$*"; }
die() { printf '[start] 失败：%s\n' "$*" >&2; exit 1; }

confirm() {
  local prompt="$1"
  if [[ "$YES" == 1 ]]; then
    log "--yes，继续：${prompt}"
    return 0
  fi
  if [[ ! -t 0 ]]; then
    log "当前不是交互终端，没有安装。加上 --yes 可自动安装。${prompt}"
    return 1
  fi
  local ans
  read -r -p "[start] ${prompt} [y/n] " ans
  [[ "$ans" == "y" || "$ans" == "Y" ]]
}

is_int() { [[ "$1" =~ ^[0-9]+$ ]]; }

have_docker() {
  command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1
}

ipv6_loopback() {
  python3 - <<'PY'
import socket, sys
try:
    s = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
    s.bind(("::1", 0))
except OSError:
    sys.exit(1)
finally:
    try:
        s.close()
    except Exception:
        pass
PY
}

port_busy() {
  python3 - "$1" <<'PY'
import socket, sys
port = int(sys.argv[1])
hosts = ["127.0.0.1"]
try:
    probe = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
    try:
        probe.bind(("::1", 0))
        hosts.append("::1")
    except OSError:
        pass
    finally:
        probe.close()
except OSError:
    pass
for host in hosts:
    family = socket.AF_INET6 if ":" in host else socket.AF_INET
    s = socket.socket(family, socket.SOCK_STREAM)
    s.settimeout(0.4)
    try:
        if s.connect_ex((host, port)) == 0:
            sys.exit(0)
    finally:
        s.close()
sys.exit(1)
PY
}

web_ok_host() {
  local host="$1" port="$2" url body
  if [[ "$host" == "::1" ]]; then
    url="http://[::1]:${port}/index.html"
  else
    url="http://${host}:${port}/index.html"
  fi
  body="$(curl -g -fsS --max-time 2 "$url" 2>/dev/null || true)"
  [[ "$body" == *"./js/main.js"* ]]
}

web_ok() { web_ok_host "127.0.0.1" "$1"; }

# 握手成功返回 0。$2 为 angle 时再读一帧 JSON。
ws_probe() {
  local port="$1" want="${2:-handshake}" host="${3:-127.0.0.1}"
  python3 - "$port" "$want" "$host" <<'PY'
import socket, sys
port, want, host = int(sys.argv[1]), sys.argv[2], sys.argv[3]
try:
    s = socket.create_connection((host, port), 2)
except OSError:
    sys.exit(1)
s.settimeout(2)
key = "dGhlIHNhbXBsZSBub25jZQ=="
host_header = f"[{host}]" if ":" in host else host
req = (
    f"GET / HTTP/1.1\r\nHost: {host_header}:{port}\r\n"
    "Upgrade: websocket\r\nConnection: Upgrade\r\n"
    f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
)
s.sendall(req.encode())
data = b""
try:
    while b"\r\n\r\n" not in data and len(data) < 2048:
        chunk = s.recv(256)
        if not chunk:
            break
        data += chunk
except OSError:
    pass
if b" 101 " not in data.split(b"\r\n", 1)[0]:
    s.close()
    sys.exit(1)
if want != "angle":
    s.close()
    sys.exit(0)
# 服务端帧不掩码。跳过 ping，读到一条文本。
try:
    for _ in range(6):
        hdr = b""
        while len(hdr) < 2:
            c = s.recv(2 - len(hdr))
            if not c:
                raise OSError("short")
            hdr += c
        opcode = hdr[0] & 0x0F
        ln = hdr[1] & 127
        if ln == 126:
            ext = s.recv(2)
            ln = int.from_bytes(ext, "big")
        elif ln == 127:
            ext = s.recv(8)
            ln = int.from_bytes(ext, "big")
        payload = b""
        while len(payload) < ln:
            c = s.recv(ln - len(payload))
            if not c:
                break
            payload += c
        if opcode == 1:
            sys.stdout.write(payload.decode("utf-8", "replace"))
            s.close()
            sys.exit(0)
        if opcode == 8:
            break
except OSError:
    pass
s.close()
sys.exit(1)
PY
}

load_session() {
  SAVED_MODE=""
  SAVED_PORT=""
  SAVED_WS_PORT=""
  SAVED_HTTP_PORT=""
  SAVED_TRANSPORT=""
  SAVED_WEB_PID=""
  SAVED_BRIDGE_PID=""
  SAVED_WEB_CID=""
  SAVED_BRIDGE_CID=""
  [[ -f "$SESSION" ]] || return 1
  # shellcheck disable=SC1090
  source "$SESSION"
}

write_session() {
  mkdir -p "$RUN_DIR"
  cat >"$SESSION" <<EOF
SAVED_MODE=$MODE
SAVED_PORT=$PORT
SAVED_WS_PORT=$WS_PORT
SAVED_HTTP_PORT=$HTTP_PORT
SAVED_TRANSPORT=$TRANSPORT
SAVED_WEB_PID=${WEB_PID:-}
SAVED_BRIDGE_PID=${BRIDGE_PID:-}
SAVED_WEB_CID=${WEB_CID:-}
SAVED_BRIDGE_CID=${BRIDGE_CID:-}
EOF
}

session_matches_us() {
  [[ -f "$SESSION" ]] || return 1
  local fweb fbridge fcidw fcidb
  fweb="$(sed -n 's/^SAVED_WEB_PID=//p' "$SESSION")"
  fbridge="$(sed -n 's/^SAVED_BRIDGE_PID=//p' "$SESSION")"
  fcidw="$(sed -n 's/^SAVED_WEB_CID=//p' "$SESSION")"
  fcidb="$(sed -n 's/^SAVED_BRIDGE_CID=//p' "$SESSION")"
  [[ "$fweb" == "${WEB_PID:-}" && "$fbridge" == "${BRIDGE_PID:-}" && "$fcidw" == "${WEB_CID:-}" && "$fcidb" == "${BRIDGE_CID:-}" ]]
}

cleanup_owned() {
  [[ "${OWNED:-0}" == 1 ]] || return 0
  OWNED=0
  log "正在停止本次启动的服务"
  if [[ -n "${WEB_PID:-}" ]]; then kill "$WEB_PID" 2>/dev/null || true; fi
  if [[ -n "${BRIDGE_PID:-}" ]]; then kill "$BRIDGE_PID" 2>/dev/null || true; fi
  if command -v docker >/dev/null 2>&1; then
    if [[ -n "${WEB_CID:-}" ]]; then docker rm -f "$WEB_CID" >/dev/null 2>&1 || true; fi
    if [[ -n "${BRIDGE_CID:-}" ]]; then docker rm -f "$BRIDGE_CID" >/dev/null 2>&1 || true; fi
  fi
  if session_matches_us; then rm -f "$SESSION"; fi
  wait 2>/dev/null || true
}

stop_saved() {
  load_session || true
  if [[ -n "${SAVED_WEB_PID:-}" ]]; then kill "$SAVED_WEB_PID" 2>/dev/null || true; fi
  if [[ -n "${SAVED_BRIDGE_PID:-}" ]]; then kill "$SAVED_BRIDGE_PID" 2>/dev/null || true; fi
  if command -v docker >/dev/null 2>&1; then
    if [[ -n "${SAVED_WEB_CID:-}" ]]; then docker rm -f "$SAVED_WEB_CID" >/dev/null 2>&1 || true; fi
    if [[ -n "${SAVED_BRIDGE_CID:-}" ]]; then docker rm -f "$SAVED_BRIDGE_CID" >/dev/null 2>&1 || true; fi
    docker rm -f popup-book-web popup-book-bridge >/dev/null 2>&1 || true
  fi
  rm -f "$SESSION"
  sleep 0.4
}

page_url() {
  if [[ "$MODE" == "slider" ]]; then
    printf 'http://127.0.0.1:%s/' "$PORT"
  else
    printf 'http://127.0.0.1:%s/?ws=ws://127.0.0.1:%s' "$PORT" "$WS_PORT"
  fi
}

print_status() {
  ok "静态页   $(page_url)"
  if [[ "$MODE" == "slider" ]]; then
    ok "模式     滑块。没有启动角度桥，拖页面底部滑块即可"
  elif [[ "$MODE" == "fake" ]]; then
    ok "角度桥   ws://127.0.0.1:${WS_PORT}   （假数据 0→130→0）"
    ok "健康检查 http://127.0.0.1:${HTTP_PORT}/health"
    ok "绿灯路径 打开上面的地址即可，不必刷新。按钮是「■ 停止演示」，书跟着 0→130→0。再点一次交给滑块"
  else
    ok "角度桥   ws://127.0.0.1:${WS_PORT}   （宿主机上的真实合页）"
    ok "健康检查 http://127.0.0.1:${HTTP_PORT}/health"
    ok "说明     实机合页直接驱动书，不会自动打开演示。MacBook HID 不进 Docker"
  fi
  if [[ "$CHECK_V6" == 1 ]]; then
    ok "localhost http://localhost:${PORT}/  同样可用（::1 和 127.0.0.1 都在听）"
  fi
}

maybe_open_browser() {
  [[ "${POPUP_OPEN_BROWSER:-}" == "1" ]] || return 0
  local url
  url="$(page_url)"
  if command -v open >/dev/null 2>&1; then
    open "$url" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$url" >/dev/null 2>&1 || true
  else
    log "POPUP_OPEN_BROWSER=1，但这台机器没有 open 或 xdg-open：${url}"
  fi
}

endpoints_ready() {
  web_ok "$PORT" || return 1
  if [[ "$CHECK_V6" == 1 ]] && ! web_ok_host "::1" "$PORT"; then return 1; fi
  if [[ "$MODE" == "slider" ]]; then return 0; fi
  ws_probe "$WS_PORT" handshake "127.0.0.1" || return 1
  health_ok "$HTTP_PORT" || return 1
  if [[ "$CHECK_V6" == 1 ]]; then
    ws_probe "$WS_PORT" handshake "::1" || return 1
    health_ok_host "::1" "$HTTP_PORT" || return 1
  fi
}

wait_healthy() {
  local i
  for i in $(seq 1 40); do
    if endpoints_ready; then return 0; fi
    if [[ -n "${WEB_PID:-}" ]] && ! kill -0 "$WEB_PID" 2>/dev/null; then
      log "静态服务提前退出。日志："
      tail -n 30 "$RUN_DIR/web.log" >&2 || true
      return 1
    fi
    if [[ -n "${BRIDGE_PID:-}" ]] && ! kill -0 "$BRIDGE_PID" 2>/dev/null; then
      log "角度桥提前退出。日志："
      tail -n 30 "$RUN_DIR/bridge.log" >&2 || true
      return 1
    fi
    sleep 0.25
  done
  log "健康检查超时。静态日志 / 桥日志："
  tail -n 20 "$RUN_DIR/web.log" >&2 || true
  tail -n 20 "$RUN_DIR/bridge.log" >&2 || true
  return 1
}

ensure_venv() {
  local req="$1"
  local py="$ROOT/backend/.venv/bin/python"
  local pip="$ROOT/backend/.venv/bin/pip"
  local need_install=0
  if [[ ! -x "$py" ]]; then
    need_install=1
  elif ! "$py" -c "import websockets" >/dev/null 2>&1; then
    need_install=1
  elif [[ "$req" == *sensor* ]] && ! "$py" -c "import pybooklid" >/dev/null 2>&1; then
    need_install=1
  fi
  if [[ "$need_install" == 0 ]]; then
    PY="$py"
    return 0
  fi
  confirm "创建 backend/.venv 并安装 ${req}？" || die "缺少 Python 依赖，已取消"
  if [[ ! -x "$py" ]]; then
    python3 -m venv "$ROOT/backend/.venv" \
      || die "创建 venv 失败。Debian/Ubuntu 请先安装 python3-venv"
  fi
  "$pip" install -r "$ROOT/backend/$req"
  PY="$py"
}

ensure_hidapi() {
  [[ "$(uname -s)" == "Darwin" ]] || die "真实合页只在 macOS 上。当前是 $(uname -s)。请用 ./start.sh --fake 或 --slider"
  if command -v brew >/dev/null 2>&1; then
    if brew --prefix hidapi >/dev/null 2>&1; then
      return 0
    fi
    confirm "安装 hidapi（brew install hidapi）？" || die "没有 hidapi，已取消"
    brew install hidapi
    return 0
  fi
  die "需要 Homebrew 才能安装 hidapi：https://brew.sh ，然后 brew install hidapi"
}

prepare_images() {
  if ! docker image inspect python:3.12-alpine >/dev/null 2>&1; then
    confirm "拉取基础镜像 python:3.12-alpine？" || return 1
    docker pull python:3.12-alpine || return 1
  fi
  if ! docker image inspect popup-book-web:local >/dev/null 2>&1; then
    confirm "构建镜像 popup-book-web:local？" || return 1
    docker build -f "$ROOT/docker/Dockerfile.web" -t popup-book-web:local "$ROOT" || return 1
  fi
  if [[ "$MODE" == "fake" ]]; then
    if ! docker image inspect popup-book-bridge:local >/dev/null 2>&1; then
      confirm "构建镜像 popup-book-bridge:local？" || return 1
      docker build -f "$ROOT/docker/Dockerfile.bridge" -t popup-book-bridge:local "$ROOT" || return 1
    fi
  fi
}

health_ok_host() {
  local host="$1" port="$2" url body
  if [[ "$host" == "::1" ]]; then
    url="http://[::1]:${port}/health"
  else
    url="http://${host}:${port}/health"
  fi
  body="$(curl -g -fsS --max-time 2 "$url" 2>/dev/null || true)"
  [[ "$body" == *'"ok": true'* ]]
}

health_ok() { health_ok_host "127.0.0.1" "$1"; }

same_request() {
  load_session || return 1
  [[ "$SAVED_MODE" == "$MODE" && "$SAVED_PORT" == "$PORT" && "$SAVED_WS_PORT" == "$WS_PORT" && "$SAVED_HTTP_PORT" == "$HTTP_PORT" ]]
}

already_healthy() {
  web_ok "$PORT" || return 1
  if [[ "$MODE" == "slider" ]]; then return 0; fi
  ws_probe "$WS_PORT" handshake && health_ok "$HTTP_PORT"
}

run_test_suite() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --yes) YES=1 ;;
      -h|--help)
        cat <<'EOF'
用法: ./start.sh test [--yes]

依次跑 ESLint、tsc（checkJs）、node 单元测试、Python 单元测试、无头浏览器冒烟。
缺 node_modules 或 Python 测试依赖时会询问；--yes 直接安装。
EOF
        exit 0
        ;;
      *) die "test 不认识：$1（试试 ./start.sh test --help）" ;;
    esac
    shift
  done
  command -v node >/dev/null 2>&1 || die "需要 node"
  command -v npm >/dev/null 2>&1 || die "需要 npm"
  mkdir -p "$RUN_DIR"
  if [[ ! -x "$ROOT/node_modules/.bin/eslint" || ! -x "$ROOT/node_modules/.bin/tsc" ]]; then
    confirm "安装前端检查依赖（npm install）？" || die "没有 eslint / tsc，已取消"
    npm install
  fi
  ensure_venv "requirements.txt"
  if ! "$PY" -c "import playwright, PIL" >/dev/null 2>&1; then
    confirm "安装 tests/requirements.txt（playwright、pillow）？" || die "没有浏览器测试依赖，已取消"
    "$ROOT/backend/.venv/bin/pip" install -r "$ROOT/tests/requirements.txt"
  fi
  if [[ -x /usr/bin/google-chrome ]]; then
    export CHROME=/usr/bin/google-chrome
  elif command -v chromium >/dev/null 2>&1; then
    export CHROME="$(command -v chromium)"
  else
    log "本机没有 Chrome，安装 Playwright 自带的 Chromium"
    "$PY" -m playwright install chromium
  fi
  log "ESLint"
  "$ROOT/node_modules/.bin/eslint" frontend/js tests/unit
  log "tsc --checkJs"
  "$ROOT/node_modules/.bin/tsc" -p "$ROOT/tsconfig.json" --noEmit --pretty false
  log "node --test"
  node --test "$ROOT"/tests/unit/*.test.js
  log "python unittest"
  PYTHONPATH="$ROOT/backend" "$PY" -m unittest discover -s "$ROOT/tests/unit" -p 'test_*.py'
  local tport=8133 started=0
  if ! web_ok "$tport"; then
    if port_busy "$tport"; then die "端口 ${tport} 被占用，而且不是这本书的页面"; fi
    python3 "$ROOT/backend/static_server.py" --port "$tport" --directory "$ROOT/frontend" --bind loopback >"$RUN_DIR/test-web.log" 2>&1 &
    started=$!
    local i
    for i in $(seq 1 40); do web_ok "$tport" && break; sleep 0.1; done
    web_ok "$tport" || { kill "$started" 2>/dev/null || true; die "测试用静态页没有起来"; }
  fi
  log "端到端冒烟 http://127.0.0.1:${tport}/"
  local rc=0
  POPUP_BASE="http://127.0.0.1:${tport}/index.html" POPUP_WS=18665 POPUP_HTTP=18666 \
    "$PY" "$ROOT/tests/e2e/smoke.py" || rc=$?
  if [[ "$rc" == 0 ]]; then
    log "分享卡冒烟 http://127.0.0.1:${tport}/"
    POPUP_BASE="http://127.0.0.1:${tport}/index.html" \
      "$PY" "$ROOT/tests/e2e/share_card.py" || rc=$?
  fi
  if [[ "$rc" == 0 ]]; then
    log "换季补播冒烟 http://127.0.0.1:${tport}/"
    POPUP_BASE="http://127.0.0.1:${tport}/index.html" \
      "$PY" "$ROOT/tests/e2e/season_catchup.py" || rc=$?
  fi
  if [[ "$started" != 0 ]]; then kill "$started" 2>/dev/null || true; wait "$started" 2>/dev/null || true; fi
  if [[ "$rc" != 0 ]]; then die "冒烟失败（退出码 ${rc}）"; fi
  ok "lint、类型检查、单元测试、冒烟都过了"
}

LOG_FILE="$ROOT/logs/popup-book.log"
PID_FILE="$ROOT/logs/popup-book.pid"

stop_background() {
  local pid=""
  if [[ -f "$PID_FILE" ]]; then
    pid="$(tr -cd '0-9' < "$PID_FILE")"
  fi
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    log "停止 pid ${pid}"
    kill -TERM "$pid" 2>/dev/null || true
    local i
    for i in $(seq 1 40); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.1
    done
    if kill -0 "$pid" 2>/dev/null; then
      kill -KILL "$pid" 2>/dev/null || true
    fi
  elif [[ -n "$pid" ]]; then
    log "pid ${pid} 已经不在，按 session 再清一次"
  fi
  stop_saved
  rm -f "$PID_FILE"
  ok "已停止。日志仍在 logs/popup-book.log"
}

launch_background() {
  mkdir -p "$ROOT/logs"
  local offset=0
  if [[ -f "$LOG_FILE" ]]; then
    offset="$(wc -c < "$LOG_FILE")"
    offset="$((offset))"
  fi
  printf '\n---- %s ----\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" >> "$LOG_FILE"
  POPUP_DAEMON=1 nohup "$ROOT/start.sh" "$@" >> "$LOG_FILE" 2>&1 &
  local child=$!
  disown "$child" 2>/dev/null || true
  local i ready=0
  for i in $(seq 1 240); do
    if [[ -f "$LOG_FILE" ]] && tail -c +$((offset + 1)) "$LOG_FILE" | grep -q 'POPUP_READY'; then
      ready=1
      break
    fi
    if ! kill -0 "$child" 2>/dev/null; then
      break
    fi
    sleep 0.25
  done
  if [[ "$ready" != 1 ]]; then
    log "后台没有进入就绪。这一次的日志："
    tail -c +$((offset + 1)) "$LOG_FILE" >&2 || true
    return 1
  fi
  tail -c +$((offset + 1)) "$LOG_FILE" | grep '^\[' | grep -v 'POPUP_READY' || true
  local pid=""
  if [[ -f "$PID_FILE" ]]; then
    pid="$(tr -cd '0-9' < "$PID_FILE")"
  fi
  if kill -0 "$child" 2>/dev/null; then
    ok "已转到后台（pid ${pid:-$child}）。停止：./start.sh stop"
  else
    ok "服务已在跑。停止：./start.sh stop"
  fi
  ok "日志 logs/popup-book.log"
  return 0
}

if [[ "${1:-}" == "stop" ]]; then
  stop_background
  exit 0
fi

if [[ "${1:-}" == "test" ]]; then
  shift
  run_test_suite "$@"
  exit 0
fi

for _arg in "$@"; do
  if [[ "$_arg" == "-h" || "$_arg" == "--help" ]]; then
    usage
    exit 0
  fi
done
if [[ -z "${POPUP_DAEMON:-}" && -z "${POPUP_FOREGROUND:-}" ]]; then
  launch_background "$@" || exit 1
  exit 0
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --slider) MODE="slider" ;;
    --fake) MODE="fake" ;;
    --sensor) MODE="sensor" ;;
    --yes) YES=1 ;;
    --no-docker) DOCKER_MODE="no" ;;
    --docker) DOCKER_MODE="yes" ;;
    --restart) RESTART=1 ;;
    --port)
      shift
      PORT="${1:-}"
      is_int "$PORT" || die "--port 需要数字"
      ;;
    --ws-port)
      shift
      WS_PORT="${1:-}"
      is_int "$WS_PORT" || die "--ws-port 需要数字"
      ;;
    --http-port)
      shift
      HTTP_PORT="${1:-}"
      is_int "$HTTP_PORT" || die "--http-port 需要数字"
      ;;
    --hz)
      shift
      HZ="${1:-}"
      ;;
    --smooth)
      shift
      SMOOTH="${1:-}"
      ;;
    --offset)
      shift
      OFFSET="${1:-}"
      ;;
    *) die "未知参数：$1（试试 ./start.sh --help）" ;;
  esac
  shift
done

if [[ -n "${POPUP_DAEMON:-}" ]]; then
  YES=1
fi

[[ "$DOCKER_MODE" == "yes" && "$MODE" == "sensor" ]] && log "真实合页桥仍在宿主机运行；Docker 只提供静态页"
if [[ "$DOCKER_MODE" != "auto" && "$DOCKER_MODE" != "yes" && "$DOCKER_MODE" != "no" ]]; then
  die "内部错误：DOCKER_MODE"
fi

if [[ -z "$HTTP_PORT" ]]; then HTTP_PORT=$((WS_PORT + 1)); fi
if [[ "$MODE" != "slider" && ( "$HTTP_PORT" == "$PORT" || "$HTTP_PORT" == "$WS_PORT" ) ]]; then
  die "健康检查端口 ${HTTP_PORT} 和页面或 WebSocket 撞了"
fi

command -v python3 >/dev/null 2>&1 || die "需要 python3"
command -v curl >/dev/null 2>&1 || die "需要 curl（用来做健康检查）"
mkdir -p "$RUN_DIR"

case "$DOCKER_MODE" in
  no) TRANSPORT="host" ;;
  yes)
    have_docker || die "指定了 --docker，但 Docker 不可用（没有 docker 命令，或守护进程没起来）"
    TRANSPORT="docker"
    ;;
  auto)
    if have_docker; then
      TRANSPORT="docker"
    else
      TRANSPORT="host"
      log "没有可用的 Docker，改用本机 python"
    fi
    ;;
esac

if same_request && already_healthy && [[ "$RESTART" != 1 ]]; then
  if ipv6_loopback && web_ok_host "::1" "$PORT"; then CHECK_V6=1; fi
  ok "已经在运行（${MODE}，${TRANSPORT}），不重复启动"
  print_status
  maybe_open_browser
  printf '[start] POPUP_READY\n'
  exit 0
fi

if [[ -f "$SESSION" ]]; then
  if [[ "$RESTART" == 1 ]]; then
    log "按 --restart 停掉上一次由 start.sh 拉起的服务"
  elif same_request; then
    log "上次的服务不健康，重新启动"
  else
    log "切换模式或端口，停掉上一次由 start.sh 拉起的服务"
  fi
  stop_saved
elif [[ "$RESTART" == 1 ]]; then
  stop_saved
fi

if port_busy "$PORT"; then
  die "端口 ${PORT} 已被其他程序占用。换 --port，或确认那就是上次的 start.sh 后再用 --restart"
fi
if [[ "$MODE" != "slider" ]] && port_busy "$WS_PORT"; then
  die "端口 ${WS_PORT} 已被其他程序占用。换 --ws-port，或用 --restart 停掉本脚本自己的桥"
fi
if [[ "$MODE" != "slider" ]] && port_busy "$HTTP_PORT"; then
  die "端口 ${HTTP_PORT} 已被其他程序占用。换 --http-port"
fi

if [[ "$TRANSPORT" == "docker" ]]; then
  if ! prepare_images; then
    if [[ "$DOCKER_MODE" == "yes" ]]; then
      die "Docker 镜像没有准备好"
    fi
    log "不构建镜像，改用本机 python"
    TRANSPORT="host"
  fi
fi

if [[ "$MODE" == "sensor" ]]; then
  ensure_hidapi
  if [[ -z "${POPUP_BRIDGE_BIN:-}" ]]; then
    ensure_venv "requirements-sensor.txt"
  else
    log "POPUP_BRIDGE_BIN 已设置。--sensor 要求这个二进制带上 pybooklid；默认打包的桥只有 websockets"
  fi
fi

trap cleanup_owned EXIT
trap 'cleanup_owned; exit 130' INT TERM
OWNED=1

if [[ "$TRANSPORT" == "docker" ]]; then
  log "启动容器 popup-book-web"
  docker rm -f popup-book-web >/dev/null 2>&1 || true
  CHECK_V6=0
  if ipv6_loopback && WEB_CID="$(docker run -d --name popup-book-web -p "127.0.0.1:${PORT}:19081" -p "[::1]:${PORT}:19081" popup-book-web:local)"; then
    CHECK_V6=1
  else
    docker rm -f popup-book-web >/dev/null 2>&1 || true
    log "容器端口发不到 ::1，静态页只发布在 127.0.0.1。请打开脚本打印的地址"
    WEB_CID="$(docker run -d --name popup-book-web -p "127.0.0.1:${PORT}:19081" popup-book-web:local)"
    CHECK_V6=0
  fi
  if [[ "$MODE" == "fake" ]]; then
    log "启动容器 popup-book-bridge（假角度）"
    docker rm -f popup-book-bridge >/dev/null 2>&1 || true
    bridge_ok=0
    if [[ "$CHECK_V6" == 1 ]] && BRIDGE_CID="$(docker run -d --name popup-book-bridge -p "127.0.0.1:${WS_PORT}:19876" -p "[::1]:${WS_PORT}:19876" -p "127.0.0.1:${HTTP_PORT}:19877" -p "[::1]:${HTTP_PORT}:19877" popup-book-bridge:local --port 19876 --http-port 19877 --hz "$HZ" --smooth "$SMOOTH" --offset "$OFFSET")"; then
      bridge_ok=1
    fi
    if [[ "$bridge_ok" != 1 ]]; then
      docker rm -f popup-book-bridge >/dev/null 2>&1 || true
      if [[ "$CHECK_V6" == 1 ]]; then
        log "桥的端口发不到 ::1，只发布在 127.0.0.1"
      fi
      CHECK_V6=0
      BRIDGE_CID="$(docker run -d --name popup-book-bridge -p "127.0.0.1:${WS_PORT}:19876" -p "127.0.0.1:${HTTP_PORT}:19877" popup-book-bridge:local --port 19876 --http-port 19877 --hz "$HZ" --smooth "$SMOOTH" --offset "$OFFSET")"
    fi
  fi
else
  if ipv6_loopback; then CHECK_V6=1; else CHECK_V6=0; fi
  log "本机静态服务 ${PORT}（127.0.0.1 和 ::1）← frontend/"
  python3 "$ROOT/backend/static_server.py" --port "$PORT" --directory "$ROOT/frontend" --bind loopback >"$RUN_DIR/web.log" 2>&1 &
  WEB_PID=$!
fi

if [[ "$MODE" != "slider" && -z "${BRIDGE_CID}" ]]; then
  bridge_cmd=()
  if [[ -n "${POPUP_BRIDGE_BIN:-}" ]]; then
    [[ -x "$POPUP_BRIDGE_BIN" ]] || die "POPUP_BRIDGE_BIN 不是可执行文件：${POPUP_BRIDGE_BIN}"
    log "使用打包好的桥 ${POPUP_BRIDGE_BIN}"
    bridge_cmd=("$POPUP_BRIDGE_BIN")
  else
    if [[ "$MODE" == "fake" ]]; then
      ensure_venv "requirements.txt"
    fi
    bridge_cmd=("$PY" "$ROOT/backend/bridge.py")
  fi
  if [[ "$MODE" == "fake" ]]; then
    log "本机假角度桥 ws://127.0.0.1:${WS_PORT}"
    "${bridge_cmd[@]}" --fake --host 127.0.0.1 --port "$WS_PORT" --http-port "$HTTP_PORT" --hz "$HZ" --smooth "$SMOOTH" --offset "$OFFSET" >"$RUN_DIR/bridge.log" 2>&1 &
  else
    log "本机真实合页桥 ws://127.0.0.1:${WS_PORT}（不在 Docker 里）"
    "${bridge_cmd[@]}" --host 127.0.0.1 --port "$WS_PORT" --http-port "$HTTP_PORT" --hz "$HZ" --smooth "$SMOOTH" --offset "$OFFSET" >"$RUN_DIR/bridge.log" 2>&1 &
  fi
  BRIDGE_PID=$!
fi

if ! wait_healthy; then
  die "服务没有进入健康状态，已停止本次启动的进程"
fi

if [[ "$MODE" != "slider" ]]; then
  angle="$(ws_probe "$WS_PORT" angle || true)"
  if [[ "$angle" == *angle* ]]; then
    ok "桥已吐出一帧 ${angle}"
  else
    log "桥握手成功。这一拍还没读到角度 JSON（传感器可能暂时无数据）"
  fi
fi

write_session
mkdir -p "$ROOT/logs"
printf '%s\n' "$$" > "$PID_FILE"
print_status
maybe_open_browser
if [[ -n "${POPUP_FOREGROUND:-}" ]]; then
  log "留在前台。Ctrl-C 停止，或另开终端 ./start.sh stop"
else
  log "已在后台运行。停止：./start.sh stop"
fi
log "日志：logs/popup-book.log"
printf '[start] POPUP_READY\n'
while true; do
  if [[ -n "${WEB_PID:-}" ]] && ! kill -0 "$WEB_PID" 2>/dev/null; then
    log "静态服务退出了。最后日志："
    tail -n 30 "$RUN_DIR/web.log" >&2 || true
    exit 1
  fi
  if [[ -n "${BRIDGE_PID:-}" ]] && ! kill -0 "$BRIDGE_PID" 2>/dev/null; then
    log "角度桥退出了。最后日志："
    tail -n 30 "$RUN_DIR/bridge.log" >&2 || true
    exit 1
  fi
  if [[ -n "${WEB_CID:-}" ]]; then
    st="$(docker inspect -f '{{.State.Running}}' "$WEB_CID" 2>/dev/null || echo false)"
    [[ "$st" == "true" ]] || die "容器 popup-book-web 停了"
  fi
  if [[ -n "${BRIDGE_CID:-}" ]]; then
    st="$(docker inspect -f '{{.State.Running}}' "$BRIDGE_CID" 2>/dev/null || echo false)"
    [[ "$st" == "true" ]] || die "容器 popup-book-bridge 停了"
  fi
  sleep 1
done
