"""触控板短轻点。网页可选地请桥做一下，做不到就返回 False。

没有旋钮，也没有音量。`gain` / `volume` / `knob` 就算写在消息里也不读。
"""

import json
import sys

_tap = None
_tried = False


def parse_client_frame(raw):
    """只认固定的一下轻点。其它客户端文本，包括角度和旋钮，都丢掉。"""
    if isinstance(raw, (bytes, bytearray)):
        try:
            raw = raw.decode("utf-8")
        except UnicodeError:
            return None
    if not isinstance(raw, str) or not raw:
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict) or data.get("type") != "haptic":
        return None
    if data.get("pattern", "tap") != "tap":
        return None
    return {"type": "haptic", "pattern": "tap"}


def handle_client_text(raw, pulse):
    """是轻点就调用 pulse。pulse 失败或消息不认识，都返回 False，不抛。"""
    if parse_client_frame(raw) is None:
        return False
    try:
        return bool(pulse())
    except Exception:
        return False


def load_trackpad_tap():
    """macOS 的触控板轻点。其它系统、或框架不在，返回 None。"""
    if sys.platform != "darwin":
        return None
    try:
        return _darwin_tap()
    except Exception:
        return None


def pulse_trackpad():
    """做一下固定的短轻点。设备不在时返回 False，不反复尝试加载。"""
    global _tap, _tried
    if not _tried:
        _tried = True
        _tap = load_trackpad_tap()
    if _tap is None:
        return False
    try:
        _tap()
        return True
    except Exception:
        _tap = None
        return False


def _darwin_tap():
    import ctypes
    import ctypes.util

    objc_path = ctypes.util.find_library("objc")
    appkit_path = ctypes.util.find_library("AppKit")
    if not objc_path or not appkit_path:
        return None
    objc = ctypes.cdll.LoadLibrary(objc_path)
    ctypes.cdll.LoadLibrary(appkit_path)

    objc.objc_getClass.restype = ctypes.c_void_p
    objc.objc_getClass.argtypes = [ctypes.c_char_p]
    objc.sel_registerName.restype = ctypes.c_void_p
    objc.sel_registerName.argtypes = [ctypes.c_char_p]

    cls = objc.objc_getClass(b"NSHapticFeedbackManager")
    if not cls:
        return None
    default = objc.sel_registerName(b"defaultPerformer")
    objc.objc_msgSend.restype = ctypes.c_void_p
    objc.objc_msgSend.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
    performer = objc.objc_msgSend(cls, default)
    if not performer:
        return None
    # NSHapticFeedbackPatternGeneric = 0，NSHapticFeedbackPerformanceTimeNow = 1。
    perform = objc.sel_registerName(b"performFeedbackPattern:performanceTime:")

    def tap(send=objc.objc_msgSend, who=performer, sel=perform):
        send.restype = ctypes.c_void_p
        send.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_long, ctypes.c_long]
        send(who, sel, 0, 1)

    return tap
