"""假角度：0 → 130 → 0，不碰硬件。"""

import math
import time

from sensors.base import AngleSource


class FakeSource(AngleSource):
    """每个方向大约 14 秒，两端用余弦自然停一下。"""

    name = "fake"
    mode = "fake"

    def __init__(self, period=28.0, clock=None):
        self.period = period
        self._clock = clock or time.time
        self.t0 = self._clock()

    def read(self):
        t = ((self._clock() - self.t0) % self.period) / self.period
        tri = 0.5 - 0.5 * math.cos(2 * math.pi * t)
        return 130.0 * tri

    def close(self):
        return None
