"""房间环境光。读不到就当没有：返回 None，不打印、不抛到桥外面。

假角度用 demo_lux 走一整圈白天 / 黄昏 / 夜，方便没有传感器时看效果。
POPUP_LUX 设成有限数字时，假角度和真实合页都改用这个固定勒克斯。
回放不看这个环境变量，只认文件里的 light。
"""

import math
import os

from protocol import optional_light


def pinned_lux():
    """POPUP_LUX。没设、或设坏了，都是 None。"""
    raw = os.environ.get("POPUP_LUX", "").strip()
    if not raw:
        return None
    try:
        return optional_light(float(raw))
    except ValueError:
        return None


def demo_lux(phase):
    """0 是夜（0 lx），半程是白天（900 lx），再回到夜。中间经过黄昏。"""
    turn = float(phase) % 1.0
    return 450.0 * (1.0 - math.cos(2.0 * math.pi * turn))


class AmbientProbe:
    """真实合页旁边的环境光。这台机器没有传感器时 read() 一直是 None。"""

    def read(self):
        return pinned_lux()


def read_source_light(source):
    """适配器这一拍的勒克斯。没有方法、或者读的时候出错，都当成没有。"""
    reader = getattr(source, "read_light", None)
    if not callable(reader):
        return None
    try:
        return reader()
    except Exception:
        return None
