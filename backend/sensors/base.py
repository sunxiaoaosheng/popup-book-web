"""
角度适配器契约。

实现这四个成员，广播服务不用知道数据从哪来：

    name: str
        日志用的短名，例如 "fake"、"pybooklid"、"replay"。
    mode: str
        写进 /health 的模式。约定是 "fake"、"sensor"、"replay"。
    read() -> float | None
        当前角度（度）。暂时没有有效读数时返回 None，广播服务这一拍不发角度帧。
    close() -> None
        释放设备或文件。可以调用多次。

不要在 read() 里阻塞超过一帧。真实传感器自己起线程，read() 只取最新值。
"""


class AngleSource:
    name = "base"
    mode = "fake"

    def read(self):
        raise NotImplementedError

    def close(self):
        return None
