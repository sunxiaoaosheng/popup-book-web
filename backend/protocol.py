"""合页角度流 v1 的编码。解析在网页 frontend/js/protocol.js，两边的字段名以 docs/PROTOCOL.md 为准。"""

PROTOCOL_VERSION = 1


def _with_mode(body, mode):
    if mode:
        body["mode"] = mode
    return body


def _optional_weight(weight):
    """归一化静置力度。None 表示这一帧不带该字段。非法值也省略，不当成 0。"""
    if weight is None:
        return None
    try:
        w = float(weight)
    except (TypeError, ValueError):
        return None
    if w != w or w == float("inf") or w == float("-inf"):
        return None
    if w < 0.0:
        w = 0.0
    if w > 1.0:
        w = 1.0
    return round(w, 2)


def angle_frame(seq, t_ms, angle, mode=None, weight=None):
    body = {
        "v": PROTOCOL_VERSION,
        "seq": int(seq),
        "t": round(float(t_ms), 1),
        "type": "angle",
        "angle": round(float(angle), 2),
    }
    w = _optional_weight(weight)
    if w is not None:
        body["weight"] = w
    return _with_mode(body, mode)


def heartbeat_frame(seq, t_ms, mode=None):
    return _with_mode({
        "v": PROTOCOL_VERSION,
        "seq": int(seq),
        "t": round(float(t_ms), 1),
        "type": "heartbeat",
    }, mode)


def health_body(mode, clients, last_angle, last_angle_age_ms, seq, hz):
    return {
        "ok": True,
        "v": PROTOCOL_VERSION,
        "mode": mode,
        "clients": int(clients),
        "lastAngle": None if last_angle is None else round(float(last_angle), 2),
        "lastAngleAgeMs": None if last_angle_age_ms is None else int(last_angle_age_ms),
        "seq": int(seq),
        "hz": hz,
    }
