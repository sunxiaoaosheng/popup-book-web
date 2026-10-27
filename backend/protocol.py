"""合页角度流 v1 的编码。解析在网页 frontend/js/protocol.js，两边的字段名以 docs/PROTOCOL.md 为准。"""

PROTOCOL_VERSION = 1


def angle_frame(seq, t_ms, angle):
    return {
        "v": PROTOCOL_VERSION,
        "seq": int(seq),
        "t": round(float(t_ms), 1),
        "type": "angle",
        "angle": round(float(angle), 2),
    }


def heartbeat_frame(seq, t_ms):
    return {
        "v": PROTOCOL_VERSION,
        "seq": int(seq),
        "t": round(float(t_ms), 1),
        "type": "heartbeat",
    }


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
