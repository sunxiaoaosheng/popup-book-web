#!/usr/bin/env bash
# 一条命令拉起林间小屋：静态页，以及（按模式）合页角度桥。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

MODE="fake"
YES=0
DOCKER_MODE="auto"
RESTART=0
PORT=8000
WS_PORT=8765
HTTP_PORT=""
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
  --port N     静态页端口，默认 8000
  --ws-port N  角度桥端口，默认 8765
  --http-port N  桥的 HTTP 健康检查端口，默认是 ws 端口 + 1
  --hz N       桥的广播频率，默认 45
  --smooth N   桥的低通系数 0~0.95，默认 0
  --offset N   角度偏移（度），默认 0
  -h, --help   显示本说明

环境变量:
  POPUP_BRIDGE_BIN      可执行的桥。设置后本机桥用它，不再创建 backend/.venv。
  POPUP_OPEN_BROWSER=1  健康之后打开静态页（macOS 用 open，Linux 用 xdg-open）。

没有写 --docker / --no-docker 时：Docker 守护进程可用就用容器，否则用本机 python。
再执行一次相同模式：服务还健康就只打印地址并退出，不会占第二个端口。
Ctrl-C 只停掉这一次前台拉起的进程和容器。

命令:
  ./start.sh test [--yes]   ESLint、tsc、单元测试、无头浏览器冒烟

示例:
  ./start.sh
  ./start.sh --slider --port 8123
  ./start.sh --fake --no-docker --yes
  ./start.sh --sensor --smooth 0.5
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

port_busy() {
  python3 - "$1" <<'PY'
import socket, sys
s = socket.socket()
s.settimeout(0.4)
try:
    code = s.connect_ex(("127.0.0.1", int(sys.argv[1])))
finally:
    s.close()
sys.exit(0 if code == 0 else 1)
PY
}

web_ok() {
  local body
  body="$(curl -fsS --max-time 2 "http://127.0.0.1:${1}/index.html" 2>/dev/null || true)"
  [[ "$body" == *"./js/main.js"* ]]
}

# 握手成功返回 0。$2 为 angle 时再读一帧 JSON。
ws_probe() {
  local port="$1" want="${2:-handshake}"
  python3 - "$port" "$want" <<'PY'
import socket, sys
port, want = int(sys.argv[1]), sys.argv[2]
try:
    s = socket.create_connection(("127.0.0.1", port), 2)
except OSError:
    sys.exit(1)
s.settimeout(2)
key = "dGhlIHNhbXBsZSBub25jZQ=="
req = (
    f"GET / HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n"
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

print_status() {
  ok "静态页   http://127.0.0.1:${PORT}/"
  if [[ "$MODE" == "slider" ]]; then
    ok "模式     滑块。没有启动角度桥，拖页面底部滑块即可"
  elif [[ "$MODE" == "fake" ]]; then
    ok "角度桥   ws://127.0.0.1:${WS_PORT}   （假数据 0→130→0）"
    ok "健康检查 http://127.0.0.1:${HTTP_PORT}/health"
    ok "绿灯路径 打开上面的地址，左下圆点变绿，滑块禁用，书跟着动"
  else
    ok "角度桥   ws://127.0.0.1:${WS_PORT}   （宿主机上的真实合页）"
    ok "健康检查 http://127.0.0.1:${HTTP_PORT}/health"
    ok "说明     MacBook HID 不进 Docker。桥在本机，静态页可以在容器里"
  fi
}

maybe_open_browser() {
  [[ "${POPUP_OPEN_BROWSER:-}" == "1" ]] || return 0
  local url="http://127.0.0.1:${PORT}/"
  if command -v open >/dev/null 2>&1; then
    open "$url" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$url" >/dev/null 2>&1 || true
  else
    log "POPUP_OPEN_BROWSER=1，但这台机器没有 open 或 xdg-open：${url}"
  fi
}

wait_healthy() {
  local i
  for i in $(seq 1 40); do
    if web_ok "$PORT"; then
      if [[ "$MODE" == "slider" ]]; then return 0; fi
      if ws_probe "$WS_PORT" handshake && health_ok "$HTTP_PORT"; then return 0; fi
    fi
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

health_ok() {
  local body
  body="$(curl -fsS --max-time 2 "http://127.0.0.1:${1}/health" 2>/dev/null || true)"
  [[ "$body" == *'"ok": true'* ]]
}

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
    python3 -m http.server "$tport" --bind 127.0.0.1 --directory "$ROOT/frontend" >"$RUN_DIR/test-web.log" 2>&1 &
    started=$!
    local i
    for i in $(seq 1 40); do web_ok "$tport" && break; sleep 0.1; done
    web_ok "$tport" || { kill "$started" 2>/dev/null || true; die "测试用静态页没有起来"; }
  fi
  log "端到端冒烟 http://127.0.0.1:${tport}/"
  local rc=0
  POPUP_BASE="http://127.0.0.1:${tport}/index.html" POPUP_WS=18665 POPUP_HTTP=18666 \
    "$PY" "$ROOT/tests/e2e/smoke.py" || rc=$?
  if [[ "$started" != 0 ]]; then kill "$started" 2>/dev/null || true; wait "$started" 2>/dev/null || true; fi
  if [[ "$rc" != 0 ]]; then die "冒烟失败（退出码 ${rc}）"; fi
  ok "lint、类型检查、单元测试、冒烟都过了"
}

if [[ "${1:-}" == "test" ]]; then
  shift
  run_test_suite "$@"
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
  ok "已经在运行（${MODE}，${TRANSPORT}），不重复启动"
  print_status
  maybe_open_browser
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
  WEB_CID="$(docker run -d --name popup-book-web -p "127.0.0.1:${PORT}:8000" popup-book-web:local)"
  if [[ "$MODE" == "fake" ]]; then
    log "启动容器 popup-book-bridge（假角度）"
    docker rm -f popup-book-bridge >/dev/null 2>&1 || true
    BRIDGE_CID="$(docker run -d --name popup-book-bridge -p "127.0.0.1:${WS_PORT}:8765" -p "127.0.0.1:${HTTP_PORT}:8766" popup-book-bridge:local --port 8765 --http-port 8766 --hz "$HZ" --smooth "$SMOOTH" --offset "$OFFSET")"
  fi
else
  log "本机静态服务 127.0.0.1:${PORT}  ← frontend/"
  python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$ROOT/frontend" >"$RUN_DIR/web.log" 2>&1 &
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
print_status
maybe_open_browser
log "Ctrl-C 停止。日志在 .run/ （已 gitignore）"
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
