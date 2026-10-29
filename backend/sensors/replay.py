"""按时间轴重放角度。一行一个 JSON：{"t": 秒, "angle": 度}，t 从 0 递增。

可选 "weight"（0..1 的静置力度）。没有这个键时 read_weight() 返回 None，
广播就省略字段，不会把旧的回放当成空板。"""

import json

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
                weight = None
                if "weight" in obj and obj["weight"] is not None:
                    try:
                        weight = float(obj["weight"])
                    except (TypeError, ValueError):
                        weight = None
                self._rows.append((float(obj["t"]), float(obj["angle"]), weight))
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

    def read_weight(self):
        """跟最近一次 read() 同一行。没有 weight 键时是 None，不是 0。"""
        return self._rows[self._i][2]

    def close(self):
        return None
