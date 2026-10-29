#!/usr/bin/env python3
"""前端静态文件。环回时同时听 127.0.0.1 和 ::1，并禁止缓存。

macOS 上 localhost 先解析到 ::1。只绑 127.0.0.1 时，浏览器并行拉 ES module
会有的请求打到 ::1（立刻拒绝）、有的落到 IPv4，页面要刷新好几次才齐。
"""

import argparse
import socket
import sys
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from netbind import loopback_hosts


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def _listen(host, port, handler):
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


def serve(port, directory, hosts):
    handler = partial(Handler, directory=directory)
    servers = []
    for host in hosts:
        try:
            servers.append(_listen(host, port, handler))
        except OSError as e:
            print(f"[web] 绑不上 {host}:{port}：{e}", file=sys.stderr)
            for started in servers:
                started.shutdown()
            return None
        shown = f"[{host}]" if ":" in host else host
        print(f"[web] http://{shown}:{port}/", flush=True)
    return servers


def main():
    p = argparse.ArgumentParser(description="林间小屋静态页")
    p.add_argument("--port", type=int, default=19081)
    p.add_argument("--directory", required=True)
    p.add_argument("--bind", choices=("loopback", "all"), default="loopback")
    args = p.parse_args()
    hosts = ["0.0.0.0"] if args.bind == "all" else loopback_hosts("127.0.0.1")
    if serve(args.port, args.directory, hosts) is None:
        return 1
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
