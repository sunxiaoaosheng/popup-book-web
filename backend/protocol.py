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


# 已经分好类的轻拍。力度是 0–1，不带采样或波形。
TAP_KINDS = ("slap", "double-knock", "triple-knock")


def tap_frame(seq, t_ms, kind, strength, mode=None):
    if kind not in TAP_KINDS:
        raise ValueError(f"unknown tap kind: {kind}")
    try:
        s = float(strength)
    except (TypeError, ValueError) as e:
        raise ValueError("tap strength must be a number") from e
    if s != s:
        raise ValueError("tap strength must be finite")
    s = 0.0 if s < 0 else 1.0 if s > 1 else s
    return _with_mode({
        "v": PROTOCOL_VERSION,
        "seq": int(seq),
        "t": round(float(t_ms), 1),
        "type": "tap",
        "kind": kind,
        "strength": round(s, 3),
    }, mode)


def tap_frames_from(taps, seq, t_ms, mode=None):
    """把分类后的轻拍收成帧。未知 kind、坏力度、波形字段都丢掉。"""
    frames = []
    for tap in taps or []:
        if not isinstance(tap, dict):
            continue
        kind = tap.get("kind")
        if kind not in TAP_KINDS:
            continue
        try:
            frame = tap_frame(seq + 1, t_ms, kind, tap.get("strength"), mode)
        except (TypeError, ValueError):
            continue
        seq = frame["seq"]
        frames.append(frame)
    return seq, frames


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
