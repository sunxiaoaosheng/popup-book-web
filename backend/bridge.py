#!/usr/bin/env python3
"""
bridge.py —— 选择一个角度适配器，交给广播服务。

协议 v1 和 GET /health 没变，说明见 docs/PROTOCOL.md。
适配器契约见 docs/ADAPTERS.md。

    python3 bridge.py --fake
    python3 bridge.py --replay trace.jsonl
    python3 bridge.py            # 真实合页，仅 macOS
"""
import argparse
import sys

from broadcast import serve
from sensors import FakeSource, PyBookLidSource, ReplaySource


def build_source(args):
    chosen = sum(bool(x) for x in (args.fake, args.replay))
    if chosen > 1:
        print("[bridge] --fake 和 --replay 只能选一个", file=sys.stderr)
        return None
    if args.replay:
        try:
            src = ReplaySource(args.replay)
        except (OSError, ValueError, RuntimeError) as e:
            print(f"[bridge] 打不开回放：{e}", file=sys.stderr)
            return None
        print(f"[bridge] 回放 {src.path}（{len(src._rows)} 行）")
        return src
    if args.fake:
        print("[bridge] --fake 模式：广播 0~130° 的来回扫动")
        return FakeSource()
    try:
        src = PyBookLidSource(args.hz)
    except RuntimeError as e:
        print(f"[bridge] 传感器不可用：\n{e}\n", file=sys.stderr)
        print(
            "[bridge] 可先用  python3 bridge.py --fake  测试网页，"
            "或直接用网页上的滑块。更多排查见 README.md。",
            file=sys.stderr,
        )
        return None
    print("[bridge] 已连接 pybooklid 传感器")
    return src


def main():
    p = argparse.ArgumentParser(description="MacBook 盖角 -> WebSocket 桥")
    p.add_argument("--fake", action="store_true", help="不读传感器，广播来回扫动的假角度")
    p.add_argument("--replay", default="", help="重放 JSONL：每行 {\"t\":秒,\"angle\":度}")
    p.add_argument("--host", default="localhost", help="监听地址，默认 localhost")
    p.add_argument("--port", type=int, default=8765, help="WebSocket 端口，默认 8765")
    p.add_argument("--http-port", type=int, default=8766, help="健康检查 HTTP 端口，默认 8766")
    p.add_argument("--hz", type=float, default=45, help="广播频率，默认 45 (建议 30~60)")
    p.add_argument("--offset", type=float, default=0.0, help="给角度加偏移（校准用），默认 0")
    p.add_argument("--clamp", type=float, default=180.0, help="最大角度上限，默认 180（网页自己会限制到 130）")
    p.add_argument("--smooth", type=float, default=0.0, help="低通平滑系数 0~0.95，默认 0（不平滑）")
    args = p.parse_args()
    args.hz = min(max(args.hz, 5), 120)
    source = build_source(args)
    if source is None:
        sys.exit(2 if not args.fake and not args.replay else 1)
    sys.exit(serve(source, args))


if __name__ == "__main__":
    main()
