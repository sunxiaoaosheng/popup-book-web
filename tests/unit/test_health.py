"""假桥起来之后，/health 和一条 v1 角度帧都要在。"""
import json
import os
import socket
import subprocess
import sys
import time
import unittest
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BRIDGE = os.path.join(ROOT, "backend", "bridge.py")
WS_PORT = 17665
HTTP_PORT = 17666


def _read_text_frame(port):
    s = socket.create_connection(("127.0.0.1", port), 2)
    s.settimeout(2)
    key = "dGhlIHNhbXBsZSBub25jZQ=="
    req = (
        f"GET / HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n"
        "Upgrade: websocket\r\nConnection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
    )
    s.sendall(req.encode())
    data = b""
    while b"\r\n\r\n" not in data:
        data += s.recv(256)
    if b" 101 " not in data.split(b"\r\n", 1)[0]:
        s.close()
        raise AssertionError(data[:120])
    for _ in range(8):
        hdr = s.recv(2)
        opcode = hdr[0] & 0x0F
        ln = hdr[1] & 127
        if ln == 126:
            ln = int.from_bytes(s.recv(2), "big")
        payload = b""
        while len(payload) < ln:
            payload += s.recv(ln - len(payload))
        if opcode == 1:
            s.close()
            return json.loads(payload.decode())
    s.close()
    raise AssertionError("no text frame")


class HealthTest(unittest.TestCase):
    def test_fake_bridge_health_and_frame(self):
        proc = subprocess.Popen(
            [sys.executable, BRIDGE, "--fake", "--host", "127.0.0.1", "--port", str(WS_PORT), "--http-port", str(HTTP_PORT)],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
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
            self.assertIsNotNone(body)
            self.assertTrue(body["ok"])
            self.assertEqual(body["mode"], "fake")
            self.assertEqual(body["v"], 1)
            self.assertIn("clients", body)
            self.assertIn("lastAngleAgeMs", body)
            frame = _read_text_frame(WS_PORT)
            self.assertEqual(frame["v"], 1)
            self.assertIn(frame["type"], ("angle", "heartbeat"))
            self.assertIsInstance(frame["seq"], int)
            self.assertGreaterEqual(frame["seq"], 1)
            self.assertIsInstance(frame["t"], (int, float))
            if frame["type"] == "angle":
                self.assertIsInstance(frame["angle"], (int, float))
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                proc.kill()
            if proc.stdout:
                proc.stdout.close()


if __name__ == "__main__":
    unittest.main()
