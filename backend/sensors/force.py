"""
可选的 Force Touch 静置力度。

这不是角度适配器，也不代替合页。read() 返回 0..1 的归一化力度，
没有设备或任何失败都返回 None。广播遇到 None 就省略 weight 字段。
"""

import os
import subprocess
import sys
import threading
import time


class WeightGate:
    """低频往帧上放力度：变化够大才发，否则最多每 keep_sec 秒带一次。"""

    def __init__(self, epsilon=0.03, keep_sec=0.5):
        self.epsilon = float(epsilon)
        self.keep_sec = float(keep_sec)
        self.last = None
        self.last_at = None

    def update(self, sample, now):
        if sample is None:
            return None
        try:
            w = float(sample)
        except (TypeError, ValueError):
            return None
        if w != w or w == float("inf") or w == float("-inf"):
            return None
        if w < 0.0:
            w = 0.0
        if w > 1.0:
            w = 1.0
        send = (
            self.last is None
            or abs(w - self.last) >= self.epsilon
            or self.last_at is None
            or now - self.last_at >= self.keep_sec
        )
        if not send:
            return None
        self.last = w
        self.last_at = now
        return round(w, 2)


class _AdapterWeight:
    """回放或别的角度源自己带了 read_weight 时，不再去开触控板。"""

    def __init__(self, fn):
        self._fn = fn

    def read(self):
        try:
            return self._fn()
        except Exception:
            return None

    def close(self):
        return None


class ForceTouch:
    """
    macOS 上把私有 Multitouch 读数放进子进程。
    子进程退出、框架不在、或者根本不是 Darwin：read() 一直是 None，合页照旧。
    """

    def __init__(self):
        self._value = None
        self._at = None
        self._live = False
        self._stop = False
        self._proc = None
        self._th = None
        self._lock = threading.Lock()
        if sys.platform != "darwin":
            return
        try:
            self._start()
        except Exception:
            self._live = False
            self.close()

    def _start(self):
        helper = os.path.join(os.path.dirname(os.path.abspath(__file__)), "force_touch_helper.py")
        self._proc = subprocess.Popen(
            [sys.executable, "-u", helper],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL,
            text=True,
            bufsize=1,
        )
        self._th = threading.Thread(target=self._pump, name="force-touch", daemon=True)
        self._th.start()

    def _pump(self):
        proc = self._proc
        if proc is None or proc.stdout is None:
            return
        try:
            for line in proc.stdout:
                if self._stop:
                    break
                text = line.strip()
                if not text:
                    continue
                try:
                    v = float(text)
                except ValueError:
                    continue
                if v != v or v < 0.0 or v == float("inf"):
                    continue
                if v > 1.0:
                    v = 1.0
                with self._lock:
                    self._value = v
                    self._at = time.monotonic()
                    self._live = True
        except Exception:
            pass
        with self._lock:
            if proc.poll() is not None:
                self._live = False

    def read(self):
        if not self._live:
            return None
        with self._lock:
            value = self._value
            at = self._at
        if value is None or at is None:
            return None
        if time.monotonic() - at > 1.0:
            return 0.0
        return value

    def close(self):
        self._stop = True
        proc = self._proc
        if proc is not None and proc.poll() is None:
            try:
                proc.terminate()
            except Exception:
                pass
        th = self._th
        if th is not None and th.is_alive() and threading.current_thread() is not th:
            th.join(timeout=0.4)
        if proc is not None and proc.poll() is None:
            try:
                proc.kill()
            except Exception:
                pass
            try:
                proc.wait(timeout=0.3)
            except Exception:
                pass
        self._proc = None
        self._live = False


def open_weight(source):
    """有 read_weight 就用它。否则尝试触控板，失败也返回一个永远读到 None 的对象。"""
    fn = getattr(source, "read_weight", None)
    if callable(fn):
        return _AdapterWeight(fn)
    return ForceTouch()
