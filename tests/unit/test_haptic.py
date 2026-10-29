"""触控板轻点：只认固定的一下，没有旋钮和音量。做不到时连接还在。"""
import json
import os
import socket
import subprocess
import sys
import time
import unittest
import urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "backend"))

from haptic import handle_client_text, parse_client_frame, pulse_trackpad  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BRIDGE = os.path.join(ROOT, "backend", "bridge.py")
WS_PORT = 17671
HTTP_PORT = 17672


class HapticMessageTest(unittest.TestCase):
    def test_only_a_fixed_tap(self):
        tap = parse_client_frame('{"v":1,"type":"haptic","pattern":"tap","gain":1,"volume":0.2,"knob":40}')
        self.assertEqual(tap, {"type": "haptic", "pattern": "tap"})
        self.assertNotIn("volume", tap)
        self.assertNotIn("knob", tap)
        omitted = parse_client_frame(b'{"type":"haptic"}')
        self.assertEqual(omitted["pattern"], "tap")

    def test_ignores_angles_knobs_and_junk(self):
        self.assertIsNone(parse_client_frame('{"v":1,"type":"angle","angle":90}'))
        self.assertIsNone(parse_client_frame('{"type":"haptic","pattern":"knob","volume":1}'))
        self.assertIsNone(parse_client_frame('{"type":"haptic","pattern":"rumble"}'))
        self.assertIsNone(parse_client_frame("nope"))
        self.assertIsNone(parse_client_frame(""))
        self.assertIsNone(parse_client_frame(None))

    def test_pulse_failure_does_not_raise(self):
        self.assertFalse(handle_client_text('{"type":"angle","angle":1}', lambda: True))
        self.assertTrue(handle_client_text('{"type":"haptic","pattern":"tap"}', lambda: True))

        def boom():
            raise RuntimeError("no trackpad")

        self.assertFalse(handle_client_text('{"type":"haptic"}', boom))

    def test_linux_has_no_trackpad_haptic(self):
        if sys.platform == "darwin":
            self.skipTest("macOS may actually have a trackpad")
        self.assertFalse(pulse_trackpad())
        self.assertFalse(pulse_trackpad())


def _handshake(port):
    sock = socket.create_connection(("127.0.0.1", port), 2)
    sock.settimeout(2)
    key = "dGhlIHNhbXBsZSBub25jZQ=="
    req = (
        f"GET / HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n"
        "Upgrade: websocket\r\nConnection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
    )
    sock.sendall(req.encode())
    data = b""
    while b"\r\n\r\n" not in data:
        data += sock.recv(256)
    if b" 101 " not in data.split(b"\r\n", 1)[0]:
        sock.close()
        raise AssertionError(data[:120])
    return sock


def _send_text(sock, text):
    payload = text.encode()
    mask = os.urandom(4)
    n = len(payload)
    header = bytearray([0x81, 0x80 | n])
    header.extend(mask)
    masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
    sock.sendall(bytes(header) + masked)


def _read_text(sock):
    for _ in range(8):
        hdr = sock.recv(2)
        if len(hdr) < 2:
            raise AssertionError("socket closed")
        opcode = hdr[0] & 0x0F
        ln = hdr[1] & 127
        if ln == 126:
            ln = int.from_bytes(sock.recv(2), "big")
        payload = b""
        while len(payload) < ln:
            payload += sock.recv(ln - len(payload))
        if opcode == 1:
            return json.loads(payload.decode())
    raise AssertionError("no text frame")


class HapticBridgeTest(unittest.TestCase):
    def test_client_tap_does_not_drop_the_angle_stream(self):
        proc = subprocess.Popen(
            [sys.executable, BRIDGE, "--fake", "--host", "127.0.0.1", "--port", str(WS_PORT), "--http-port", str(HTTP_PORT)],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        sock = None
        try:
            body = None
            for _ in range(40):
                if proc.poll() is not None:
                    raise AssertionError(proc.stdout.read())
                try:
                    with urllib.request.urlopen(f"http://127.0.0.1:{HTTP_PORT}/health", timeout=0.5) as res:
                        body = json.loads(res.read().decode())
                    break
                except Exception:
                    time.sleep(0.1)
            self.assertTrue(body and body.get("ok") and body.get("v") == 1)
            sock = _handshake(WS_PORT)
            first = _read_text(sock)
            self.assertIn(first["type"], ("angle", "heartbeat"))
            _send_text(sock, '{"v":1,"type":"haptic","pattern":"tap","volume":1,"knob":9}')
            _send_text(sock, '{"type":"haptic","pattern":"knob"}')
            time.sleep(0.08)
            frame = _read_text(sock)
            self.assertIn(frame["type"], ("angle", "heartbeat"))
            self.assertEqual(frame["v"], 1)
            with urllib.request.urlopen(f"http://127.0.0.1:{HTTP_PORT}/health", timeout=0.5) as res:
                again = json.loads(res.read().decode())
            self.assertTrue(again["ok"])
            self.assertGreaterEqual(again["clients"], 1)
        finally:
            if sock is not None:
                sock.close()
            proc.terminate()
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                proc.kill()
            if proc.stdout:
                proc.stdout.close()


if __name__ == "__main__":
    unittest.main()
