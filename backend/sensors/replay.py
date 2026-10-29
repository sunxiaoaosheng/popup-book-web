"""按时间轴重放角度。一行一个 JSON：{"t": 秒, "angle": 度}，t 从 0 递增。

可另写 "light"（勒克斯）。没有或不是有限数字时，这一行不带环境光。
"""

import json

from protocol import optional_light
from sensors.base import AngleSource


class ReplaySource(AngleSource):
    name = "replay"
    mode = "replay"

    def __init__(self, path, clock=None):
        self._rows = []
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                obj = json.loads(line)
                light = optional_light(obj.get("light")) if isinstance(obj, dict) else None
                self._rows.append((float(obj["t"]), float(obj["angle"]), light))
        if not self._rows:
            raise RuntimeError(f"回放文件是空的：{path}")
        self._rows.sort(key=lambda row: row[0])
        self._clock = clock or __import__("time").monotonic
        self._t0 = self._clock()
        self._i = 0
        self.path = path

    def read(self):
        elapsed = self._clock() - self._t0
        while self._i + 1 < len(self._rows) and self._rows[self._i + 1][0] <= elapsed:
            self._i += 1
        return self._rows[self._i][1]

    def read_light(self):
        if not self._rows:
            return None
        return self._rows[self._i][2]

    def close(self):
        return None
