"""macOS 上的 pybooklid 合页。这个文件没有在真机上跑过。"""

import threading
import time

from sensors.ambient import AmbientProbe
from sensors.base import AngleSource


class PyBookLidSource(AngleSource):
    """后台线程按 hz 读，read() 只返回最近一次落在 0~360 的值。超过 1 秒没有新值则 None。"""

    name = "pybooklid"
    mode = "sensor"

    def __init__(self, hz):
        try:
            from pybooklid import LidSensor, LidSensorError  # noqa: F401
        except Exception as e:
            raise RuntimeError(
                f"无法导入 pybooklid：{e}\n"
                "  请执行：pip install -r backend/requirements-sensor.txt\n"
                "  若提示找不到 hidapi：brew install hidapi\n"
                "  或直接 ./start.sh --sensor"
            )
        from pybooklid import LidSensor, LidSensorError

        try:
            self.sensor = LidSensor()
        except LidSensorError as e:
            raise RuntimeError(f"找不到/打不开盖角传感器：{e}")
        self._latest = None
        self._last_ok = 0.0
        self._stop = False
        self._interval = 1.0 / max(hz, 1)
        self._als = AmbientProbe()
        self._th = threading.Thread(target=self._loop, daemon=True)
        self._th.start()

    def read_light(self):
        try:
            return self._als.read()
        except Exception:
            return None

    def _loop(self):
        while not self._stop:
            t = time.time()
            try:
                a = self.sensor.read_angle()
            except Exception:
                a = None
            if a is not None and 0.0 <= a <= 360.0:
                self._latest = a
                self._last_ok = t
            time.sleep(max(0.0, self._interval - (time.time() - t)))

    def read(self):
        if self._latest is None or time.time() - self._last_ok > 1.0:
            return None
        return self._latest

    def close(self):
        self._stop = True
        try:
            self.sensor.disconnect()
        except Exception:
            pass
