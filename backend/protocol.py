"""合页角度流 v1 的编码。解析在网页 frontend/js/protocol.js，两边的字段名以 docs/PROTOCOL.md 为准。"""

PROTOCOL_VERSION = 1


def _with_mode(body, mode):
    if mode:
        body["mode"] = mode
    return body


def angle_frame(seq, t_ms, angle, mode=None):
    return _with_mode({
        "v": PROTOCOL_VERSION,
        "seq": int(seq),
        "t": round(float(t_ms), 1),
        "type": "angle",
        "angle": round(float(angle), 2),
    }, mode)


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
