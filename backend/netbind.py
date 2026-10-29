"""把环回地址展开成 IPv4 + IPv6，避免 macOS 上 localhost 只打到 ::1。"""

import socket

_LOOPBACK = ("localhost", "127.0.0.1", "::1")


def ipv6_loopback():
    """本机能否把 TCP 绑到 ::1。"""
    try:
        sock = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
    except OSError:
        return False
    try:
        sock.bind(("::1", 0))
    except OSError:
        return False
    finally:
        sock.close()
    return True


def loopback_hosts(host):
    """环回别名展开成 127.0.0.1 和（可用时）::1。其它地址原样返回。

    0.0.0.0 / :: 保持单套接字，给容器里的通配监听用。
    """
    if host not in _LOOPBACK:
        return [host]
    hosts = ["127.0.0.1"]
    if ipv6_loopback():
        hosts.append("::1")
    return hosts
