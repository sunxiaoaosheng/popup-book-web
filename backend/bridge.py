#!/usr/bin/env python3
"""
bridge.py —— 把 MacBook 的合页(盖子)角度通过 WebSocket 广播给网页。

协议：每帧广播一条 JSON 文本，如  {"angle": 87.3}
默认地址：ws://localhost:8765

用法：
    python3 bridge.py            # 读真实传感器 (需要 pip install pybooklid websockets)
    python3 bridge.py --fake     # 假数据，来回扫动 0~130°，用来测试网页
    python3 bridge.py --hz 60 --offset -2 --smooth 0.4

关于传感器读取（诚实说明）：
  * 这里用的是 pybooklid 1.0.0 (PyPI) 的 LidSensor 类，API 是我读它的源码确认的：
        LidSensor(auto_connect=True)  # 找不到设备会抛 LidSensorError
        sensor.read_angle() -> Optional[float]   # 读失败返回 None，不抛异常
        sensor.disconnect()
  * 它的内部是 hidapi + 私有 HID Feature Report，只能在 macOS 上读；
    本脚本的传感器部分【没有在真实 Mac 上测过】，只在 Linux 里测过 --fake 模式。
  * 原始值被 pybooklid 当作 16 位整数的“度”，我额外做了范围合法性检查（0~360）。
"""
import argparse
import asyncio
import json
import math
import sys
import threading
import time

try:
    import websockets
except ImportError:
    sys.exit("缺少 websockets：请先 pip install websockets")


# ---------------------------------------------------------------- 角度来源
class FakeSource:
    """假数据：0 -> 130 -> 0 来回扫动，每个方向 ~14 秒，两端各停顿一会儿，并在 90° 附近放慢。"""

    def __init__(self, period=28.0):
        self.period = period
        self.t0 = time.time()
        self.name = "fake"

    def read(self):
        t = ((time.time() - self.t0) % self.period) / self.period  # 0..1
        # 0..0.5 打开，0.5..1 合上；用余弦让两端自然停顿
        tri = 0.5 - 0.5 * math.cos(2 * math.pi * t)  # 0->1->0
        return 130.0 * tri

    def close(self):
        pass


class PyBookLidSource:
    """用 pybooklid 读真实传感器。后台线程以接近 hz 的频率读，主循环取最新值。"""

    def __init__(self, hz):
        try:
            from pybooklid import LidSensor, LidSensorError  # noqa: F401
        except Exception as e:  # ImportError，或 hidapi 动态库缺失
            raise RuntimeError(
                f"无法导入 pybooklid：{e}\n"
                "  请执行：pip install -r backend/requirements-sensor.txt\n"
                "  若提示找不到 hidapi：brew install hidapi\n"
                "  或直接 ./start.sh --sensor"
            )
        from pybooklid import LidSensor, LidSensorError

        self._LidSensorError = LidSensorError
        try:
            self.sensor = LidSensor()  # auto_connect=True，失败抛 LidSensorError
        except LidSensorError as e:
            raise RuntimeError(f"找不到/打不开盖角传感器：{e}")
        self.name = "pybooklid"
        self._latest = None
        self._last_ok = 0.0
        self._stop = False
        self._interval = 1.0 / max(hz, 1)
        self._th = threading.Thread(target=self._loop, daemon=True)
        self._th.start()

    def _loop(self):
        while not self._stop:
            t = time.time()
            try:
                a = self.sensor.read_angle()  # 失败时返回 None
            except Exception:
                a = None
            if a is not None and 0.0 <= a <= 360.0:
                self._latest = a
                self._last_ok = t
            time.sleep(max(0.0, self._interval - (time.time() - t)))

    def read(self):
        # 超过 1 秒没有有效读数 -> 返回 None（调用方不广播）
        if self._latest is None or time.time() - self._last_ok > 1.0:
            return None
        return self._latest

    def close(self):
        self._stop = True
        try:
            self.sensor.disconnect()
        except Exception:
            pass


