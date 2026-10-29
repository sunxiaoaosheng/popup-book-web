"""按时间轴重放角度。一行一个 JSON：{"t": 秒, "angle": 度}，t 从 0 递增。

可选的轻拍写在同一行或单独一行：{"t": 秒, "kind": "slap", "strength": 0.3}。
kind 是 slap / double-knock / triple-knock。波形字段即使出现也不保存。
"""

import json

from protocol import TAP_KINDS
from sensors.base import AngleSource


class ReplaySource(AngleSource):
    name = "replay"
    mode = "replay"

    def __init__(self, path, clock=None):
        self._rows = []
        self._taps = []
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                obj = json.loads(line)
                if "angle" not in obj and "kind" not in obj:
                    raise RuntimeError(f"回放行既没有角度也没有轻拍：{path}")
                t = float(obj["t"])
                if "angle" in obj:
                    self._rows.append((t, float(obj["angle"])))
                if "kind" in obj:
                    kind = obj["kind"]
                    if kind not in TAP_KINDS:
                        raise RuntimeError(f"不认识的轻拍：{kind}")
                    try:
                        strength = float(obj["strength"])
                    except (KeyError, TypeError, ValueError) as e:
                        raise RuntimeError(f"轻拍缺少力度：{path}") from e
                    if strength != strength:
                        raise RuntimeError("轻拍力度不是有限数字")
                    self._taps.append((t, kind, strength))
        if not self._rows:
            raise RuntimeError(f"回放文件是空的：{path}")
        self._rows.sort(key=lambda row: row[0])
        self._taps.sort(key=lambda row: row[0])
        self._clock = clock or __import__("time").monotonic
        self._t0 = self._clock()
        self._i = 0
        self._tap_i = 0
        self.path = path

    def read(self):
        elapsed = self._clock() - self._t0
        while self._i + 1 < len(self._rows) and self._rows[self._i + 1][0] <= elapsed:
            self._i += 1
        return self._rows[self._i][1]

    def pull_taps(self):
        elapsed = self._clock() - self._t0
        out = []
        while self._tap_i < len(self._taps) and self._taps[self._tap_i][0] <= elapsed:
            _t, kind, strength = self._taps[self._tap_i]
            self._tap_i += 1
            s = 0.0 if strength < 0 else 1.0 if strength > 1 else strength
            out.append({"kind": kind, "strength": s})
        return out

    def close(self):
        return None
