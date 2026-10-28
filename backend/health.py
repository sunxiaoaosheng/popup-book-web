"""GET /health。和 WebSocket 分开，避免绑在某一版 websockets 的握手钩子上。"""

import json
import socket
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from netbind import loopback_hosts
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


def _health_server(host, port, handler):
    class Server(ThreadingHTTPServer):
        allow_reuse_address = True
        address_family = socket.AF_INET6 if ":" in host else socket.AF_INET
        daemon_threads = True

        def server_bind(self):
            if self.address_family == socket.AF_INET6:
                self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
            super().server_bind()

    httpd = Server((host, port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


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

    servers = []
    hosts = loopback_hosts(host)
    for one in hosts:
        try:
            servers.append(_health_server(one, port, Handler))
        except OSError as e:
            print(f"[bridge] 健康检查端口 {one}:{port} 不可用：{e}", file=sys.stderr)
            for started in servers:
                started.shutdown()
            return None
    shown = ", ".join(
        f"http://[{one}]:{port}/health" if ":" in one else f"http://{one}:{port}/health"
        for one in hosts
    )
    print(f"[bridge] 健康检查 {shown}")
    return servers[0]