# ---------------------------------------------------------------- 服务器
async def main_async(args):
    if args.fake:
        src = FakeSource()
        print("[bridge] --fake 模式：广播 0~130° 的来回扫动")
    else:
        try:
            src = PyBookLidSource(args.hz)
        except RuntimeError as e:
            print(f"[bridge] 传感器不可用：\n{e}\n", file=sys.stderr)
            print(
                "[bridge] 可先用  python3 bridge.py --fake  测试网页，"
                "或直接用网页上的滑块。更多排查见 README.md。",
                file=sys.stderr,
            )
            return 2
        print("[bridge] 已连接 pybooklid 传感器")

    clients = set()

    async def handler(ws, *_):  # 兼容新旧 websockets：旧版会多传一个 path 参数
        clients.add(ws)
        print(f"[bridge] 网页已连接 ({len(clients)} 个客户端)")
        try:
            async for _ in ws:  # 忽略客户端发来的内容
                pass
        except Exception:
            pass
        finally:
            clients.discard(ws)
            print(f"[bridge] 网页已断开 ({len(clients)} 个客户端)")

    try:
        from websockets.asyncio.server import serve  # websockets >= 13
    except ImportError:
        serve = websockets.serve  # 旧版

    def broadcast(msg):
        if not clients:
            return
        try:
            websockets.broadcast(set(clients), msg)
        except AttributeError:  # 非常老的版本
            dead = []
            for c in list(clients):
                try:
                    asyncio.ensure_future(c.send(msg))
                except Exception:
                    dead.append(c)
            for c in dead:
                clients.discard(c)
        except Exception as e:
            # 单个断开的客户端不能把广播循环打死
            print(f"[bridge] 广播失败：{e}", file=sys.stderr)

    interval = 1.0 / args.hz
    smoothed = None
    last_print = 0.0
    no_data_warned = False

    async with serve(handler, args.host, args.port):
        print(f"[bridge] WebSocket 监听 ws://{args.host}:{args.port}  ({args.hz:g} Hz)  Ctrl+C 退出")
        try:
            next_t = time.time()
            while True:
                raw = src.read()
                if raw is None:
                    if not no_data_warned:
                        print("[bridge] 暂时读不到有效角度（传感器无响应？）", file=sys.stderr)
                        no_data_warned = True
                else:
                    no_data_warned = False
                    a = raw + args.offset
                    if args.smooth > 0:  # 简单一阶低通：smooth 越大越“滞后”
                        smoothed = a if smoothed is None else smoothed + (a - smoothed) * (1 - args.smooth)
                        a = smoothed
                    a = max(0.0, min(args.clamp, a))
                    broadcast(json.dumps({"angle": round(a, 2)}))
                    if time.time() - last_print > 1.0:
                        print(f"[bridge] angle = {a:6.1f}°  (raw {raw:.1f})", end="\r", flush=True)
                        last_print = time.time()
                next_t += interval
                delay = next_t - time.time()
                if delay < -0.5:  # 落后太多就重置节拍
                    next_t = time.time()
                    delay = 0
                await asyncio.sleep(max(0.0, delay))
        finally:
            src.close()


def main():
    p = argparse.ArgumentParser(description="MacBook 盖角 -> WebSocket 桥")
    p.add_argument("--fake", action="store_true", help="不读传感器，广播来回扫动的假角度")
    p.add_argument("--host", default="localhost", help="监听地址，默认 localhost")
    p.add_argument("--port", type=int, default=8765, help="端口，默认 8765")
    p.add_argument("--hz", type=float, default=45, help="广播频率，默认 45 (建议 30~60)")
    p.add_argument("--offset", type=float, default=0.0, help="给角度加偏移（校准用），默认 0")
    p.add_argument("--clamp", type=float, default=180.0, help="最大角度上限，默认 180（网页自己会限制到 130）")
    p.add_argument("--smooth", type=float, default=0.0, help="低通平滑系数 0~0.95，默认 0（不平滑）")
    args = p.parse_args()
    args.hz = min(max(args.hz, 5), 120)
    try:
        sys.exit(asyncio.run(main_async(args)) or 0)
    except KeyboardInterrupt:
        print("\n[bridge] 已退出")


if __name__ == "__main__":
    main()
