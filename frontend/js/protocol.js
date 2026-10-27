/**
 * 合页角度流，协议版本 1。纯解析，不碰 WebSocket。
 * 字段说明见 docs/PROTOCOL.md。未知字段忽略；旧的 {"angle": n} 仍接受。
 */

export const PROTOCOL_VERSION = 1;
/** 超过这么久没有新的角度帧，界面从「已连接」变成「过期」。 */
export const STALE_MS = 1500;

/**
 * @typedef {'angle'|'heartbeat'} FrameType
 * @typedef {Object} AngleFrame
 * @property {number} v 0 表示没有版本号的旧帧
 * @property {FrameType} type
 * @property {number|null} angle 心跳帧为 null
 * @property {number|null} seq
 * @property {number|null} t 桥进程内的单调毫秒
 * @property {boolean} legacy
 */

/**
 * @param {string} raw
 * @returns {AngleFrame|null}
 */
export function parseAngleMessage(raw) {
  /** @type {unknown} */
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const obj = /** @type {Record<string, unknown>} */ (data);
  const v = Number.isInteger(obj.v) ? /** @type {number} */ (obj.v) : 0;
  const seq = typeof obj.seq === 'number' && Number.isFinite(obj.seq) ? obj.seq : null;
  const t = typeof obj.t === 'number' && Number.isFinite(obj.t) ? obj.t : null;
  const declared = typeof obj.type === 'string' ? obj.type : '';
  const angleOk = typeof obj.angle === 'number' && Number.isFinite(obj.angle);
  const legacy = obj.v == null && obj.seq == null && obj.t == null && obj.type == null;

  if (declared === 'heartbeat') {
    return { v, type: 'heartbeat', angle: null, seq, t, legacy: false };
  }
  if (declared === 'angle' || (declared === '' && angleOk) || (declared !== '' && declared !== 'angle' && angleOk)) {
    if (!angleOk) return null;
    return { v, type: 'angle', angle: /** @type {number} */ (obj.angle), seq, t, legacy };
  }
  return null;
}

/**
 * @param {boolean} open
 * @param {number} lastAngleAt 本机 performance.now()；0 表示还没收到角度
 * @param {number} now
 * @param {number} [staleMs]
 * @returns {'down'|'wait'|'live'|'stale'}
 */
export function linkState(open, lastAngleAt, now, staleMs = STALE_MS) {
  if (!open) return 'down';
  if (!lastAngleAt) return 'wait';
  if (now - lastAngleAt <= staleMs) return 'live';
  return 'stale';
}

/** 同一条连接上丢掉 seq 不前进的帧。没有 seq 的旧帧一律收下。重连后要 reset。 */
export function createSeqGate() {
  /** @type {number|null} */
  let last = null;
  return {
    /** @param {AngleFrame} frame */
    accept(frame) {
      if (frame.seq == null) return true;
      if (last != null && frame.seq <= last) return false;
      last = frame.seq;
      return true;
    },
    reset() {
      last = null;
    },
  };
}
