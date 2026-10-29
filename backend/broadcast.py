"""
薄广播：从一个 AngleSource 读角度，按协议 v1 推给所有 WebSocket 客户端，并维护 /health。
平滑、偏移、钳位在这里做，适配器只提供原始角度。
"""

import asyncio
import json
import sys
import time

from haptic import handle_client_text, pulse_trackpad
from health import Status, serve_health
from netbind import loopback_hosts
from protocol import angle_frame, heartbeat_frame, tap_frames_from
from sensors.ambient import read_source_light

try:
    import websockets
except ImportError:
    sys.exit("缺少 websockets：请先 pip install websockets")


def _send_taps(source, seq, t_ms, broadcast, status):
    """把适配器已经分好类的轻拍发出去。波形不会出现在帧里。"""
    pull = getattr(source, "pull_taps", None)
    if not callable(pull):
        return seq
    try:
        pulled = pull()
    except Exception as e:
        print(f"[bridge] 轻拍读取失败：{e}", file=sys.stderr)
        return seq
    stamp = t_ms() if callable(t_ms) else t_ms
    seq, frames = tap_frames_from(pulled, seq, stamp, getattr(source, "mode", None))
    for frame in frames:
        broadcast(json.dumps(frame))
        status.note_seq(frame["seq"])
    return seq


def serve(source, args):
    """阻塞直到进程退出。返回进程退出码。"""
    try:
        return asyncio.run(_run(source, args)) or 0
    except KeyboardInterrupt:
        print("\n[bridge] 已退出")
        return 0
    finally:
        source.close()


async def _run(source, args):
    status = Status(source.mode, args.hz)
    if serve_health(args.host, args.http_port, status) is None:
        return 1

    clients = set()
    boot = time.monotonic()

    def t_ms():
        return (time.monotonic() - boot) * 1000

    async def handler(ws, *_):
        clients.add(ws)
        status.set_clients(len(clients))
        print(f"[bridge] 网页已连接 ({len(clients)} 个客户端)")
        try:
            async for raw in ws:
                # 不认识的文本丢掉。轻点做不到时也不许把这条连接拆掉。
                try:
                    handle_client_text(raw, pulse_trackpad)
                except Exception:
                    pass
        except Exception:
            pass
        finally:
            clients.discard(ws)
            status.set_clients(len(clients))
            print(f"[bridge] 网页已断开 ({len(clients)} 个客户端)")

    try:
        from websockets.asyncio.server import serve as ws_serve
    except ImportError:
        ws_serve = websockets.serve

    def broadcast(msg):
        if not clients:
            return
        try:
            websockets.broadcast(set(clients), msg)
        except AttributeError:
            dead = []
            for c in list(clients):
                try:
                    asyncio.ensure_future(c.send(msg))
                except Exception:
                    dead.append(c)
            for c in dead:
                clients.discard(c)
        except Exception as e:
            print(f"[bridge] 广播失败：{e}", file=sys.stderr)

    interval = 1.0 / args.hz
    smoothed = None
    last_print = 0.0
    no_data_warned = False
    seq = 0
    next_heart = time.monotonic()

    hosts = loopback_hosts(args.host)
    ws_host = hosts if len(hosts) > 1 else hosts[0]
    shown = ", ".join(f"ws://[{h}]:{args.port}" if ":" in h else f"ws://{h}:{args.port}" for h in hosts)
    async with ws_serve(handler, ws_host, args.port):
        print(f"[bridge] WebSocket 监听 {shown}  ({args.hz:g} Hz, {source.name})  Ctrl+C 退出")
        next_t = time.time()
        while True:
            raw = source.read()
            now = time.monotonic()
            if raw is None:
                if not no_data_warned:
                    print("[bridge] 暂时读不到有效角度（传感器无响应？）", file=sys.stderr)
                    no_data_warned = True
            else:
                no_data_warned = False
                a = raw + args.offset
                if args.smooth > 0:
                    smoothed = a if smoothed is None else smoothed + (a - smoothed) * (1 - args.smooth)
                    a = smoothed
                a = max(0.0, min(args.clamp, a))
                seq += 1
                frame = angle_frame(seq, t_ms(), a, source.mode, read_source_light(source))
                broadcast(json.dumps(frame))
                status.note_angle(a, seq)
                if time.time() - last_print > 1.0:
                    extra = ""
                    if "light" in frame:
                        extra = f"  light {frame['light']:.0f} lx"
                    print(f"[bridge] angle = {a:6.1f}°  (raw {raw:.1f}){extra}", end="\r", flush=True)
                    last_print = time.time()
            seq = _send_taps(source, seq, t_ms, broadcast, status)
            if now >= next_heart:
                seq += 1
                broadcast(json.dumps(heartbeat_frame(seq, t_ms(), source.mode)))
                status.note_seq(seq)
                next_heart = now + 1.0
            next_t += interval
            delay = next_t - time.time()
            if delay < -0.5:
                next_t = time.time()
                delay = 0
            await asyncio.sleep(max(0.0, delay))
