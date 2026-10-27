"""GET /health。和 WebSocket 分开，避免绑在某一版 websockets 的握手钩子上。"""

import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from protocol import health_body


class Status:
    def __init__(self, mode, hz):
        self.mode = mode
        self.hz = hz
        self.clients = 0
        self.last_angle = None
        self.last_at = None
        self.seq = 0
        self._lock = threading.Lock()

    def set_clients(self, n):
        with self._lock:
            self.clients = n

    def note_angle(self, angle, seq):
        with self._lock:
            self.last_angle = angle
            self.last_at = time.monotonic()
            self.seq = seq

    def note_seq(self, seq):
        with self._lock:
            self.seq = seq

    def payload(self):
        with self._lock:
            age = None if self.last_at is None else int((time.monotonic() - self.last_at) * 1000)
            return health_body(self.mode, self.clients, self.last_angle, age, self.seq, self.hz)


def serve_health(host, port, status):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path.split("?", 1)[0] != "/health":
                body = b""
                self.send_response(404)
            else:
                body = json.dumps(status.payload(), ensure_ascii=False).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if body:
                self.wfile.write(body)

        def log_message(self, fmt, *args):
            return

    try:
        httpd = ThreadingHTTPServer((host, port), Handler)
    except OSError as e:
        print(f"[bridge] 健康检查端口 {port} 不可用：{e}", file=sys.stderr)
        return None
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd
