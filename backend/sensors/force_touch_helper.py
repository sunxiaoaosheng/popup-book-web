#!/usr/bin/env python3
"""
Force Touch 触控板的静置力度，独立进程。

stdout 每行一个 0..1 的数，大约 4Hz。没有框架、没有设备、或不是 macOS：
什么都不打印，退出码 0。父进程据此省略 weight，合页广播不受影响。

zTotal 来自私有 MultitouchSupport，布局未在真机上核对。读崩了只死这个进程。
"""

import sys
import time

# 按实大约落在这个量级附近。页面只看稳定与否，不把这个数显示成克。
REST_FULL = 8.0


def main():
    if sys.platform != "darwin":
        return 0
    try:
        return _run()
    except Exception:
        return 0


def _run():
    import ctypes

    mt = ctypes.CDLL("/System/Library/PrivateFrameworks/MultitouchSupport.framework/MultitouchSupport")
    cf = ctypes.CDLL("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation")

    class MTPoint(ctypes.Structure):
        _fields_ = [("x", ctypes.c_float), ("y", ctypes.c_float)]

    class MTVector(ctypes.Structure):
        _fields_ = [("position", MTPoint), ("velocity", MTPoint)]

    class MTTouch(ctypes.Structure):
        _fields_ = [
            ("frame", ctypes.c_int),
            ("timestamp", ctypes.c_double),
            ("identifier", ctypes.c_int),
            ("state", ctypes.c_int),
            ("unknown1", ctypes.c_int),
            ("unknown2", ctypes.c_int),
            ("normalized", MTVector),
            ("size", ctypes.c_float),
            ("unknown3", ctypes.c_int),
            ("angle", ctypes.c_float),
            ("major_axis", ctypes.c_float),
            ("minor_axis", ctypes.c_float),
            ("absolute", MTVector),
            ("unknown4", ctypes.c_int),
            ("unknown5", ctypes.c_int),
            ("zTotal", ctypes.c_float),
            ("unknown6", ctypes.c_int),
            ("unknown7", ctypes.c_int),
            ("unknown8", ctypes.c_float),
        ]

    mt.MTDeviceCreateList.restype = ctypes.c_void_p
    cf.CFArrayGetCount.argtypes = [ctypes.c_void_p]
    cf.CFArrayGetCount.restype = ctypes.c_long
    cf.CFArrayGetValueAtIndex.argtypes = [ctypes.c_void_p, ctypes.c_long]
    cf.CFArrayGetValueAtIndex.restype = ctypes.c_void_p

    callback_type = ctypes.CFUNCTYPE(
        None,
        ctypes.c_void_p,
        ctypes.POINTER(MTTouch),
        ctypes.c_int,
        ctypes.c_double,
        ctypes.c_int,
    )
    mt.MTRegisterContactFrameCallback.argtypes = [ctypes.c_void_p, callback_type, ctypes.c_void_p]
    mt.MTRegisterContactFrameCallback.restype = None
    mt.MTDeviceStart.argtypes = [ctypes.c_void_p, ctypes.c_int]
    mt.MTDeviceStart.restype = None
    mt.MTDeviceStop.argtypes = [ctypes.c_void_p]
    mt.MTDeviceStop.restype = None

    devices = mt.MTDeviceCreateList()
    if not devices:
        return 0
    count = cf.CFArrayGetCount(devices)
    if count <= 0:
        return 0

    latest = {"z": 0.0, "at": 0.0}

    def on_frame(_device, touches, n, _timestamp, _frame):
        try:
            z = 0.0
            limit = n if 0 < n <= 12 else 0
            for i in range(limit):
                z = max(z, float(touches[i].zTotal))
            latest["z"] = z
            latest["at"] = time.monotonic()
        except Exception:
            return None

    callback = callback_type(on_frame)
    started = []
    for i in range(count):
        dev = cf.CFArrayGetValueAtIndex(devices, i)
        if not dev:
            continue
        try:
            mt.MTRegisterContactFrameCallback(dev, callback, None)
            mt.MTDeviceStart(dev, 0)
        except Exception:
            continue
        started.append(dev)
    if not started:
        return 0

    smooth = None
    try:
        while True:
            time.sleep(0.25)
            age = time.monotonic() - latest["at"]
            z = 0.0 if age > 0.35 else max(0.0, latest["z"])
            norm = 0.0 if z <= 0.0 else min(1.0, z / REST_FULL)
            smooth = norm if smooth is None else smooth * 0.6 + norm * 0.4
            if smooth < 0.004:
                smooth = 0.0
            sys.stdout.write(f"{smooth:.3f}\n")
            sys.stdout.flush()
    except KeyboardInterrupt:
        return 0
    finally:
        for dev in started:
            try:
                mt.MTDeviceStop(dev)
            except Exception:
                pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
